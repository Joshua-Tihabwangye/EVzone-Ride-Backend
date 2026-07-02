import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AccountingModule } from '../../src/accounting/accounting.module';
import { AuditLog } from '../../src/database/entities';
import { DatabaseModule } from '../../src/database/database.module';
import { ENTITIES } from '../../src/database/entities';
import { FinancialOperationsModule } from '../../src/financial-operations/financial-operations.module';
import { FinancialOperationsService } from '../../src/financial-operations/financial-operations.service';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentsService } from '../../src/payments/payments.service';
import { PayoutsModule } from '../../src/payouts/payouts.module';
import { WalletsModule } from '../../src/wallets/wallets.module';
import { WalletsService } from '../../src/wallets/wallets.service';
import { PaymentMethod, PaymentStatus, ServiceType } from '../../src/common/enums';

describe('Month 2 integration: financial lifecycle', () => {
  let app: INestApplication;
  let paymentsService: PaymentsService;
  let walletsService: WalletsService;
  let financialOpsService: FinancialOperationsService;
  let audits: Repository<AuditLog>;
  let dataSource: DataSource;

  const userId = 'month2-financial-user';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        TypeOrmModule.forRoot({
          type: 'sqljs',
          location: ':memory:',
          synchronize: true,
          entities: [...ENTITIES],
          logging: false,
        }),
        AccountingModule,
        PayoutsModule,
        WalletsModule,
        PaymentsModule,
        FinancialOperationsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    paymentsService = app.get(PaymentsService);
    walletsService = app.get(WalletsService);
    financialOpsService = app.get(FinancialOperationsService);
    dataSource = app.get(DataSource);
    audits = dataSource.getRepository(AuditLog);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM audit_logs');
    await dataSource.query('DELETE FROM wallet_transactions');
    await dataSource.query('DELETE FROM payouts');
    await dataSource.query('DELETE FROM cashout_requests');
    await dataSource.query('DELETE FROM payments');
    await dataSource.query('DELETE FROM wallets');
  });

  async function waitForAudit(
    action: string,
    entityId?: string,
    timeoutMs = 2000,
  ): Promise<AuditLog | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const where: Record<string, unknown> = { action };
      if (entityId) where.entityId = entityId;
      const found = await audits.findOne({ where, order: { createdAt: 'DESC' } });
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  it('creates, confirms and refunds a payment with audit trail', async () => {
    const intent = await paymentsService.createIntent(
      userId,
      {
        serviceType: ServiceType.SCHOOL_SHUTTLE,
        serviceId: 'school-month2-1',
        method: PaymentMethod.CASH,
      },
      {
        ownerUserId: userId,
        amount: 10_000,
        currency: 'UGX',
        paymentStatus: PaymentStatus.PENDING,
      },
    );

    const createdLog = await waitForAudit('PAYMENT_INTENT_CREATED', intent.id);
    expect(createdLog).toBeTruthy();
    expect(createdLog!.after).toMatchObject({ amount: 10_000, status: PaymentStatus.PENDING });

    const confirmed = await paymentsService.confirm(userId, intent.id);
    expect(confirmed.status).toBe(PaymentStatus.PAID);

    const confirmedLog = await waitForAudit('PAYMENT_CONFIRMED', intent.id);
    expect(confirmedLog).toBeTruthy();
    expect(confirmedLog!.changedFields).toContain('status');

    const refunded = await paymentsService.refund(userId, intent.id, 5_000, 'Customer request');
    expect(refunded.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);

    const refundLog = await waitForAudit('PAYMENT_REFUNDED', intent.id);
    expect(refundLog).toBeTruthy();
    expect(refundLog!.reason).toBe('Customer request');
  });

  it('requests and reviews a cashout with audit trail', async () => {
    await walletsService.topUp(userId, 20_000, 'EVZONE-DEMO-SUCCESS');

    const cashout = await financialOpsService.requestCashout(userId, {
      amount: 5_000,
      method: { phone: '256700000000' },
    });

    const requestLog = await waitForAudit('CASHOUT_REQUESTED', cashout.id);
    expect(requestLog).toBeTruthy();
    expect(requestLog!.after).toMatchObject({ amount: 5_000, status: 'PENDING' });

    const reviewed = await financialOpsService.reviewCashout(cashout.id, 'admin-1', { status: 'APPROVED' });

    const reviewLog = await waitForAudit('CASHOUT_APPROVED', reviewed.id);
    expect(reviewLog).toBeTruthy();
    expect(reviewLog!.actorUserId).toBe('admin-1');
  });
});
