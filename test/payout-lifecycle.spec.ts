import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AccountingModule } from '../src/accounting/accounting.module';
import { CashoutRequestStatus, PayoutStatus } from '../src/common/enums';
import { DatabaseModule } from '../src/database/database.module';
import { ENTITIES } from '../src/database/entities';
import { FinancialOperationsModule } from '../src/financial-operations/financial-operations.module';
import { FinancialOperationsService } from '../src/financial-operations/financial-operations.service';
import { PayoutOrchestratorService } from '../src/payouts/payout-orchestrator.service';
import { PayoutStatusService } from '../src/payouts/payout-status.service';
import { PayoutsModule } from '../src/payouts/payouts.module';
import { WalletsService } from '../src/wallets/wallets.service';

describe('Payout Lifecycle', () => {
  let moduleRef: TestingModule;
  let financialOps: FinancialOperationsService;
  let orchestrator: PayoutOrchestratorService;
  let statusService: PayoutStatusService;
  let wallets: WalletsService;
  let dataSource: DataSource;

  const userId = 'payout-test-user';

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        TypeOrmModule.forRoot({
          type: 'sqljs',
          entities: [...ENTITIES],
          synchronize: true,
          logging: false,
        }),
        AccountingModule,
        PayoutsModule,
        FinancialOperationsModule,
      ],
    }).compile();

    financialOps = moduleRef.get(FinancialOperationsService);
    orchestrator = moduleRef.get(PayoutOrchestratorService);
    statusService = moduleRef.get(PayoutStatusService);
    wallets = moduleRef.get(WalletsService);
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM wallet_transactions');
    await dataSource.query('DELETE FROM payouts');
    await dataSource.query('DELETE FROM cashout_requests');
    await dataSource.query('DELETE FROM wallets');
    await dataSource.query('DELETE FROM ledger_entries');
    await dataSource.query('DELETE FROM journal_transactions');
    await dataSource.query("DELETE FROM ledger_accounts WHERE code LIKE 'WALLET:%'");
  });

  async function seedWallet(amount = 10_000) {
    await wallets.topUp(userId, amount, 'EVZONE-DEMO-SUCCESS');
  }

  it('should reserve wallet balance when requesting a cashout', async () => {
    await seedWallet();
    const cashout = await financialOps.requestCashout(userId, {
      amount: 2_000,
      method: { phone: '256700000000' },
    });
    expect(cashout.status).toBe(CashoutRequestStatus.PENDING);
    const wallet = await wallets.get(userId);
    expect(wallet.availableBalance).toBe(8_000);
    expect(wallet.reservedForCashout).toBe(2_000);
  });

  it('should return the same cashout when using the same idempotency key', async () => {
    await seedWallet();
    const first = await financialOps.requestCashout(userId, {
      amount: 1_000,
      method: { phone: '256700000000' },
      idempotencyKey: 'same-key',
    });
    const second = await financialOps.requestCashout(userId, {
      amount: 1_000,
      method: { phone: '256700000000' },
      idempotencyKey: 'same-key',
    });
    expect(second.id).toBe(first.id);
    const wallet = await wallets.get(userId);
    expect(wallet.reservedForCashout).toBe(1_000);
  });

  it('should initiate a payout on review and complete on verification', async () => {
    await seedWallet();
    const cashout = await financialOps.requestCashout(userId, {
      amount: 3_000,
      method: { phone: '256700000000' },
    });

    const reviewed = await financialOps.reviewCashout(cashout.id, 'admin', { status: 'APPROVED' });
    expect(reviewed.status).toBe(CashoutRequestStatus.PROCESSING);

    const walletAfterInitiation = await wallets.get(userId);
    expect(walletAfterInitiation.reservedForCashout).toBe(0);
    expect(walletAfterInitiation.availableBalance).toBe(7_000);

    const payout = await orchestrator.findExistingPayout(cashout.id, cashout.reference);
    expect(payout).not.toBeNull();
    expect(payout!.status).toBe(PayoutStatus.PENDING);

    await statusService.verifyPayout(payout!.id);
    const completedPayout = await orchestrator.findExistingPayout(cashout.id, cashout.reference);
    expect(completedPayout!.status).toBe(PayoutStatus.COMPLETED);

    const finalCashout = await financialOps.listCashouts();
    const updated = finalCashout.find((item) => item.id === cashout.id);
    expect(updated!.status).toBe(CashoutRequestStatus.PAID);

    const walletAfterCompletion = await wallets.get(userId);
    expect(walletAfterCompletion.availableBalance).toBe(7_000);
    expect(walletAfterCompletion.reservedForCashout).toBe(0);
  });

  it('should not allow double review of a cashout', async () => {
    await seedWallet();
    const cashout = await financialOps.requestCashout(userId, {
      amount: 1_000,
      method: { phone: '256700000000' },
    });
    await financialOps.reviewCashout(cashout.id, 'admin', { status: 'APPROVED' });
    await expect(financialOps.reviewCashout(cashout.id, 'admin', { status: 'APPROVED' })).rejects.toThrow(
      /already reviewed|not pending/,
    );
  });

  it('should refund wallet when provider payout fails', async () => {
    process.env.MOCK_PAYOUT_FAIL_PATTERN = 'mock-fail';
    await seedWallet();
    const cashout = await financialOps.requestCashout(userId, {
      amount: 2_000,
      method: { phone: '256700000000' },
      idempotencyKey: 'mock-fail-request',
    });

    await financialOps.reviewCashout(cashout.id, 'admin', { status: 'APPROVED' });

    const failedPayout = await orchestrator.findExistingPayout(cashout.id, cashout.reference);
    expect(failedPayout).not.toBeNull();
    expect(failedPayout!.status).toBe(PayoutStatus.FAILED);

    const wallet = await wallets.get(userId);
    expect(wallet.availableBalance).toBe(10_000);
    expect(wallet.reservedForCashout).toBe(0);

    const updatedCashout = await financialOps.listCashouts();
    const record = updatedCashout.find((item) => item.id === cashout.id);
    expect(record!.status).toBe(CashoutRequestStatus.FAILED);

    delete process.env.MOCK_PAYOUT_FAIL_PATTERN;
  });

  it('should cancel a pending payout and refund the wallet', async () => {
    await seedWallet();
    const cashout = await financialOps.requestCashout(userId, {
      amount: 1_500,
      method: { phone: '256700000000' },
    });
    await financialOps.reviewCashout(cashout.id, 'admin', { status: 'APPROVED' });

    const payout = (await orchestrator.findExistingPayout(cashout.id, cashout.reference))!;
    expect(payout.status).toBe(PayoutStatus.PENDING);

    await orchestrator.cancelPayout(payout.id);

    const cancelled = await orchestrator.findExistingPayout(cashout.id, cashout.reference);
    expect(cancelled!.status).toBe(PayoutStatus.CANCELLED);

    const wallet = await wallets.get(userId);
    expect(wallet.availableBalance).toBe(10_000);
    expect(wallet.reservedForCashout).toBe(0);
  });
});
