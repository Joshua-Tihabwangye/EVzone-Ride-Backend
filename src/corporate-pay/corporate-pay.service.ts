import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import {
  CorporatePayTransactionStatus,
  ManualBookingStatus,
  PaymentMethod,
  PaymentStatus,
  ReconciliationStatus,
  ServiceType,
  UserRole,
  WebhookEventStatus,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { getRepository, runInTransaction } from '../common/transaction';
import { getRequiredSecret } from '../common/utils/required-secret.util';
import { signPayload, verifyPayloadSignature } from '../common/utils/crypto-vault';
import { stringValue } from '../common/utils/values';
import {
  CorporatePayAccount,
  CorporatePayReconciliation,
  CorporatePayTransaction,
  CorporatePayWebhookEvent,
  IntegrationOutbox,
  ManualBooking,
  Payment,
} from '../database/entities';
import { OrganizationsService } from '../organizations/organizations.service';
import { PaymentsService } from '../payments/payments.service';
import {
  CorporatePayRefundDto,
  CorporatePayWebhookDto,
  InitiateCorporatePayDto,
  LinkCorporatePayAccountDto,
  ReconcileCorporatePayDto,
  ResolveReconciliationDto,
  UpdateCorporatePayAccountDto,
  UpdateCorporatePayTransactionDto,
} from './corporate-pay.dto';

@Injectable()
export class CorporatePayService {
  constructor(
    @InjectRepository(CorporatePayAccount) private readonly accounts: Repository<CorporatePayAccount>,
    @InjectRepository(CorporatePayTransaction)
    private readonly transactions: Repository<CorporatePayTransaction>,
    @InjectRepository(CorporatePayWebhookEvent)
    private readonly webhookEvents: Repository<CorporatePayWebhookEvent>,
    @InjectRepository(CorporatePayReconciliation)
    private readonly reconciliations: Repository<CorporatePayReconciliation>,
    @InjectRepository(IntegrationOutbox) private readonly outbox: Repository<IntegrationOutbox>,
    @InjectRepository(ManualBooking) private readonly manualBookings: Repository<ManualBooking>,
    @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly organizations: OrganizationsService,
    private readonly payments: PaymentsService,
    private readonly events: EventEmitter2,
  ) {}

  async linkAccount(user: AuthUser, dto: LinkCorporatePayAccountDto) {
    if (!dto.organizationId && !dto.userId) dto.userId = user.id;
    if (dto.organizationId) await this.organizations.assertAccess(user, dto.organizationId);
    if (dto.userId && dto.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You cannot link a CorporatePay account to another user');
    }
    if (await this.accounts.findOne({ where: { externalAccountId: dto.externalAccountId } })) {
      throw new ConflictException('CorporatePay account is already linked');
    }
    return this.accounts.save(
      this.accounts.create({
        ...dto,
        currency: dto.currency ?? 'UGX',
        status: 'ACTIVE',
      }),
    );
  }

  async listAccounts(user: AuthUser, organizationId?: string) {
    if (organizationId) {
      await this.organizations.assertAccess(user, organizationId);
      return this.accounts.find({ where: { organizationId }, order: { createdAt: 'DESC' } });
    }
    if (user.role === UserRole.ADMIN) return this.accounts.find({ order: { createdAt: 'DESC' } });
    return this.accounts.find({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
  }

  async updateAccount(user: AuthUser, id: string, dto: UpdateCorporatePayAccountDto) {
    const account = await this.accountForUser(user, id);
    Object.assign(account, dto);
    return this.accounts.save(account);
  }

  async initiate(user: AuthUser, dto: InitiateCorporatePayDto) {
    return this.initiateForActor(user, user.id, dto);
  }

  async initiateForActor(actor: AuthUser, payerUserId: string, dto: InitiateCorporatePayDto) {
    const idempotencyKey = dto.idempotencyKey ?? `corp-${dto.serviceType}-${dto.serviceId}-${payerUserId}`;
    const existing = await this.transactions.findOne({ where: { idempotencyKey } });
    if (existing) return existing;
    let account: CorporatePayAccount | null | undefined;
    if (dto.accountId) account = await this.accountForUser(actor, dto.accountId);
    if (!account && dto.organizationId) {
      await this.organizations.assertAccess(actor, dto.organizationId);
      account = await this.accounts.findOne({
        where: { organizationId: dto.organizationId, status: 'ACTIVE' },
      });
    }
    if (!account) account = await this.accounts.findOne({ where: { userId: payerUserId, status: 'ACTIVE' } });
    if (!account) throw new BadRequestException('No active CorporatePay account is linked');

    let externalServicePayment;
    if (dto.serviceType === ServiceType.SCHOOL_SHUTTLE) {
      const booking = dto.manualBookingId
        ? await this.manualBookings.findOne({ where: { id: dto.manualBookingId } })
        : null;
      const amount = dto.authorizedAmount ?? booking?.quotedAmount;
      if (amount === undefined || !Number.isFinite(amount) || amount < 0) {
        throw new BadRequestException(
          'School Shuttle CorporatePay transactions require an authorized or quoted amount',
        );
      }
      externalServicePayment = {
        ownerUserId: payerUserId,
        amount,
        currency: booking?.currency ?? account.currency,
        paymentStatus: PaymentStatus.PENDING,
      };
    }
    const payment = await this.payments.createIntent(
      payerUserId,
      {
        serviceType: dto.serviceType,
        serviceId: dto.serviceId,
        method: PaymentMethod.CORPORATE_PAY,
        idempotencyKey: `payment-${idempotencyKey}`,
      },
      externalServicePayment,
    );
    if (account.currency !== payment.currency) {
      throw new BadRequestException(
        `CorporatePay account currency ${account.currency} does not match ${payment.currency}`,
      );
    }
    if (account.transactionLimit && payment.amount > account.transactionLimit) {
      throw new BadRequestException('Transaction exceeds the CorporatePay account limit');
    }
    if (dto.authorizedAmount !== undefined && payment.amount > dto.authorizedAmount + 0.01) {
      throw new BadRequestException(
        `Service amount ${payment.amount} exceeds the CorporatePay authorization ${dto.authorizedAmount}`,
      );
    }
    const transaction = await this.transactions.save(
      this.transactions.create({
        reference: `CP-${randomUUID()}`,
        idempotencyKey,
        accountId: account.id,
        organizationId: account.organizationId ?? dto.organizationId,
        userId: payerUserId,
        serviceType: dto.serviceType,
        serviceId: dto.serviceId,
        manualBookingId: dto.manualBookingId,
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: CorporatePayTransactionStatus.CREATED,
        description: dto.description,
        providerPayload: {
          returnUrl: dto.returnUrl,
          accountExternalId: account.externalAccountId,
          externalRequestId: dto.externalRequestId,
          externalAuthorizationId: dto.externalAuthorizationId,
          authorizedAmount: dto.authorizedAmount,
          approvalId: dto.approvalId,
          policyId: dto.policyId,
          budgetId: dto.budgetId,
          budgetReservationId: dto.budgetReservationId,
          costCenterId: dto.costCenterId,
          groupId: dto.groupId,
          purchaseOrderId: dto.purchaseOrderId,
          corporateContext: dto.corporateContext,
        },
      }),
    );
    if (dto.manualBookingId) {
      await this.manualBookings.update(dto.manualBookingId, { corporatePayTransactionId: transaction.id });
    }
    await this.sendToProvider(transaction, account, dto.returnUrl);
    return this.transactions.findOne({ where: { id: transaction.id } });
  }

  async detail(user: AuthUser, id: string) {
    const transaction = await this.transactions.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('CorporatePay transaction not found');
    await this.assertTransactionAccess(user, transaction);
    const [payment, reconciliation] = await Promise.all([
      transaction.paymentId
        ? this.paymentRepository.findOne({ where: { id: transaction.paymentId } })
        : undefined,
      this.reconciliations.findOne({
        where: { transactionId: transaction.id },
        order: { createdAt: 'DESC' },
      }),
    ]);
    return { transaction, payment, reconciliation };
  }

  async list(user: AuthUser, organizationId?: string, page = 1, limit = 20) {
    if (organizationId) await this.organizations.assertAccess(user, organizationId);
    const where =
      user.role === UserRole.ADMIN
        ? organizationId
          ? { organizationId }
          : {}
        : organizationId
          ? { organizationId }
          : { userId: user.id };
    const [items, total] = await this.transactions.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async sandboxApprove(user: AuthUser, id: string) {
    if (!this.isSandbox()) throw new ForbiddenException('Sandbox approval is disabled');
    const transaction = await this.transactions.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('CorporatePay transaction not found');
    await this.assertTransactionAccess(user, transaction);
    return this.finalizePaid(transaction, transaction.externalTransactionId ?? `SBX-${randomUUID()}`);
  }

  async sandboxDecline(user: AuthUser, id: string, reason?: string) {
    if (!this.isSandbox()) throw new ForbiddenException('Sandbox decline is disabled');
    const transaction = await this.transactions.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('CorporatePay transaction not found');
    await this.assertTransactionAccess(user, transaction);
    transaction.status = CorporatePayTransactionStatus.DECLINED;
    transaction.lastError = reason ?? 'Declined in CorporatePay sandbox';
    return this.transactions.save(transaction);
  }

  async adminUpdate(user: AuthUser, id: string, dto: UpdateCorporatePayTransactionDto) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('Administrator access required');
    const transaction = await this.transactions.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('CorporatePay transaction not found');
    if (dto.externalTransactionId) transaction.externalTransactionId = dto.externalTransactionId;
    if (dto.status === CorporatePayTransactionStatus.PAID) {
      return this.finalizePaid(
        transaction,
        dto.externalTransactionId ?? transaction.externalTransactionId ?? `ADMIN-${randomUUID()}`,
      );
    }
    transaction.status = dto.status;
    transaction.lastError = dto.reason;
    return this.transactions.save(transaction);
  }

  async refund(user: AuthUser, id: string, dto: CorporatePayRefundDto) {
    const transaction = await this.transactions.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('CorporatePay transaction not found');
    await this.assertTransactionAccess(user, transaction, true);
    if (transaction.status !== CorporatePayTransactionStatus.PAID) {
      throw new BadRequestException('Only paid CorporatePay transactions can be refunded');
    }
    if (!transaction.paymentId) throw new BadRequestException('Local payment record is missing');
    await this.payments.refund(user.id, transaction.paymentId, dto.amount, dto.reason);
    transaction.status = CorporatePayTransactionStatus.REFUNDED;
    transaction.refundedAt = new Date();
    return this.transactions.save(transaction);
  }

  async webhook(
    rawBody: string,
    signature: string | undefined,
    dto: CorporatePayWebhookDto,
    headers?: Record<string, string | string[] | undefined>,
  ) {
    const secret = getRequiredSecret(
      'CORPORATEPAY_WEBHOOK_SECRET',
      process.env.CORPORATEPAY_WEBHOOK_SECRET,
      process.env.NODE_ENV,
      { allowLocalFallback: true, localFallback: 'evzone-corporatepay-local-secret' },
    );
    const signatureValid = verifyPayloadSignature(rawBody, signature, secret);
    const timestampCheck = this.validateTimestampHeader(headers);
    const valid = signatureValid && timestampCheck.valid;

    let event = await this.webhookEvents.findOne({ where: { externalEventId: dto.id } });
    if (event) return { accepted: true, duplicate: true, eventId: event.id };

    event = await this.webhookEvents.save(
      this.webhookEvents.create({
        externalEventId: dto.id,
        eventType: dto.type,
        status: valid ? WebhookEventStatus.VERIFIED : WebhookEventStatus.REJECTED,
        signatureValid,
        payload: dto as unknown as Record<string, unknown>,
      }),
    );

    if (!signatureValid) {
      throw new ForbiddenException('Invalid CorporatePay webhook signature');
    }
    if (!timestampCheck.valid) {
      throw new ForbiddenException(
        timestampCheck.reason ?? 'CorporatePay webhook timestamp out of tolerance',
      );
    }

    try {
      await runInTransaction(this.dataSource, async () => {
        const reference = stringValue(dto.data.reference);
        const externalTransactionId = stringValue(dto.data.transactionId ?? dto.data.externalTransactionId);
        const transactionsRepo = getRepository(CorporatePayTransaction);
        const transaction =
          (reference ? await transactionsRepo.findOne({ where: { reference } }) : undefined) ??
          (externalTransactionId
            ? await transactionsRepo.findOne({ where: { externalTransactionId } })
            : undefined);
        if (!transaction)
          throw new NotFoundException('CorporatePay transaction referenced by webhook was not found');
        const type = dto.type.toUpperCase();
        if (type.includes('PAID') || type.includes('SETTLED') || type.includes('SUCCEEDED')) {
          await this.finalizePaid(transaction, externalTransactionId || `WEBHOOK-${dto.id}`);
        } else if (type.includes('DECLINED')) {
          transaction.status = CorporatePayTransactionStatus.DECLINED;
          transaction.lastError = stringValue(dto.data.reason, 'CorporatePay declined the transaction');
          await transactionsRepo.save(transaction);
        } else if (type.includes('FAILED')) {
          transaction.status = CorporatePayTransactionStatus.FAILED;
          transaction.lastError = stringValue(dto.data.reason, 'CorporatePay transaction failed');
          await transactionsRepo.save(transaction);
        } else if (type.includes('REFUND')) {
          transaction.status = CorporatePayTransactionStatus.REFUNDED;
          transaction.refundedAt = new Date();
          await transactionsRepo.save(transaction);
        } else if (type.includes('APPROVED')) {
          transaction.status = CorporatePayTransactionStatus.APPROVED;
          transaction.approvedAt = new Date();
          await transactionsRepo.save(transaction);
        }
      });
      event.status = WebhookEventStatus.PROCESSED;
      event.processedAt = new Date();
      await this.webhookEvents.save(event);
      return { accepted: true, eventId: event.id };
    } catch (error) {
      event.status = WebhookEventStatus.FAILED;
      event.error = error instanceof Error ? error.message : String(error);
      await this.webhookEvents.save(event);
      throw error;
    }
  }

  private validateTimestampHeader(headers?: Record<string, string | string[] | undefined>): {
    valid: boolean;
    reason?: string;
  } {
    const raw = headers?.['x-corporatepay-timestamp'];
    const timestamp = Array.isArray(raw) ? raw[0] : raw;
    if (!timestamp) return { valid: true };
    const toleranceSeconds = Number(process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS ?? 300);
    const parsed = /(^\d{4}-)|(^\d{4}\/)/.test(timestamp) ? Date.parse(timestamp) : Number(timestamp) * 1000;
    if (!Number.isFinite(parsed)) {
      return { valid: false, reason: 'CorporatePay webhook timestamp is invalid' };
    }
    const deltaSeconds = Math.abs(Date.now() - parsed) / 1000;
    if (deltaSeconds > toleranceSeconds) {
      return { valid: false, reason: 'CorporatePay webhook timestamp is outside the allowed tolerance' };
    }
    return { valid: true };
  }

  async reconcile(user: AuthUser, dto: ReconcileCorporatePayDto) {
    if (![UserRole.ADMIN, UserRole.SUPPORT].includes(user.role)) {
      const transaction = await this.transactions.findOne({ where: { id: dto.transactionId } });
      if (!transaction) throw new NotFoundException('CorporatePay transaction not found');
      await this.assertTransactionAccess(user, transaction, true);
    }
    const transaction = await this.transactions.findOne({ where: { id: dto.transactionId } });
    if (!transaction) throw new NotFoundException('CorporatePay transaction not found');
    const variance = Math.round((dto.settledAmount - transaction.amount) * 100) / 100;
    return this.reconciliations.save(
      this.reconciliations.create({
        transactionId: transaction.id,
        externalSettlementId: dto.externalSettlementId,
        expectedAmount: transaction.amount,
        settledAmount: dto.settledAmount,
        variance,
        status: variance === 0 ? ReconciliationStatus.MATCHED : ReconciliationStatus.VARIANCE,
        statementDate: dto.statementDate ? new Date(dto.statementDate) : new Date(),
        metadata: dto.metadata,
      }),
    );
  }

  async listReconciliations(user: AuthUser, status?: ReconciliationStatus) {
    if (![UserRole.ADMIN, UserRole.SUPPORT].includes(user.role)) {
      throw new ForbiddenException('Finance or administrator access required');
    }
    return this.reconciliations.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async resolveReconciliation(user: AuthUser, id: string, dto: ResolveReconciliationDto) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('Administrator access required');
    const item = await this.reconciliations.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Reconciliation item not found');
    item.status = dto.status;
    item.resolvedByUserId = user.id;
    item.resolvedAt = new Date();
    item.metadata = { ...(item.metadata ?? {}), resolutionNote: dto.note };
    return this.reconciliations.save(item);
  }

  async dashboard(user: AuthUser, organizationId?: string) {
    if (organizationId) await this.organizations.assertAccess(user, organizationId);
    if (!organizationId && user.role !== UserRole.ADMIN) {
      throw new BadRequestException('organizationId is required for non-admin users');
    }
    const builder = this.transactions.createQueryBuilder('transaction');
    if (organizationId) builder.where('transaction.organizationId = :organizationId', { organizationId });
    const rows = await builder
      .select('transaction.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(transaction.amount), 0)', 'amount')
      .groupBy('transaction.status')
      .getRawMany<{ status: string; count: string; amount: string }>();
    return {
      organizationId,
      byStatus: rows.map((row) => ({
        status: row.status,
        count: Number(row.count),
        amount: Number(row.amount),
      })),
      generatedAt: new Date(),
    };
  }

  @Cron('*/30 * * * * *')
  async retryOutbox() {
    if (this.isSandbox()) return;
    const items = await this.outbox.find({
      where: { destination: 'CORPORATEPAY', status: 'PENDING' },
      take: 20,
    });
    for (const item of items) {
      try {
        const transaction = await this.transactions.findOne({ where: { id: item.aggregateId } });
        if (!transaction) {
          item.status = 'FAILED';
          item.lastError = 'Transaction not found';
          await this.outbox.save(item);
          continue;
        }
        const account = transaction.accountId
          ? await this.accounts.findOne({ where: { id: transaction.accountId } })
          : undefined;
        if (!account) throw new Error('CorporatePay account not found');
        await this.sendToProvider(transaction, account);
        item.status = 'PROCESSED';
        item.processedAt = new Date();
        await this.outbox.save(item);
      } catch (error) {
        item.attempts += 1;
        item.lastError = error instanceof Error ? error.message : String(error);
        item.nextAttemptAt = new Date(Date.now() + Math.min(item.attempts * 60_000, 3_600_000));
        if (item.attempts >= 10) item.status = 'FAILED';
        await this.outbox.save(item);
      }
    }
  }

  private async sendToProvider(
    transaction: CorporatePayTransaction,
    account: CorporatePayAccount,
    returnUrl?: string,
  ) {
    if (this.isSandbox()) {
      transaction.externalTransactionId = transaction.externalTransactionId ?? `CP-SBX-${randomUUID()}`;
      transaction.checkoutUrl = `${process.env.API_PUBLIC_URL ?? 'http://localhost:3000'}/api/v1/corporate-pay/sandbox/${transaction.id}`;
      const autoApprove = !['0', 'false', 'no'].includes(
        (process.env.CORPORATEPAY_MOCK_AUTO_APPROVE ?? 'true').toLowerCase(),
      );
      transaction.status = autoApprove
        ? CorporatePayTransactionStatus.PROCESSING
        : CorporatePayTransactionStatus.PENDING_APPROVAL;
      await this.transactions.save(transaction);
      if (autoApprove) return this.finalizePaid(transaction, transaction.externalTransactionId);
      return transaction;
    }
    const baseUrl = process.env.CORPORATEPAY_BASE_URL;
    if (!baseUrl) throw new BadRequestException('CORPORATEPAY_BASE_URL is required in remote mode');
    const body = {
      reference: transaction.reference,
      accountId: account.externalAccountId,
      amount: transaction.amount,
      currency: transaction.currency,
      serviceType: transaction.serviceType,
      serviceId: transaction.serviceId,
      callbackUrl: `${process.env.API_PUBLIC_URL ?? 'http://localhost:3000'}/api/v1/corporate-pay/webhooks`,
      returnUrl,
      metadata: {
        transactionId: transaction.id,
        manualBookingId: transaction.manualBookingId,
        externalRequestId: transaction.providerPayload?.externalRequestId,
        externalAuthorizationId: transaction.providerPayload?.externalAuthorizationId,
        authorizedAmount: transaction.providerPayload?.authorizedAmount,
        approvalId: transaction.providerPayload?.approvalId,
        policyId: transaction.providerPayload?.policyId,
        budgetId: transaction.providerPayload?.budgetId,
        budgetReservationId: transaction.providerPayload?.budgetReservationId,
        costCenterId: transaction.providerPayload?.costCenterId,
        groupId: transaction.providerPayload?.groupId,
        purchaseOrderId: transaction.providerPayload?.purchaseOrderId,
        corporateContext: transaction.providerPayload?.corporateContext,
      },
    };
    try {
      transaction.status = CorporatePayTransactionStatus.PROCESSING;
      await this.transactions.save(transaction);
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/payment-intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': transaction.idempotencyKey ?? transaction.reference,
          ...(process.env.CORPORATEPAY_API_KEY
            ? { Authorization: `Bearer ${process.env.CORPORATEPAY_API_KEY}` }
            : {}),
          'X-EVzone-Signature': signPayload(
            JSON.stringify(body),
            getRequiredSecret(
              'CORPORATEPAY_SIGNING_SECRET',
              process.env.CORPORATEPAY_SIGNING_SECRET,
              process.env.NODE_ENV,
              { allowLocalFallback: true, localFallback: 'evzone-local-signing-secret' },
            ),
          ),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok)
        throw new Error(stringValue(responseBody.message, `CorporatePay returned HTTP ${response.status}`));
      transaction.externalTransactionId = stringValue(
        responseBody.id ?? responseBody.transactionId ?? transaction.externalTransactionId,
      );
      transaction.checkoutUrl = responseBody.checkoutUrl ? stringValue(responseBody.checkoutUrl) : undefined;
      transaction.status = this.mapProviderStatus(stringValue(responseBody.status, 'PENDING_APPROVAL'));
      transaction.providerPayload = { ...(transaction.providerPayload ?? {}), response: responseBody };
      await this.transactions.save(transaction);
      if (transaction.status === CorporatePayTransactionStatus.PAID) {
        return this.finalizePaid(transaction, transaction.externalTransactionId || `REMOTE-${randomUUID()}`);
      }
      return transaction;
    } catch (error) {
      transaction.status = CorporatePayTransactionStatus.FAILED;
      transaction.lastError = error instanceof Error ? error.message : String(error);
      await this.transactions.save(transaction);
      const existing = await this.outbox.findOne({
        where: { destination: 'CORPORATEPAY', aggregateId: transaction.id, status: 'PENDING' },
      });
      if (!existing) {
        await this.outbox.save(
          this.outbox.create({
            destination: 'CORPORATEPAY',
            aggregateType: 'CorporatePayTransaction',
            aggregateId: transaction.id,
            eventType: 'CREATE_PAYMENT_INTENT',
            payload: { transactionId: transaction.id },
            status: 'PENDING',
            nextAttemptAt: new Date(Date.now() + 60_000),
          }),
        );
      }
      return transaction;
    }
  }

  private async finalizePaid(transaction: CorporatePayTransaction, externalId: string) {
    if (transaction.status === CorporatePayTransactionStatus.PAID) return transaction;
    if (!transaction.paymentId) throw new BadRequestException('Local payment record is missing');
    const paymentsRepo = getRepository(Payment, this.paymentRepository.manager);
    const transactionsRepo = getRepository(CorporatePayTransaction, this.transactions.manager);
    const localPayment = await paymentsRepo.findOne({ where: { id: transaction.paymentId } });
    if (!localPayment) throw new NotFoundException('Local payment record not found');
    if (localPayment.status !== PaymentStatus.PAID) {
      await this.payments.confirm(transaction.userId, localPayment.id, `CORPORATEPAY-${externalId}`);
    }
    transaction.externalTransactionId = externalId;
    transaction.status = CorporatePayTransactionStatus.PAID;
    transaction.paidAt = new Date();
    transaction.lastError = undefined;
    await transactionsRepo.save(transaction);
    if (transaction.manualBookingId) {
      const manualBookingsRepo = getRepository(ManualBooking, this.manualBookings.manager);
      await manualBookingsRepo.update(transaction.manualBookingId, {
        corporatePayTransactionId: transaction.id,
        status: ManualBookingStatus.CONFIRMED,
        confirmedAt: new Date(),
      });
    }
    this.events.emit('corporatepay.updated', {
      transactionId: transaction.id,
      status: transaction.status,
      serviceType: transaction.serviceType,
      serviceId: transaction.serviceId,
    });
    return transaction;
  }

  private async accountForUser(user: AuthUser, id: string) {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) throw new NotFoundException('CorporatePay account not found');
    if (user.role === UserRole.ADMIN) return account;
    if (account.userId === user.id) return account;
    if (account.organizationId) {
      await this.organizations.assertAccess(user, account.organizationId);
      return account;
    }
    throw new ForbiddenException('You cannot access this CorporatePay account');
  }

  private async assertTransactionAccess(
    user: AuthUser,
    transaction: CorporatePayTransaction,
    finance = false,
  ) {
    if (user.role === UserRole.ADMIN) return;
    if (transaction.userId === user.id && !finance) return;
    if (transaction.organizationId) {
      await this.organizations.assertAccess(user, transaction.organizationId);
      return;
    }
    throw new ForbiddenException('You cannot access this CorporatePay transaction');
  }

  private mapProviderStatus(status: string): CorporatePayTransactionStatus {
    const normalized = status.toUpperCase();
    if (normalized.includes('PAID') || normalized.includes('SUCCESS') || normalized.includes('SETTLED'))
      return CorporatePayTransactionStatus.PAID;
    if (normalized.includes('APPROV')) return CorporatePayTransactionStatus.APPROVED;
    if (normalized.includes('AUTH')) return CorporatePayTransactionStatus.AUTHORIZED;
    if (normalized.includes('DECLIN')) return CorporatePayTransactionStatus.DECLINED;
    if (normalized.includes('FAIL')) return CorporatePayTransactionStatus.FAILED;
    if (normalized.includes('CANCEL')) return CorporatePayTransactionStatus.CANCELLED;
    if (normalized.includes('PROCESS')) return CorporatePayTransactionStatus.PROCESSING;
    return CorporatePayTransactionStatus.PENDING_APPROVAL;
  }

  private isSandbox() {
    return (process.env.CORPORATEPAY_MODE ?? 'sandbox').toLowerCase() !== 'remote';
  }
}
