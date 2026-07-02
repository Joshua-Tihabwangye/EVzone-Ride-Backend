import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { BusinessMetricsService } from '../observability/metrics/business-metrics.service';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { PayoutOrchestratorService } from '../payouts/payout-orchestrator.service';
import { PaymentsService } from '../payments/payments.service';
import { ReviewCashoutRequestDto } from '../financial-operations/financial-operations.dto';
import {
  CashoutRequest,
  DriverProfile,
  EarningsLedger,
  FinanceSettlementBatch,
  JournalTransaction,
  Payment,
  Payout,
  Wallet,
  WalletReconciliationReport,
  WalletTransaction,
} from '../database/entities';
import { PaymentStatus, PayoutStatus } from '../common/enums';
import {
  AdminFinanceListQueryDto,
  CreateSettlementBatchDto,
  CreateWalletReconciliationDto,
  RefundPaymentAdminDto,
  ReviewCashoutAdminDto,
} from './admin-finance.dto';

@Injectable()
export class AdminFinanceService {
  private readonly logger = new Logger(AdminFinanceService.name);

  constructor(
    @InjectRepository(CashoutRequest) private readonly cashouts: Repository<CashoutRequest>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(WalletTransaction) private readonly walletTransactions: Repository<WalletTransaction>,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(EarningsLedger) private readonly earnings: Repository<EarningsLedger>,
    @InjectRepository(JournalTransaction) private readonly journals: Repository<JournalTransaction>,
    @InjectRepository(FinanceSettlementBatch)
    private readonly settlements: Repository<FinanceSettlementBatch>,
    @InjectRepository(WalletReconciliationReport)
    private readonly reconciliations: Repository<WalletReconciliationReport>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    private readonly financialOperations: FinancialOperationsService,
    private readonly payoutOrchestrator: PayoutOrchestratorService,
    private readonly paymentsService: PaymentsService,
    private readonly auditService: AuditService,
    private readonly businessMetrics: BusinessMetricsService,
  ) {}

  private dateRange(where: Record<string, unknown>, from?: string, to?: string, field = 'createdAt') {
    if (from || to) {
      where[field] = Between(from ? new Date(from) : new Date(0), to ? new Date(to) : new Date());
    }
    return where;
  }

  private paginate(page = 1, limit = 20) {
    const p = Math.max(page, 1);
    const l = Math.min(Math.max(limit, 1), 250);
    return { skip: (p - 1) * l, take: l };
  }

  async listCashouts(query: AdminFinanceListQueryDto) {
    const where = this.dateRange({}, query.from, query.to);
    if (query.status) where.status = query.status;
    const { skip, take } = this.paginate(query.page, query.limit);
    const [items, total] = await this.cashouts.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { items, meta: { page: query.page ?? 1, limit: take, total, pageCount: Math.ceil(total / take) } };
  }

  async getCashout(id: string) {
    const item = await this.cashouts.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Cashout request not found');
    return item;
  }

  async reviewCashout(id: string, reviewerId: string, dto: ReviewCashoutAdminDto) {
    const before = await this.getCashout(id);
    const reviewDto: ReviewCashoutRequestDto = {
      status: dto.status as 'APPROVED' | 'REJECTED',
      reason: dto.reason,
      provider: dto.provider,
    };
    const result = await this.financialOperations.reviewCashout(id, reviewerId, reviewDto);
    void this.auditService
      .record({
        actorUserId: reviewerId,
        action: `CASHOUT_${dto.status.toUpperCase()}`,
        entityType: 'CashoutRequest',
        entityId: id,
        before: { ...before },
        after: { ...result },
        reason: dto.reason,
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    this.businessMetrics.recordCashoutApproved();
    return result;
  }

  async listPayouts(query: AdminFinanceListQueryDto) {
    const where = this.dateRange({}, query.from, query.to);
    if (query.status) where.status = query.status;
    const { skip, take } = this.paginate(query.page, query.limit);
    const [items, total] = await this.payouts.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { items, meta: { page: query.page ?? 1, limit: take, total, pageCount: Math.ceil(total / take) } };
  }

  async getPayout(id: string) {
    const item = await this.payouts.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Payout not found');
    return item;
  }

  async retryPayout(id: string, actorUserId: string) {
    const before = await this.getPayout(id);
    const result = await this.payoutOrchestrator.retryPayout(id);
    void this.auditService
      .record({
        actorUserId,
        action: 'PAYOUT_RETRIED',
        entityType: 'Payout',
        entityId: id,
        before: { ...before },
        after: { ...result },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    this.businessMetrics.recordPayoutCompleted();
    return result;
  }

  async listPayments(query: AdminFinanceListQueryDto) {
    const where = this.dateRange({}, query.from, query.to);
    if (query.status) where.status = query.status;
    const { skip, take } = this.paginate(query.page, query.limit);
    const [items, total] = await this.payments.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { items, meta: { page: query.page ?? 1, limit: take, total, pageCount: Math.ceil(total / take) } };
  }

  async refundPayment(paymentId: string, actorUserId: string, dto: RefundPaymentAdminDto) {
    const before = await this.payments.findOne({ where: { id: paymentId } });
    if (!before) throw new NotFoundException('Payment not found');
    const result = await this.paymentsService.refund(
      actorUserId,
      paymentId,
      dto.amount,
      dto.reason,
      dto.idempotencyKey,
    );
    void this.auditService
      .record({
        actorUserId,
        action: 'PAYMENT_REFUNDED',
        entityType: 'Payment',
        entityId: paymentId,
        before: { ...before },
        after: { ...result },
        reason: dto.reason,
        metadata: { refundAmount: dto.amount },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return result;
  }

  async revenueSummary(query: AdminFinanceListQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const dateFilter = from || to ? Between(from ?? new Date(0), to ?? new Date()) : undefined;

    const [paidPayments, refundedPayments, earnings, payouts] = await Promise.all([
      this.payments.find({
        where: { status: PaymentStatus.PAID, ...(dateFilter ? { paidAt: dateFilter } : {}) },
      }),
      this.payments.find({
        where: [
          { status: PaymentStatus.REFUNDED, ...(dateFilter ? { refundedAt: dateFilter } : {}) },
          { status: PaymentStatus.PARTIALLY_REFUNDED, ...(dateFilter ? { refundedAt: dateFilter } : {}) },
        ],
      }),
      this.earnings.find({ where: dateFilter ? { createdAt: dateFilter } : {} }),
      this.payouts.find({ where: dateFilter ? { createdAt: dateFilter } : {} }),
    ]);

    const totalRevenue = paidPayments.reduce((sum, item) => sum + Number(item.amount), 0);
    const totalRefunded = refundedPayments.reduce((sum, item) => sum + Number(item.refundedAmount), 0);
    const grossEarnings = earnings.reduce((sum, item) => sum + Number(item.grossAmount), 0);
    const platformFees = earnings.reduce((sum, item) => sum + Number(item.platformFee), 0);
    const netEarnings = earnings.reduce((sum, item) => sum + Number(item.netAmount), 0);
    const totalPayouts = payouts
      .filter((item) => item.status === PayoutStatus.COMPLETED)
      .reduce((sum, item) => sum + Number(item.amount), 0);

    return {
      currency: paidPayments[0]?.currency ?? earnings[0]?.currency ?? 'UGX',
      totalRevenue,
      totalRefunded,
      grossEarnings,
      platformFees,
      netEarnings,
      totalPayouts,
      paymentCount: paidPayments.length,
      earningsCount: earnings.length,
      payoutCount: payouts.length,
      generatedAt: new Date(),
    };
  }

  async listSettlements(query: AdminFinanceListQueryDto) {
    const where = this.dateRange({}, query.from, query.to, 'settlementDate');
    if (query.status) where.status = query.status;
    const { skip, take } = this.paginate(query.page, query.limit);
    const [items, total] = await this.settlements.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { items, meta: { page: query.page ?? 1, limit: take, total, pageCount: Math.ceil(total / take) } };
  }

  async getSettlement(id: string) {
    const item = await this.settlements.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Settlement batch not found');
    return item;
  }

  async createSettlementBatch(actorUserId: string, dto: CreateSettlementBatchDto) {
    const reference = `STL-${randomUUID()}`;
    const record = this.settlements.create({
      reference,
      status: 'PENDING',
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      currency: dto.currency ?? 'UGX',
      totalAmount: dto.totalAmount ?? 0,
      totalCount: dto.totalCount ?? 0,
      provider: dto.provider,
      settlementDate: dto.settlementDate ? new Date(dto.settlementDate) : undefined,
      details: dto.details,
    });
    const saved = await this.settlements.save(record);
    void this.auditService
      .record({
        actorUserId,
        action: 'SETTLEMENT_BATCH_CREATED',
        entityType: 'FinanceSettlementBatch',
        entityId: saved.id,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async postSettlementBatch(id: string, actorUserId: string) {
    const record = await this.getSettlement(id);
    if (record.status !== 'PENDING') throw new BadRequestException('Only pending batches can be posted');
    const before = { ...record };
    record.status = 'POSTED';
    record.postedAt = new Date();
    record.postedByUserId = actorUserId;
    const saved = await this.settlements.save(record);
    void this.auditService
      .record({
        actorUserId,
        action: 'SETTLEMENT_BATCH_POSTED',
        entityType: 'FinanceSettlementBatch',
        entityId: id,
        before,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async cancelSettlementBatch(id: string, actorUserId: string) {
    const record = await this.getSettlement(id);
    if (record.status === 'POSTED') throw new BadRequestException('Posted batches cannot be cancelled');
    const before = { ...record };
    record.status = 'CANCELLED';
    const saved = await this.settlements.save(record);
    void this.auditService
      .record({
        actorUserId,
        action: 'SETTLEMENT_BATCH_CANCELLED',
        entityType: 'FinanceSettlementBatch',
        entityId: id,
        before,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async listWalletReconciliations(query: AdminFinanceListQueryDto) {
    const where = this.dateRange({}, query.from, query.to, 'periodStart');
    if (query.status) where.status = query.status;
    const { skip, take } = this.paginate(query.page, query.limit);
    const [items, total] = await this.reconciliations.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { items, meta: { page: query.page ?? 1, limit: take, total, pageCount: Math.ceil(total / take) } };
  }

  async getWalletReconciliation(id: string) {
    const item = await this.reconciliations.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Wallet reconciliation report not found');
    return item;
  }

  async createWalletReconciliation(actorUserId: string, dto: CreateWalletReconciliationDto) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodStart >= periodEnd) throw new BadRequestException('periodStart must be before periodEnd');

    const transactions = await this.walletTransactions.find({
      where: { createdAt: Between(periodStart, periodEnd) },
    });

    const totalWalletAmount = transactions.reduce((sum, item) => sum + Number(item.amount), 0);
    const report = this.reconciliations.create({
      runId: dto.runId,
      periodStart,
      periodEnd,
      type: dto.type?.toUpperCase() ?? 'WALLET',
      status: 'COMPLETED',
      currency: dto.currency ?? 'UGX',
      totalWalletTransactions: transactions.length,
      totalWalletAmount,
      matchedCount: transactions.length,
      varianceCount: 0,
      varianceAmount: 0,
      details: { sampleCount: Math.min(transactions.length, 100) },
      createdByUserId: actorUserId,
    });
    const saved = await this.reconciliations.save(report);
    void this.auditService
      .record({
        actorUserId,
        action: 'WALLET_RECONCILIATION_CREATED',
        entityType: 'WalletReconciliationReport',
        entityId: saved.id,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }
}
