import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { PaymentMethod, PaymentStatus, WalletTransactionType } from '../src/common/enums';
import { DatabaseModule } from '../src/database/database.module';
import { ENTITIES, User } from '../src/database/entities';
import { FinancialOperationsModule } from '../src/financial-operations/financial-operations.module';
import { FinancialOperationsService } from '../src/financial-operations/financial-operations.service';
import { PaymentsModule } from '../src/payments/payments.module';
import { PaymentsService } from '../src/payments/payments.service';
import { WalletsModule } from '../src/wallets/wallets.module';
import { WalletsService } from '../src/wallets/wallets.service';

describe('financial concurrency (Postgres)', () => {
  let moduleRef: any;
  let dataSource: DataSource;
  let walletsService: any;
  let paymentsService: any;
  let financialOpsService: any;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://evzone:evzone@localhost:5432/evzone';
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: databaseUrl,
          entities: [...ENTITIES],
          synchronize: false,
          migrationsRun: true,
          logging: false,
        }),
        DatabaseModule,
        WalletsModule,
        PaymentsModule,
        FinancialOperationsModule,
      ],
    })
      .overrideProvider(EventEmitter2)
      .useValue({ emit: jest.fn(), emitAsync: jest.fn(), removeAllListeners: jest.fn() })
      .compile();

    walletsService = moduleRef.get(WalletsService);
    paymentsService = moduleRef.get(PaymentsService);
    financialOpsService = moduleRef.get(FinancialOperationsService);
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM earnings_ledger WHERE "userId" LIKE 'test-%'`);
    await dataSource.query(
      `DELETE FROM ledger_entries WHERE "journalId" IN (SELECT id::text FROM journal_transactions WHERE reference LIKE 'WALLET-TEST-%')`,
    );
    await dataSource.query(`DELETE FROM ledger_accounts WHERE code LIKE 'WALLET:UGX:test-%'`);
    await dataSource.query(`DELETE FROM journal_transactions WHERE reference LIKE 'WALLET-TEST-%'`);
    await dataSource.query(`DELETE FROM wallet_transactions WHERE reference LIKE 'TEST-%'`);
    await dataSource.query(`DELETE FROM payouts WHERE reference LIKE 'TEST-%'`);
    await dataSource.query(`DELETE FROM cashout_requests WHERE "userId" LIKE 'test-%'`);
    await dataSource.query(`DELETE FROM payments WHERE "userId" LIKE 'test-%'`);
    await dataSource.query(`DELETE FROM wallets WHERE "userId" LIKE 'test-%'`);
    await dataSource.query(`DELETE FROM users WHERE email LIKE 'test-recipient-%@example.com'`);
  });

  it('prevents concurrent debits from overdrawing a wallet', async () => {
    const userId = `test-debit-${randomUUID()}`;
    await walletsService.credit(userId, 1_000, WalletTransactionType.TOP_UP, `TEST-CREDIT-${userId}`);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map((_, i) =>
        walletsService.debit(userId, 300, WalletTransactionType.PAYMENT, `TEST-DEBIT-${userId}-${i}`),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled').length;
    expect(successes).toBe(3);

    const wallet = await walletsService.get(userId);
    expect(Number(wallet.availableBalance)).toBe(100);
  });

  it('prevents concurrent transfers from overdrawing a wallet', async () => {
    const senderId = `test-transfer-sender-${randomUUID()}`;
    const recipientEmail = `test-recipient-${randomUUID()}@example.com`;
    const usersRepo = dataSource.getRepository(User);
    const recipient = await usersRepo.save(
      usersRepo.create({
        email: recipientEmail,
        phone: `2567${Date.now()}`,
        firstName: 'Test',
        lastName: 'Recipient',
        passwordHash: 'hash',
      }),
    );

    await walletsService.credit(senderId, 1_000, WalletTransactionType.TOP_UP, `TEST-CREDIT-${senderId}`);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map((_, i) =>
        walletsService.transfer(senderId, recipientEmail, 300, `TEST-TRANSFER-${i}`),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled').length;
    expect(successes).toBe(3);

    const senderWallet = await walletsService.get(senderId);
    const recipientWallet = await walletsService.get(recipient.id);
    expect(Number(senderWallet.availableBalance)).toBe(100);
    expect(Number(recipientWallet.availableBalance)).toBe(900);
  });

  it('deduplicates concurrent payment confirmations for wallet payments', async () => {
    const userId = `test-confirm-${randomUUID()}`;
    await walletsService.credit(userId, 10_000, WalletTransactionType.TOP_UP, `TEST-CREDIT-${userId}`);

    const payment = await paymentsService.createIntent(
      userId,
      {
        serviceType: 'SCHOOL_SHUTTLE' as any,
        serviceId: randomUUID(),
        method: PaymentMethod.EVZONE_WALLET,
      },
      { ownerUserId: userId, amount: 5_000, currency: 'UGX', paymentStatus: PaymentStatus.PENDING },
    );

    const results = await Promise.allSettled(
      Array.from({ length: 3 }).map(() => paymentsService.confirm(userId, payment.id)),
    );

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const wallet = await walletsService.get(userId);
    expect(Number(wallet.availableBalance)).toBe(5_000);

    const updated = await paymentsService.list(userId);
    const updatedPayment = updated.items.find((p: any) => p.id === payment.id);
    expect(updatedPayment.status).toBe(PaymentStatus.PAID);
  });

  it('prevents concurrent refunds from exceeding the payment amount', async () => {
    const userId = `test-refund-${randomUUID()}`;
    const payment = await paymentsService.createIntent(
      userId,
      {
        serviceType: 'SCHOOL_SHUTTLE' as any,
        serviceId: randomUUID(),
        method: PaymentMethod.CASH,
      },
      { ownerUserId: userId, amount: 1_000, currency: 'UGX', paymentStatus: PaymentStatus.PENDING },
    );

    await paymentsService.confirm(userId, payment.id);

    const results = await Promise.allSettled(
      Array.from({ length: 2 }).map(() => paymentsService.refund(userId, payment.id, 600)),
    );

    const successes = results.filter((r) => r.status === 'fulfilled').length;
    expect(successes).toBe(1);

    const updated = await paymentsService.list(userId);
    const updatedPayment = updated.items.find((p: any) => p.id === payment.id);
    expect(updatedPayment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(Number(updatedPayment.refundedAmount)).toBe(600);
  });

  it('prevents concurrent cashout requests from over-reserving a wallet', async () => {
    const userId = `test-cashout-${randomUUID()}`;
    await walletsService.credit(userId, 1_000, WalletTransactionType.TOP_UP, `TEST-CREDIT-${userId}`);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map((_, i) =>
        financialOpsService.requestCashout(userId, {
          amount: 300,
          method: { phone: '256700000000' },
          idempotencyKey: `cashout-${userId}-${i}`,
        }),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled').length;
    expect(successes).toBe(3);

    const pending = await financialOpsService.listMyCashouts(userId);
    const totalReserved = pending
      .filter((c: any) => c.status === 'PENDING')
      .reduce((sum: number, c: any) => sum + Number(c.amount), 0);
    expect(totalReserved).toBe(900);
  });
});
