import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DatabaseModule } from '../src/database/database.module';
import {
  CashoutRequest,
  EarningsLedger,
  ENTITIES,
  FinanceSettlementBatch,
  Payment,
  Payout,
  User,
  Wallet,
  WalletReconciliationReport,
  WalletTransaction,
} from '../src/database/entities';
import { AdminFinanceModule } from '../src/admin-finance/admin-finance.module';
import { AdminFinanceService } from '../src/admin-finance/admin-finance.service';
import { AdminFinanceController } from '../src/admin-finance/admin-finance.controller';
import { FinancialOperationsService } from '../src/financial-operations/financial-operations.service';
import { PayoutOrchestratorService } from '../src/payouts/payout-orchestrator.service';
import { PaymentsService } from '../src/payments/payments.service';
import { AuditService } from '../src/audit/audit.service';
import { BusinessMetricsService } from '../src/observability/metrics/business-metrics.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionGuard } from '../src/permissions/permission.guard';
import {
  AccountStatus,
  CashoutRequestStatus,
  PaymentMethod,
  PaymentStatus,
  PayoutStatus,
  ServiceType,
  TransactionDirection,
  UserRole,
  WalletTransactionType,
} from '../src/common/enums';
import { createBusinessMetricsMock } from './helpers/metrics.mock';

describe('Admin finance console', () => {
  let app: INestApplication;
  let service: AdminFinanceService;
  let dataSource: DataSource;
  let users: Repository<User>;
  let cashouts: Repository<CashoutRequest>;
  let payments: Repository<Payment>;
  let payouts: Repository<Payout>;
  let wallets: Repository<Wallet>;
  let walletTransactions: Repository<WalletTransaction>;
  let earnings: Repository<EarningsLedger>;
  let settlements: Repository<FinanceSettlementBatch>;
  let reconciliations: Repository<WalletReconciliationReport>;

  const financialOperationsMock = {
    reviewCashout: jest.fn(),
  };
  const payoutOrchestratorMock = {
    retryPayout: jest.fn(),
  };
  const paymentsServiceMock = {
    refund: jest.fn(),
  };
  const auditServiceMock = {
    record: jest.fn().mockResolvedValue({} as never),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRoot({
          type: 'sqljs',
          location: ':memory:',
          synchronize: true,
          entities: [...ENTITIES],
          logging: false,
        }),
        DatabaseModule,
        AdminFinanceModule,
      ],
    })
      .overrideProvider(FinancialOperationsService)
      .useValue(financialOperationsMock)
      .overrideProvider(PayoutOrchestratorService)
      .useValue(payoutOrchestratorMock)
      .overrideProvider(PaymentsService)
      .useValue(paymentsServiceMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(BusinessMetricsService)
      .useValue(createBusinessMetricsMock())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    service = app.get(AdminFinanceService);
    dataSource = app.get(DataSource);
    users = dataSource.getRepository(User);
    cashouts = dataSource.getRepository(CashoutRequest);
    payments = dataSource.getRepository(Payment);
    payouts = dataSource.getRepository(Payout);
    wallets = dataSource.getRepository(Wallet);
    walletTransactions = dataSource.getRepository(WalletTransaction);
    earnings = dataSource.getRepository(EarningsLedger);
    settlements = dataSource.getRepository(FinanceSettlementBatch);
    reconciliations = dataSource.getRepository(WalletReconciliationReport);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await dataSource.query('DELETE FROM wallet_reconciliation_reports');
    await dataSource.query('DELETE FROM finance_settlement_batches');
    await dataSource.query('DELETE FROM earnings_ledger');
    await dataSource.query('DELETE FROM wallet_transactions');
    await dataSource.query('DELETE FROM payouts');
    await dataSource.query('DELETE FROM payments');
    await dataSource.query('DELETE FROM cashout_requests');
    await dataSource.query('DELETE FROM wallets');
    await dataSource.query('DELETE FROM users');
  });

  async function seedUser(role = UserRole.ADMIN): Promise<User> {
    return users.save(
      users.create({
        email: `${role.toLowerCase()}-finance@example.com`,
        firstName: 'Test',
        lastName: 'User',
        role,
        status: AccountStatus.ACTIVE,
        passwordHash: 'hash',
      }),
    );
  }

  it('lists cashouts', async () => {
    const user = await seedUser();
    await cashouts.save(
      cashouts.create({
        userId: user.id,
        reference: 'CO-1',
        amount: 1000,
        currency: 'UGX',
        status: CashoutRequestStatus.PENDING,
        method: { phone: '0700000000' },
      }),
    );
    const result = await service.listCashouts({});
    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('reviews a cashout through the financial operations service', async () => {
    const user = await seedUser();
    const request = await cashouts.save(
      cashouts.create({
        userId: user.id,
        reference: 'CO-2',
        amount: 2000,
        currency: 'UGX',
        status: CashoutRequestStatus.PENDING,
        method: { phone: '0700000000' },
      }),
    );
    financialOperationsMock.reviewCashout.mockResolvedValue({ ...request, status: 'APPROVED' });

    const result = await service.reviewCashout(request.id, user.id, { status: 'APPROVED' });
    expect(financialOperationsMock.reviewCashout).toHaveBeenCalledWith(
      request.id,
      user.id,
      expect.objectContaining({ status: 'APPROVED' }),
    );
    expect(result.status).toBe('APPROVED');
  });

  it('refunds a payment through the payments service', async () => {
    const user = await seedUser();
    const payment = await payments.save(
      payments.create({
        userId: user.id,
        serviceType: ServiceType.RIDE,
        serviceId: 'ride-1',
        amount: 5000,
        currency: 'UGX',
        method: PaymentMethod.MOBILE_MONEY,
        status: PaymentStatus.PAID,
        reference: 'PAY-1',
      }),
    );
    paymentsServiceMock.refund.mockResolvedValue({ ...payment, status: PaymentStatus.REFUNDED });

    const result = await service.refundPayment(payment.id, user.id, {
      amount: 5000,
      reason: 'Customer complaint',
    });
    expect(paymentsServiceMock.refund).toHaveBeenCalledWith(
      user.id,
      payment.id,
      5000,
      'Customer complaint',
      undefined,
    );
    expect(result.status).toBe(PaymentStatus.REFUNDED);
  });

  it('retries a payout through the payout orchestrator', async () => {
    const user = await seedUser();
    const payout = await payouts.save(
      payouts.create({
        driverId: user.id,
        reference: 'PO-1',
        idempotencyKey: 'PO-1',
        amount: 3000,
        currency: 'UGX',
        status: PayoutStatus.FAILED,
        provider: 'mock',
        destination: '0700000000',
      }),
    );
    payoutOrchestratorMock.retryPayout.mockResolvedValue({ ...payout, status: PayoutStatus.COMPLETED });

    const result = await service.retryPayout(payout.id, user.id);
    expect(payoutOrchestratorMock.retryPayout).toHaveBeenCalledWith(payout.id);
    expect(result.status).toBe(PayoutStatus.COMPLETED);
  });

  it('aggregates revenue summary', async () => {
    const user = await seedUser();
    await payments.save(
      payments.create({
        userId: user.id,
        serviceType: ServiceType.RIDE,
        serviceId: 'ride-2',
        amount: 10000,
        currency: 'UGX',
        method: PaymentMethod.MOBILE_MONEY,
        status: PaymentStatus.PAID,
        reference: 'PAY-2',
        paidAt: new Date(),
      }),
    );
    await earnings.save(
      earnings.create({
        userId: user.id,
        journalId: 'journal-1',
        grossAmount: 10000,
        platformFee: 2000,
        netAmount: 8000,
        currency: 'UGX',
      }),
    );
    await payouts.save(
      payouts.create({
        driverId: user.id,
        reference: 'PO-2',
        idempotencyKey: 'PO-2',
        amount: 8000,
        currency: 'UGX',
        status: PayoutStatus.COMPLETED,
        provider: 'mock',
        destination: '0700000000',
      }),
    );

    const result = await service.revenueSummary({});
    expect(result.totalRevenue).toBe(10000);
    expect(result.grossEarnings).toBe(10000);
    expect(result.platformFees).toBe(2000);
    expect(result.totalPayouts).toBe(8000);
  });

  it('creates, posts and cancels settlement batches', async () => {
    const user = await seedUser();
    const created = await service.createSettlementBatch(user.id, {
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      currency: 'UGX',
      totalAmount: 50000,
      totalCount: 10,
    });
    expect(created.status).toBe('PENDING');

    const posted = await service.postSettlementBatch(created.id, user.id);
    expect(posted.status).toBe('POSTED');
    expect(posted.postedByUserId).toBe(user.id);

    const cancelledBatch = await service.createSettlementBatch(user.id, {
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });
    const cancelled = await service.cancelSettlementBatch(cancelledBatch.id, user.id);
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('creates a wallet reconciliation report', async () => {
    const user = await seedUser();
    const wallet = await wallets.save(wallets.create({ userId: user.id, currency: 'UGX' }));
    await walletTransactions.save(
      walletTransactions.create({
        walletId: wallet.id,
        type: WalletTransactionType.TOP_UP,
        direction: TransactionDirection.CREDIT,
        amount: 15000,
        balanceAfter: 15000,
        reference: 'TX-1',
      }),
    );

    const result = await service.createWalletReconciliation(user.id, {
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      type: 'WALLET',
      currency: 'UGX',
    });
    expect(result.status).toBe('COMPLETED');
    expect(result.totalWalletTransactions).toBe(1);
    expect(Number(result.totalWalletAmount)).toBe(15000);
  });

  it('rejects non-admin/support roles at controller level', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler = AdminFinanceController.prototype.listCashouts;

    const context = {
      getHandler: () => handler,
      getClass: () => AdminFinanceController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.CUSTOMER } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows admin role at controller level', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler = AdminFinanceController.prototype.listCashouts;

    const context = {
      getHandler: () => handler,
      getClass: () => AdminFinanceController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.ADMIN } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('enforces finance permissions through PermissionGuard', () => {
    const reflector = new Reflector();
    const guard = new PermissionGuard(reflector);
    const handler = AdminFinanceController.prototype.createSettlement;

    const context = {
      getHandler: () => handler,
      getClass: () => AdminFinanceController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { role: UserRole.SUPPORT, activeOrganizationId: 'org-1', permissions: [] },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow();
  });
});
