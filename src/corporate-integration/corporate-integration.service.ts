import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Brackets, In, Repository } from 'typeorm';
import { AmbulanceEstimateDto } from '../ambulance/ambulance.dto';
import { AmbulanceService } from '../ambulance/ambulance.service';
import {
  BookingSource,
  CorporatePayAuthorizationStatus,
  CorporatePayDisputeStatus,
  CorporatePayEvidenceType,
  CorporatePayRequestKind,
  CorporatePayRequestStatus,
  CorporatePayTransactionStatus,
  DispatchPriority,
  EnergyType,
  ManualBookingStatus,
  PaymentMethod,
  ServiceType,
  UserRole,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { EstimateDeliveryDto } from '../deliveries/deliveries.dto';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { DispatchService } from '../dispatch/dispatch.service';
import {
  AmbulanceRequest,
  CorporatePayAccount,
  CorporatePayAuthorization,
  CorporatePayFulfillmentDispute,
  CorporatePayFulfillmentEvidence,
  CorporatePayPartnerRequest,
  CorporatePaySubjectLink,
  CorporatePayTransaction,
  DeliveryOrder,
  IntegrationOutbox,
  ManualBooking,
  Organization,
  Payment,
  RentalBooking,
  Ride,
  TouristBooking,
  User,
  Vehicle,
} from '../database/entities';
import { RentalQuoteDto } from '../rentals/rentals.dto';
import { RentalsService } from '../rentals/rentals.service';
import { EstimateRideDto } from '../rides/rides.dto';
import { RidesService } from '../rides/rides.service';
import { TouristQuoteDto } from '../tourist/tourist.dto';
import { TouristService } from '../tourist/tourist.service';
import { CorporatePayService } from '../corporate-pay/corporate-pay.service';
import {
  CorporatePayAuthorizationDto,
  CorporatePayEventAckDto,
  CorporatePayPartnerCancelDto,
  CorporatePayPartnerListQueryDto,
  CorporatePayPartnerQuoteDto,
  CorporatePayPartnerRefundDto,
  CorporatePayRebookDto,
  CorporatePayReconciliationExportQueryDto,
  CorporatePaySubjectLinkDto,
  CorporatePaySustainabilityQueryDto,
  CreateCorporatePayDisputeDto,
  CreateCorporatePayEvidenceDto,
  CreateCorporatePayPartnerRequestDto,
  UpdateCorporatePayDisputeDto,
} from './corporate-integration.dto';
import { getRequiredSecret } from '../common/utils/required-secret.util';
import { WorkerHeartbeatService } from '../infrastructure/worker-heartbeat.service';
import { signCorporatePayRequest } from './corporate-partner-signature';

export interface NormalizedQuote {
  quoteId: string;
  serviceType: ServiceType;
  amount: number;
  currency: string;
  expiresAt: string;
  breakdown?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

@Injectable()
export class CorporateIntegrationService {
  constructor(
    @InjectRepository(CorporatePayPartnerRequest)
    private readonly requests: Repository<CorporatePayPartnerRequest>,
    @InjectRepository(CorporatePayAuthorization)
    private readonly authorizations: Repository<CorporatePayAuthorization>,
    @InjectRepository(CorporatePayFulfillmentEvidence)
    private readonly evidence: Repository<CorporatePayFulfillmentEvidence>,
    @InjectRepository(CorporatePayFulfillmentDispute)
    private readonly disputes: Repository<CorporatePayFulfillmentDispute>,
    @InjectRepository(CorporatePaySubjectLink)
    private readonly subjectLinks: Repository<CorporatePaySubjectLink>,
    @InjectRepository(CorporatePayAccount)
    private readonly accounts: Repository<CorporatePayAccount>,
    @InjectRepository(CorporatePayTransaction)
    private readonly transactions: Repository<CorporatePayTransaction>,
    @InjectRepository(ManualBooking)
    private readonly manualBookings: Repository<ManualBooking>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Ride)
    private readonly ridesRepository: Repository<Ride>,
    @InjectRepository(DeliveryOrder)
    private readonly deliveriesRepository: Repository<DeliveryOrder>,
    @InjectRepository(TouristBooking)
    private readonly touristRepository: Repository<TouristBooking>,
    @InjectRepository(AmbulanceRequest)
    private readonly ambulanceRepository: Repository<AmbulanceRequest>,
    @InjectRepository(RentalBooking)
    private readonly rentalRepository: Repository<RentalBooking>,
    @InjectRepository(Vehicle)
    private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(IntegrationOutbox)
    private readonly outbox: Repository<IntegrationOutbox>,
    private readonly dispatch: DispatchService,
    private readonly corporatePay: CorporatePayService,
    private readonly rides: RidesService,
    private readonly deliveries: DeliveriesService,
    private readonly tourist: TouristService,
    private readonly ambulances: AmbulanceService,
    private readonly rentals: RentalsService,
    @Optional() private readonly heartbeat?: WorkerHeartbeatService,
  ) {}

  capabilities() {
    return {
      contractVersion: '2026-06-21',
      backendVersion: '9.0.0',
      ownershipBoundary: {
        corporatePay: [
          'organizations',
          'members',
          'groups_and_cost_centers',
          'budgets',
          'spend_policies',
          'approval_workflows',
          'wallets_and_credit',
          'invoices',
          'collections',
          'api_keys_and_webhooks',
        ],
        evzoneRide: [
          'service_catalog',
          'quotes',
          'availability',
          'bookings',
          'dispatch',
          'live_fulfillment_status',
          'payment_capture_execution',
          'refund_execution',
          'receipts',
          'fulfillment_evidence',
          'service_disputes',
          'reconciliation_exports',
          'sustainability_metrics',
        ],
      },
      authentication: {
        scheme: 'HMAC-SHA256',
        headers: [
          'x-corporatepay-client-id',
          'x-corporatepay-timestamp',
          'x-corporatepay-nonce',
          'x-corporatepay-signature',
        ],
        sandboxApiKeyHeader: 'x-corporatepay-api-key',
        maxClockSkewSeconds: Number(process.env.CORPORATEPAY_PARTNER_MAX_SKEW_SECONDS ?? 300),
      },
      services: Object.values(ServiceType),
      requestKinds: Object.values(CorporatePayRequestKind),
      requestStatuses: Object.values(CorporatePayRequestStatus),
      authorizationStatuses: Object.values(CorporatePayAuthorizationStatus),
      evidenceTypes: Object.values(CorporatePayEvidenceType),
      disputeStatuses: Object.values(CorporatePayDisputeStatus),
      eventDelivery: {
        pushConfigured: Boolean(process.env.CORPORATEPAY_EVENTS_URL ?? process.env.CORPORATEPAY_BASE_URL),
        pullEndpoint: '/api/v1/corporate-pay/partner/events',
      },
    };
  }

  catalog() {
    return {
      currency: 'UGX',
      services: [
        {
          serviceType: ServiceType.RIDE,
          requestKinds: [CorporatePayRequestKind.SERVICE_BOOKING, CorporatePayRequestKind.RIDE_SCHEDULE],
          capabilities: ['on_demand', 'scheduled', 'multi_stop', 'round_trip', 'beneficiary_booking'],
        },
        {
          serviceType: ServiceType.DELIVERY,
          requestKinds: [CorporatePayRequestKind.DELIVERY, CorporatePayRequestKind.SERVICE_BOOKING],
          capabilities: ['on_demand', 'scheduled', 'parcel_tracking', 'pickup_qr', 'dropoff_otp'],
        },
        {
          serviceType: ServiceType.CAR_RENTAL,
          requestKinds: [CorporatePayRequestKind.SERVICE_BOOKING, CorporatePayRequestKind.RFQ],
          capabilities: ['self_drive', 'with_driver', 'availability_quote', 'inspection_workflow'],
        },
        {
          serviceType: ServiceType.TOURIST_VEHICLE,
          requestKinds: [CorporatePayRequestKind.SERVICE_BOOKING, CorporatePayRequestKind.RFQ],
          capabilities: ['tour_package', 'custom_itinerary', 'guide_preferences', 'scheduled'],
        },
        {
          serviceType: ServiceType.AMBULANCE,
          requestKinds: [CorporatePayRequestKind.SERVICE_BOOKING],
          capabilities: ['emergency', 'scheduled_medical_transfer', 'facility_destination'],
        },
        {
          serviceType: ServiceType.SCHOOL_SHUTTLE,
          requestKinds: [CorporatePayRequestKind.SERVICE_BOOKING],
          capabilities: ['external_school_trip_reference', 'fee_funded_transport'],
          note: 'Trip operations remain authoritative in the School backend.',
        },
      ],
      paymentMethod: PaymentMethod.CORPORATE_PAY,
    };
  }

  async linkSubject(dto: CorporatePaySubjectLinkDto) {
    const organization = await this.resolveOrganization(dto);
    const user = await this.resolveUser(dto);
    const account = dto.accountId
      ? await this.resolveOrCreateAccount(organization, user.id, dto.accountId, organization.currency)
      : undefined;
    let link = await this.subjectLinks.findOne({
      where: {
        externalOrganizationId: dto.externalOrganizationId,
        externalMemberId: dto.externalMemberId,
      },
    });
    link = this.subjectLinks.create({
      ...(link ?? {}),
      externalOrganizationId: dto.externalOrganizationId,
      externalMemberId: dto.externalMemberId,
      organizationId: organization.id,
      userId: user.id,
      accountId: account?.id ?? link?.accountId,
      status: 'ACTIVE',
      metadata: { ...(link?.metadata ?? {}), ...(dto.metadata ?? {}) },
    });
    return this.subjectLinks.save(link);
  }

  async quote(dto: CorporatePayPartnerQuoteDto): Promise<NormalizedQuote> {
    const organization = await this.resolveOrganization(dto);
    const userId = await this.resolveQuoteUserId(dto, organization);
    const raw = await this.quoteService(dto.serviceType, dto.servicePayload, userId);
    const amount = this.quoteAmount(raw, dto.serviceType, dto.servicePayload);
    const currency = this.quoteCurrency(raw, dto.currency ?? organization.currency);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('The service quote did not produce a valid amount');
    }
    const ttlMinutes = Math.max(1, Number(process.env.CORPORATEPAY_QUOTE_TTL_MINUTES ?? 15));
    return {
      quoteId: `CPQ-${randomUUID()}`,
      serviceType: dto.serviceType,
      amount,
      currency,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
      breakdown: this.recordValue(raw.breakdown),
      raw,
    };
  }

  async createRequest(dto: CreateCorporatePayPartnerRequestDto) {
    const organization = await this.resolveOrganization(dto);
    const idempotencyKey = dto.idempotencyKey ?? `corporatepay:${organization.id}:${dto.externalRequestId}`;
    const existing =
      (await this.requests.findOne({ where: { idempotencyKey } })) ??
      (await this.requests.findOne({
        where: { organizationId: organization.id, externalRequestId: dto.externalRequestId },
      }));
    if (existing) return this.detailEntity(existing);

    const subject = await this.resolveSubjectLink(dto.externalOrganizationId, dto.externalMemberId);
    const userId = dto.userId ?? subject?.userId ?? (await this.resolveQuoteUserId(dto, organization));
    const account = await this.resolveOrCreateAccount(
      organization,
      userId ?? organization.primaryOwnerUserId,
      dto.accountId ?? subject?.accountId ?? dto.externalOrganizationId,
      dto.currency ?? organization.currency,
    );
    const quote = await this.quote({ ...dto, organizationId: organization.id, userId });
    const requestKind = dto.requestKind ?? this.defaultRequestKind(dto.serviceType, dto.scheduledAt);
    const quoteOnly = [CorporatePayRequestKind.QUOTE, CorporatePayRequestKind.RFQ].includes(requestKind);
    const request = await this.requests.save(
      this.requests.create({
        organizationId: organization.id,
        externalRequestId: dto.externalRequestId,
        idempotencyKey,
        externalOrderId: dto.externalOrderId,
        externalOrganizationId: dto.externalOrganizationId ?? organization.externalId,
        externalMemberId: dto.externalMemberId,
        accountId: account.id,
        userId,
        requestKind,
        serviceType: dto.serviceType,
        status: quoteOnly ? CorporatePayRequestStatus.QUOTED : CorporatePayRequestStatus.PENDING_APPROVAL,
        priority:
          dto.priority ??
          (dto.serviceType === ServiceType.AMBULANCE ? DispatchPriority.EMERGENCY : DispatchPriority.NORMAL),
        customer: dto.customer as unknown as Record<string, unknown>,
        servicePayload: dto.servicePayload,
        corporateContext: dto.corporateContext,
        quote: quote as unknown as Record<string, unknown>,
        amount: quote.amount,
        currency: quote.currency,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        quoteExpiresAt: new Date(quote.expiresAt),
        approvalId: dto.approvalId,
        authorizationStatus: CorporatePayAuthorizationStatus.PENDING,
        policyId: dto.policyId,
        budgetId: dto.budgetId,
        budgetReservationId: dto.budgetReservationId,
        costCenterId: dto.costCenterId,
        groupId: dto.groupId,
        purchaseOrderId: dto.purchaseOrderId,
        metadata: dto.metadata,
      }),
    );
    await this.queueEvent(request, 'service_request.created');
    return this.detailEntity(request);
  }

  async listRequests(query: CorporatePayPartnerListQueryDto) {
    const organization = await this.resolveOrganization(query);
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const builder = this.requests
      .createQueryBuilder('request')
      .where('request.organizationId = :organizationId', { organizationId: organization.id });
    if (query.status) builder.andWhere('request.status = :status', { status: query.status });
    if (query.serviceType)
      builder.andWhere('request.serviceType = :serviceType', { serviceType: query.serviceType });
    if (query.from) builder.andWhere('request.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) builder.andWhere('request.createdAt <= :to', { to: new Date(query.to) });
    if (query.search) {
      builder.andWhere(
        new Brackets((nested) => {
          nested
            .where('LOWER(request.externalRequestId) LIKE :search', {
              search: `%${query.search!.toLowerCase()}%`,
            })
            .orWhere('LOWER(request.externalOrderId) LIKE :search', {
              search: `%${query.search!.toLowerCase()}%`,
            })
            .orWhere('LOWER(request.serviceId) LIKE :search', {
              search: `%${query.search!.toLowerCase()}%`,
            });
        }),
      );
    }
    const [items, total] = await builder
      .orderBy('request.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async detail(externalRequestId: string, organizationId?: string, externalOrganizationId?: string) {
    return this.detailEntity(
      await this.findRequest(externalRequestId, { organizationId, externalOrganizationId }),
    );
  }

  async authorize(
    externalRequestId: string,
    dto: CorporatePayAuthorizationDto,
    organizationId?: string,
    externalOrganizationId?: string,
  ) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    if (
      [
        CorporatePayRequestStatus.COMPLETED,
        CorporatePayRequestStatus.CANCELLED,
        CorporatePayRequestStatus.REFUNDED,
      ].includes(request.status)
    ) {
      throw new BadRequestException(`Request cannot be authorized in ${request.status} status`);
    }
    let authorization = await this.authorizations.findOne({
      where: { externalAuthorizationId: dto.externalAuthorizationId },
    });
    if (authorization && authorization.requestId !== request.id) {
      throw new ConflictException('CorporatePay authorization is already linked to another request');
    }
    if (dto.currency && dto.currency !== request.currency) {
      throw new BadRequestException(
        `Authorization currency ${dto.currency} does not match request currency ${request.currency}`,
      );
    }
    if (
      [
        CorporatePayAuthorizationStatus.APPROVED,
        CorporatePayAuthorizationStatus.AUTHORIZED,
        CorporatePayAuthorizationStatus.NOT_REQUIRED,
      ].includes(dto.status) &&
      dto.approvedAmount !== undefined &&
      request.amount !== undefined &&
      dto.approvedAmount + 0.01 < request.amount
    ) {
      throw new BadRequestException(
        `Authorized amount ${dto.approvedAmount} is below the quoted amount ${request.amount}`,
      );
    }
    authorization = await this.authorizations.save(
      this.authorizations.create({
        ...(authorization ?? {}),
        externalAuthorizationId: dto.externalAuthorizationId,
        requestId: request.id,
        accountId: request.accountId,
        status: dto.status,
        approvedAmount: dto.approvedAmount ?? request.amount,
        currency: dto.currency ?? request.currency,
        approvalId: dto.approvalId,
        policyId: dto.policyId,
        budgetId: dto.budgetId,
        budgetReservationId: dto.budgetReservationId,
        policyDecision: dto.policyDecision,
        approvalContext: dto.approvalContext,
        budgetContext: dto.budgetContext,
        reason: dto.reason,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        metadata: dto.metadata,
        revokedAt:
          dto.status === CorporatePayAuthorizationStatus.REVOKED ? new Date() : authorization?.revokedAt,
      }),
    );
    request.authorizationId = authorization.id;
    request.authorizationStatus = dto.status;
    request.approvalId = dto.approvalId ?? request.approvalId;
    request.policyId = dto.policyId ?? request.policyId;
    request.budgetId = dto.budgetId ?? request.budgetId;
    request.budgetReservationId = dto.budgetReservationId ?? request.budgetReservationId;

    if (dto.status === CorporatePayAuthorizationStatus.DECLINED) {
      request.status = CorporatePayRequestStatus.DECLINED;
      request.lastError = dto.reason ?? 'CorporatePay authorization declined';
    } else if (dto.status === CorporatePayAuthorizationStatus.EXPIRED) {
      request.status = CorporatePayRequestStatus.EXPIRED;
      request.lastError = dto.reason ?? 'CorporatePay authorization expired';
    } else if (dto.status === CorporatePayAuthorizationStatus.REVOKED) {
      request.status = CorporatePayRequestStatus.CANCELLED;
      request.lastError = dto.reason ?? 'CorporatePay authorization revoked';
    } else if (dto.status === CorporatePayAuthorizationStatus.PENDING) {
      request.status = CorporatePayRequestStatus.PENDING_APPROVAL;
    } else if (dto.status === CorporatePayAuthorizationStatus.APPROVED) {
      request.status = CorporatePayRequestStatus.APPROVED;
    } else {
      request.status = CorporatePayRequestStatus.AUTHORIZED;
    }
    await this.requests.save(request);
    await this.queueEvent(request, 'authorization.updated', {
      externalAuthorizationId: authorization.externalAuthorizationId,
      authorizationStatus: authorization.status,
      approvedAmount: authorization.approvedAmount,
    });

    if (
      [
        CorporatePayAuthorizationStatus.APPROVED,
        CorporatePayAuthorizationStatus.AUTHORIZED,
        CorporatePayAuthorizationStatus.NOT_REQUIRED,
      ].includes(dto.status)
    ) {
      return this.provisionEntity(request, authorization);
    }
    if (request.manualBookingId && dto.status === CorporatePayAuthorizationStatus.REVOKED) {
      await this.cancelEntity(request, { reason: 'CORPORATEPAY_AUTHORIZATION_REVOKED', comment: dto.reason });
    }
    return this.detailEntity(request);
  }

  async provision(externalRequestId: string, organizationId?: string, externalOrganizationId?: string) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    const authorization = await this.authorizations.findOne({
      where: { requestId: request.id },
      order: { createdAt: 'DESC' },
    });
    if (!authorization) throw new BadRequestException('CorporatePay authorization is required');
    return this.provisionEntity(request, authorization);
  }

  async refreshQuote(externalRequestId: string, organizationId?: string, externalOrganizationId?: string) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    if (request.serviceId) throw new BadRequestException('A provisioned service cannot be re-quoted');
    const quote = await this.quote({
      externalRequestId: request.externalRequestId,
      organizationId: request.organizationId,
      externalOrganizationId: request.externalOrganizationId,
      externalMemberId: request.externalMemberId,
      accountId: request.accountId,
      userId: request.userId,
      serviceType: request.serviceType,
      requestKind: request.requestKind,
      customer: request.customer,
      servicePayload: request.servicePayload,
      corporateContext: request.corporateContext,
      scheduledAt: request.scheduledAt?.toISOString(),
      priority: request.priority,
      currency: request.currency,
    });
    request.quote = quote as unknown as Record<string, unknown>;
    request.amount = quote.amount;
    request.currency = quote.currency;
    request.quoteExpiresAt = new Date(quote.expiresAt);
    request.status = CorporatePayRequestStatus.QUOTED;
    await this.requests.save(request);
    await this.queueEvent(request, 'service_request.quoted');
    return this.detailEntity(request);
  }

  async cancel(
    externalRequestId: string,
    dto: CorporatePayPartnerCancelDto,
    organizationId?: string,
    externalOrganizationId?: string,
  ) {
    return this.cancelEntity(
      await this.findRequest(externalRequestId, { organizationId, externalOrganizationId }),
      dto,
    );
  }

  async sync(externalRequestId: string, organizationId?: string, externalOrganizationId?: string) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    await this.syncEntity(request);
    return this.detailEntity(request);
  }

  async rebook(
    externalRequestId: string,
    dto: CorporatePayRebookDto,
    organizationId?: string,
    externalOrganizationId?: string,
  ) {
    const parent = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    const created = await this.createRequest({
      externalRequestId: dto.externalRequestId,
      idempotencyKey: dto.idempotencyKey,
      organizationId: parent.organizationId,
      externalOrganizationId: parent.externalOrganizationId,
      externalMemberId: parent.externalMemberId,
      accountId: parent.accountId,
      userId: parent.userId,
      serviceType: parent.serviceType,
      requestKind: CorporatePayRequestKind.REBOOKING,
      customer: parent.customer,
      servicePayload: dto.servicePayload ?? parent.servicePayload,
      corporateContext: parent.corporateContext,
      scheduledAt: dto.scheduledAt ?? parent.scheduledAt?.toISOString(),
      priority: parent.priority,
      currency: parent.currency,
      externalOrderId: parent.externalOrderId,
      approvalId: parent.approvalId,
      policyId: parent.policyId,
      budgetId: parent.budgetId,
      budgetReservationId: parent.budgetReservationId,
      costCenterId: parent.costCenterId,
      groupId: parent.groupId,
      purchaseOrderId: parent.purchaseOrderId,
      metadata: {
        ...(parent.metadata ?? {}),
        ...(dto.metadata ?? {}),
        parentExternalRequestId: parent.externalRequestId,
        rebookingReason: dto.reason,
      },
    });
    const child = await this.findRequest(dto.externalRequestId, { organizationId: parent.organizationId });
    child.parentRequestId = parent.id;
    await this.requests.save(child);
    return created;
  }

  async refund(
    externalRequestId: string,
    dto: CorporatePayPartnerRefundDto,
    organizationId?: string,
    externalOrganizationId?: string,
  ) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    if (!request.transactionId) throw new BadRequestException('Request has no CorporatePay transaction');
    const actor = await this.organizationActor(request.organizationId);
    const transaction = await this.corporatePay.refund(actor, request.transactionId, {
      amount: dto.amount,
      reason: dto.reason,
    });
    request.status = CorporatePayRequestStatus.REFUNDED;
    request.metadata = {
      ...(request.metadata ?? {}),
      externalRefundId: dto.externalRefundId,
      refundMetadata: dto.metadata,
    };
    await this.requests.save(request);
    await this.queueEvent(request, 'service_request.refunded', {
      externalRefundId: dto.externalRefundId,
      amount: dto.amount ?? transaction.amount,
      reason: dto.reason,
    });
    return this.detailEntity(request);
  }

  async addEvidence(
    externalRequestId: string,
    dto: CreateCorporatePayEvidenceDto,
    organizationId?: string,
    externalOrganizationId?: string,
  ) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    if (dto.externalEvidenceId) {
      const existing = await this.evidence.findOne({ where: { externalEvidenceId: dto.externalEvidenceId } });
      if (existing) {
        if (existing.requestId !== request.id) {
          throw new ConflictException('Evidence ID is already linked to another request');
        }
        return existing;
      }
    }
    if (!dto.url && !dto.fileAssetId && !dto.note) {
      throw new BadRequestException('Evidence requires url, fileAssetId or note');
    }
    const item = await this.evidence.save(
      this.evidence.create({
        requestId: request.id,
        externalEvidenceId: dto.externalEvidenceId,
        type: dto.type,
        url: dto.url,
        fileAssetId: dto.fileAssetId,
        sha256: dto.sha256,
        actor: dto.actor,
        note: dto.note,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
        metadata: dto.metadata,
      }),
    );
    await this.queueEvent(request, 'fulfillment.evidence.added', {
      evidenceId: item.id,
      externalEvidenceId: item.externalEvidenceId,
      type: item.type,
    });
    return item;
  }

  async listEvidence(externalRequestId: string, organizationId?: string, externalOrganizationId?: string) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    return this.evidence.find({ where: { requestId: request.id }, order: { capturedAt: 'DESC' } });
  }

  async createDispute(
    externalRequestId: string,
    dto: CreateCorporatePayDisputeDto,
    organizationId?: string,
    externalOrganizationId?: string,
  ) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    if (dto.externalDisputeId) {
      const existing = await this.disputes.findOne({ where: { externalDisputeId: dto.externalDisputeId } });
      if (existing) return existing;
    }
    const item = await this.disputes.save(
      this.disputes.create({
        requestId: request.id,
        externalDisputeId: dto.externalDisputeId,
        status: CorporatePayDisputeStatus.OPEN,
        reason: dto.reason,
        amount: dto.amount,
        currency: dto.currency ?? request.currency,
        evidence: dto.evidence,
        openedAt: new Date(),
        metadata: dto.metadata,
      }),
    );
    request.metadata = { ...(request.metadata ?? {}), preDisputeStatus: request.status };
    request.status = CorporatePayRequestStatus.DISPUTED;
    await this.requests.save(request);
    await this.queueEvent(request, 'fulfillment.dispute.updated', {
      disputeId: item.id,
      externalDisputeId: item.externalDisputeId,
      status: item.status,
    });
    return item;
  }

  async listDisputes(externalRequestId: string, organizationId?: string, externalOrganizationId?: string) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    return this.disputes.find({ where: { requestId: request.id }, order: { createdAt: 'DESC' } });
  }

  async updateDispute(
    externalRequestId: string,
    disputeId: string,
    dto: UpdateCorporatePayDisputeDto,
    organizationId?: string,
    externalOrganizationId?: string,
  ) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    const item = await this.disputes.findOne({ where: { id: disputeId, requestId: request.id } });
    if (!item) throw new NotFoundException('CorporatePay fulfillment dispute not found');
    item.status = dto.status;
    item.resolution = dto.resolution;
    if (dto.evidence) item.evidence = dto.evidence;
    item.metadata = { ...(item.metadata ?? {}), ...(dto.metadata ?? {}) };
    if ([CorporatePayDisputeStatus.RESOLVED, CorporatePayDisputeStatus.REJECTED].includes(dto.status)) {
      item.resolvedAt = new Date();
      const prior = request.metadata?.preDisputeStatus;
      request.status = this.isRequestStatus(prior)
        ? prior
        : request.completedAt
          ? CorporatePayRequestStatus.COMPLETED
          : CorporatePayRequestStatus.CONFIRMED;
      await this.requests.save(request);
    }
    await this.disputes.save(item);
    await this.queueEvent(request, 'fulfillment.dispute.updated', {
      disputeId: item.id,
      externalDisputeId: item.externalDisputeId,
      status: item.status,
      resolution: item.resolution,
    });
    return item;
  }

  async receipt(externalRequestId: string, organizationId?: string, externalOrganizationId?: string) {
    const request = await this.findRequest(externalRequestId, { organizationId, externalOrganizationId });
    const detail = await this.detailEntity(request);
    const service = detail.service;
    const actualAmount = this.actualServiceAmount(request.serviceType, service) ?? request.amount ?? 0;
    const transaction = detail.transaction;
    const payment = detail.payment;
    return {
      receiptNumber: `EVZ-CP-${request.id.slice(0, 8).toUpperCase()}`,
      externalRequestId: request.externalRequestId,
      externalOrderId: request.externalOrderId,
      serviceType: request.serviceType,
      serviceId: request.serviceId,
      status: request.status,
      scheduledAt: request.scheduledAt,
      fulfilledAt: request.completedAt,
      amount: actualAmount,
      currency: request.currency,
      taxAmount: null,
      payment: transaction
        ? {
            transactionId: transaction.id,
            externalTransactionId: transaction.externalTransactionId,
            reference: transaction.reference,
            status: transaction.status,
            paidAt: transaction.paidAt,
            refundedAt: transaction.refundedAt,
            localPaymentReference: payment?.reference,
          }
        : null,
      allocation: {
        approvalId: request.approvalId,
        policyId: request.policyId,
        budgetId: request.budgetId,
        budgetReservationId: request.budgetReservationId,
        costCenterId: request.costCenterId,
        groupId: request.groupId,
        purchaseOrderId: request.purchaseOrderId,
      },
      service,
      evidence: detail.evidence,
      generatedAt: new Date(),
    };
  }

  async sustainability(query: CorporatePaySustainabilityQueryDto) {
    const organization = await this.resolveOrganization(query);
    const builder = this.requests
      .createQueryBuilder('request')
      .where('request.organizationId = :organizationId', { organizationId: organization.id })
      .andWhere('request.status = :completed', { completed: CorporatePayRequestStatus.COMPLETED });
    if (query.from) builder.andWhere('request.completedAt >= :from', { from: new Date(query.from) });
    if (query.to) builder.andWhere('request.completedAt <= :to', { to: new Date(query.to) });
    const requests = await builder.getMany();
    const evFactor = Number(process.env.CORPORATEPAY_ESG_EV_KG_PER_KM ?? 0.035);
    const hybridFactor = Number(process.env.CORPORATEPAY_ESG_HYBRID_KG_PER_KM ?? 0.12);
    const iceFactor = Number(process.env.CORPORATEPAY_ESG_ICE_KG_PER_KM ?? 0.192);
    const baselineFactor = Number(process.env.CORPORATEPAY_ESG_BASELINE_KG_PER_KM ?? iceFactor);
    const rows = [] as Array<Record<string, unknown>>;
    for (const request of requests) {
      const service = await this.serviceEntity(request.serviceType, request.serviceId);
      const distanceKm = this.serviceDistance(request.serviceType, service);
      const vehicleId = this.stringValue(service?.vehicleId);
      const vehicle = vehicleId ? await this.vehicles.findOne({ where: { id: vehicleId } }) : null;
      const energyType = vehicle?.energyType ?? EnergyType.INTERNAL_COMBUSTION;
      const factor =
        energyType === EnergyType.ELECTRIC
          ? evFactor
          : energyType === EnergyType.HYBRID
            ? hybridFactor
            : iceFactor;
      const emissionsKg = Math.round(distanceKm * factor * 1000) / 1000;
      const avoidedKg = Math.max(0, Math.round(distanceKm * (baselineFactor - factor) * 1000) / 1000);
      rows.push({
        externalRequestId: request.externalRequestId,
        serviceType: request.serviceType,
        serviceId: request.serviceId,
        distanceKm,
        energyType,
        emissionsKg,
        avoidedKg,
        completedAt: request.completedAt,
        costCenterId: request.costCenterId,
        groupId: request.groupId,
      });
    }
    return {
      organizationId: organization.id,
      externalOrganizationId: organization.externalId,
      tripCount: rows.length,
      totalDistanceKm: this.sum(rows, 'distanceKm'),
      estimatedEmissionsKg: this.sum(rows, 'emissionsKg'),
      estimatedAvoidedKg: this.sum(rows, 'avoidedKg'),
      methodology: {
        basis: 'distance-based estimate',
        factorsKgPerKm: { electric: evFactor, hybrid: hybridFactor, internalCombustion: iceFactor },
        baselineKgPerKm: baselineFactor,
        disclaimer: 'Operational estimate; not a certified carbon accounting statement.',
      },
      rows,
      generatedAt: new Date(),
    };
  }

  async reconciliationExport(query: CorporatePayReconciliationExportQueryDto) {
    const organization = await this.resolveOrganization(query);
    const builder = this.requests
      .createQueryBuilder('request')
      .where('request.organizationId = :organizationId', { organizationId: organization.id });
    if (query.status) builder.andWhere('request.status = :status', { status: query.status });
    if (query.from) builder.andWhere('request.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) builder.andWhere('request.createdAt <= :to', { to: new Date(query.to) });
    const requests = await builder.orderBy('request.createdAt', 'DESC').take(10_000).getMany();
    const transactionIds = requests.map((item) => item.transactionId).filter(Boolean) as string[];
    const requestIds = requests.map((item) => item.id);
    const [transactions, disputes, evidence] = await Promise.all([
      transactionIds.length ? this.transactions.find({ where: { id: In(transactionIds) } }) : [],
      requestIds.length ? this.disputes.find({ where: { requestId: In(requestIds) } }) : [],
      requestIds.length ? this.evidence.find({ where: { requestId: In(requestIds) } }) : [],
    ]);
    const transactionMap = new Map(transactions.map((item) => [item.id, item]));
    const paymentIds = transactions.map((item) => item.paymentId).filter(Boolean) as string[];
    const payments = paymentIds.length ? await this.payments.find({ where: { id: In(paymentIds) } }) : [];
    const paymentMap = new Map(payments.map((item) => [item.id, item]));
    const disputeMap = new Map<string, CorporatePayFulfillmentDispute[]>();
    for (const item of disputes)
      disputeMap.set(item.requestId, [...(disputeMap.get(item.requestId) ?? []), item]);
    const evidenceCount = new Map<string, number>();
    for (const item of evidence)
      evidenceCount.set(item.requestId, (evidenceCount.get(item.requestId) ?? 0) + 1);
    const rows = requests.map((request) => {
      const transaction = request.transactionId ? transactionMap.get(request.transactionId) : undefined;
      const payment = transaction?.paymentId ? paymentMap.get(transaction.paymentId) : undefined;
      return {
        externalRequestId: request.externalRequestId,
        externalOrderId: request.externalOrderId,
        externalMemberId: request.externalMemberId,
        serviceType: request.serviceType,
        serviceId: request.serviceId,
        requestStatus: request.status,
        authorizationStatus: request.authorizationStatus,
        amount: request.amount,
        currency: request.currency,
        transactionReference: transaction?.reference,
        externalTransactionId: transaction?.externalTransactionId,
        transactionStatus: transaction?.status,
        paymentReference: payment?.reference,
        paymentStatus: payment?.status,
        approvalId: request.approvalId,
        policyId: request.policyId,
        budgetId: request.budgetId,
        budgetReservationId: request.budgetReservationId,
        costCenterId: request.costCenterId,
        groupId: request.groupId,
        purchaseOrderId: request.purchaseOrderId,
        evidenceCount: evidenceCount.get(request.id) ?? 0,
        disputeStatuses: (disputeMap.get(request.id) ?? []).map((item) => item.status),
        createdAt: request.createdAt,
        confirmedAt: request.confirmedAt,
        completedAt: request.completedAt,
        cancelledAt: request.cancelledAt,
      };
    });
    return {
      organizationId: organization.id,
      externalOrganizationId: organization.externalId,
      rowCount: rows.length,
      rows,
      generatedAt: new Date(),
    };
  }

  async listEvents(after?: string, limit = 100) {
    const builder = this.outbox
      .createQueryBuilder('event')
      .where('event.destination = :destination', { destination: 'CORPORATEPAY_EVENT' });
    if (after) builder.andWhere('event.createdAt > :after', { after: new Date(after) });
    const items = await builder
      .orderBy('event.createdAt', 'ASC')
      .take(Math.min(Math.max(limit, 1), 500))
      .getMany();
    return { items, cursor: items.at(-1)?.createdAt?.toISOString() ?? after ?? null };
  }

  async acknowledgeEvent(id: string, dto: CorporatePayEventAckDto) {
    const event = await this.outbox.findOne({ where: { id, destination: 'CORPORATEPAY_EVENT' } });
    if (!event) throw new NotFoundException('CorporatePay integration event not found');
    event.status = 'PROCESSED';
    event.processedAt = new Date();
    event.payload = {
      ...event.payload,
      acknowledgement: {
        externalReceiptId: dto.externalReceiptId,
        metadata: dto.metadata,
        acknowledgedAt: new Date().toISOString(),
      },
    };
    return this.outbox.save(event);
  }

  @OnEvent('dispatch.booking.updated')
  async onDispatchBookingUpdated(event: { manualBookingId?: string }) {
    if (!event.manualBookingId) return;
    const request = await this.requests.findOne({ where: { manualBookingId: event.manualBookingId } });
    if (request) await this.syncEntity(request).catch(() => undefined);
  }

  @OnEvent('corporatepay.updated')
  async onCorporatePayUpdated(event: { transactionId?: string }) {
    if (!event.transactionId) return;
    const request = await this.requests.findOne({ where: { transactionId: event.transactionId } });
    if (request) await this.syncEntity(request).catch(() => undefined);
  }

  @Cron('15 * * * * *')
  async syncActiveRequests() {
    const items = await this.requests.find({
      where: {
        status: In([
          CorporatePayRequestStatus.AUTHORIZED,
          CorporatePayRequestStatus.CONFIRMED,
          CorporatePayRequestStatus.IN_PROGRESS,
        ]),
      },
      take: 100,
      order: { updatedAt: 'ASC' },
    });
    for (const item of items) await this.syncEntity(item).catch(() => undefined);
    await this.heartbeat?.record('CorporateIntegrationService.syncActiveRequests', 60);
  }

  @Cron('*/30 * * * * *')
  async deliverEvents() {
    const endpoint = this.eventsEndpoint();
    if (!endpoint) return;
    const items = await this.outbox
      .createQueryBuilder('event')
      .where('event.destination = :destination', { destination: 'CORPORATEPAY_EVENT' })
      .andWhere('event.status = :status', { status: 'PENDING' })
      .andWhere('(event.nextAttemptAt IS NULL OR event.nextAttemptAt <= :now)', { now: new Date() })
      .orderBy('event.createdAt', 'ASC')
      .take(25)
      .getMany();
    for (const item of items) {
      try {
        const url = new URL(endpoint);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = randomUUID();
        const body = item.payload;
        const signature = signCorporatePayRequest(
          { timestamp, nonce, method: 'POST', path: `${url.pathname}${url.search}`, body },
          getRequiredSecret(
            'CORPORATEPAY_PARTNER_SHARED_SECRET',
            process.env.CORPORATEPAY_PARTNER_SHARED_SECRET,
            process.env.NODE_ENV,
            { allowLocalFallback: true, localFallback: 'evzone-corporatepay-local-shared-secret' },
          ),
        );
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': item.id,
            'x-corporatepay-client-id': process.env.EVZONE_RIDE_PARTNER_CLIENT_ID ?? 'evzone-ride',
            'x-corporatepay-timestamp': timestamp,
            'x-corporatepay-nonce': nonce,
            'x-corporatepay-signature': signature,
            ...(process.env.CORPORATEPAY_API_KEY
              ? { Authorization: `Bearer ${process.env.CORPORATEPAY_API_KEY}` }
              : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`CorporatePay event endpoint returned HTTP ${response.status}`);
        item.status = 'PROCESSED';
        item.processedAt = new Date();
        item.lastError = undefined;
      } catch (error) {
        item.attempts += 1;
        item.lastError = error instanceof Error ? error.message : String(error);
        item.nextAttemptAt = new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** item.attempts));
        if (item.attempts >= 12) item.status = 'FAILED';
      }
      await this.outbox.save(item);
    }
    await this.heartbeat?.record('CorporateIntegrationService.deliverEvents', 30);
  }

  private async provisionEntity(
    request: CorporatePayPartnerRequest,
    authorization: CorporatePayAuthorization,
  ) {
    if (request.serviceId || request.manualBookingId) return this.detailEntity(request);
    if (
      ![
        CorporatePayAuthorizationStatus.APPROVED,
        CorporatePayAuthorizationStatus.AUTHORIZED,
        CorporatePayAuthorizationStatus.NOT_REQUIRED,
      ].includes(authorization.status)
    ) {
      throw new BadRequestException(`Authorization is ${authorization.status}`);
    }
    if (authorization.expiresAt && authorization.expiresAt <= new Date()) {
      authorization.status = CorporatePayAuthorizationStatus.EXPIRED;
      await this.authorizations.save(authorization);
      request.authorizationStatus = CorporatePayAuthorizationStatus.EXPIRED;
      request.status = CorporatePayRequestStatus.EXPIRED;
      await this.requests.save(request);
      throw new BadRequestException('CorporatePay authorization has expired');
    }
    if (request.quoteExpiresAt && request.quoteExpiresAt <= new Date()) {
      throw new BadRequestException(
        'Service quote has expired; refresh the quote and re-authorize the request',
      );
    }
    const approvedAmount = authorization.approvedAmount ?? request.amount;
    if (approvedAmount === undefined) throw new BadRequestException('Authorization amount is missing');
    const claim = await this.authorizations
      .createQueryBuilder()
      .update(CorporatePayAuthorization)
      .set({ status: CorporatePayAuthorizationStatus.CONSUMED, consumedAt: new Date() })
      .where('id = :id', { id: authorization.id })
      .andWhere('status IN (:...statuses)', {
        statuses: [
          CorporatePayAuthorizationStatus.APPROVED,
          CorporatePayAuthorizationStatus.AUTHORIZED,
          CorporatePayAuthorizationStatus.NOT_REQUIRED,
        ],
      })
      .execute();
    if (!claim.affected) {
      const refreshed = await this.requests.findOne({ where: { id: request.id } });
      if (refreshed?.serviceId) return this.detailEntity(refreshed);
      throw new ConflictException('CorporatePay request is already being provisioned');
    }
    authorization.status = CorporatePayAuthorizationStatus.CONSUMED;
    authorization.consumedAt = new Date();
    request.authorizationStatus = CorporatePayAuthorizationStatus.CONSUMED;
    request.status = CorporatePayRequestStatus.AUTHORIZED;
    await this.requests.save(request);

    try {
      const organization = await this.organizations.findOne({ where: { id: request.organizationId } });
      if (!organization) throw new NotFoundException('Organization not found');
      const actor = await this.organizationActor(request.organizationId);
      const account = await this.resolveOrCreateAccount(
        organization,
        request.userId ?? organization.primaryOwnerUserId,
        request.accountId ?? request.externalOrganizationId,
        request.currency,
      );
      const customer = {
        ...request.customer,
        ...(request.userId ? { userId: request.userId } : {}),
        metadata: {
          ...(this.recordValue(request.customer.metadata) ?? {}),
          source: 'CORPORATE_PAY',
          externalOrganizationId: request.externalOrganizationId,
          externalMemberId: request.externalMemberId,
        },
      };
      const result = (await this.dispatch.createManualBooking(actor, request.organizationId, {
        source: BookingSource.CORPORATE_PAY,
        serviceType: request.serviceType,
        priority: request.priority,
        customer,
        payload: {
          ...request.servicePayload,
          paymentMethod: PaymentMethod.CORPORATE_PAY,
          corporatePayRequestId: request.id,
          externalCorporateRequestId: request.externalRequestId,
        },
        scheduledAt: request.scheduledAt?.toISOString(),
        paymentMethod: PaymentMethod.CORPORATE_PAY,
        quotedAmount: request.amount,
        notes: `CorporatePay request ${request.externalRequestId}`,
        corporatePayAccountId: account.id,
        corporatePayExternalRequestId: request.externalRequestId,
        corporatePayExternalAuthorizationId: authorization.externalAuthorizationId,
        corporatePayAuthorizedAmount: approvedAmount,
        corporatePayApprovalId: authorization.approvalId ?? request.approvalId,
        corporatePayPolicyId: authorization.policyId ?? request.policyId,
        corporatePayBudgetId: authorization.budgetId ?? request.budgetId,
        corporatePayBudgetReservationId: authorization.budgetReservationId ?? request.budgetReservationId,
        corporatePayCostCenterId: request.costCenterId,
        corporatePayGroupId: request.groupId,
        corporatePayPurchaseOrderId: request.purchaseOrderId,
        corporateContext: request.corporateContext,
      })) as {
        booking?: ManualBooking;
        transaction?: CorporatePayTransaction;
      };
      const booking = result.booking;
      if (!booking) throw new BadRequestException('Dispatcher did not return a provisioned booking');
      request.manualBookingId = booking.id;
      request.serviceId = booking.serviceId;
      request.transactionId = booking.corporatePayTransactionId;
      request.status = CorporatePayRequestStatus.CONFIRMED;
      request.confirmedAt = new Date();
      request.lastError = undefined;
      await this.requests.save(request);
      if (request.transactionId) {
        const transaction = await this.transactions.findOne({ where: { id: request.transactionId } });
        if (
          transaction &&
          [CorporatePayTransactionStatus.DECLINED, CorporatePayTransactionStatus.FAILED].includes(
            transaction.status,
          )
        ) {
          request.status =
            transaction.status === CorporatePayTransactionStatus.DECLINED
              ? CorporatePayRequestStatus.DECLINED
              : CorporatePayRequestStatus.FAILED;
          request.lastError = transaction.lastError;
          await this.requests.save(request);
        }
      }
      await this.queueEvent(request, 'service_request.provisioned', {
        manualBookingId: request.manualBookingId,
        serviceId: request.serviceId,
        transactionId: request.transactionId,
      });
      return this.detailEntity(request);
    } catch (error) {
      authorization.status = CorporatePayAuthorizationStatus.AUTHORIZED;
      authorization.consumedAt = undefined;
      await this.authorizations.save(authorization);
      request.authorizationStatus = CorporatePayAuthorizationStatus.AUTHORIZED;
      request.status = CorporatePayRequestStatus.FAILED;
      request.lastError = error instanceof Error ? error.message : String(error);
      await this.requests.save(request);
      await this.queueEvent(request, 'service_request.failed', { error: request.lastError });
      throw error;
    }
  }

  private async cancelEntity(request: CorporatePayPartnerRequest, dto: CorporatePayPartnerCancelDto) {
    if ([CorporatePayRequestStatus.COMPLETED, CorporatePayRequestStatus.REFUNDED].includes(request.status)) {
      throw new BadRequestException(`Request cannot be cancelled in ${request.status} status`);
    }
    if (request.manualBookingId) {
      const actor = await this.organizationActor(request.organizationId);
      await this.dispatch.cancel(actor, request.organizationId, request.manualBookingId, {
        reason: dto.reason,
        comment: dto.comment,
      });
    }
    request.status = CorporatePayRequestStatus.CANCELLED;
    request.cancelledAt = new Date();
    request.lastError = [dto.reason, dto.comment].filter(Boolean).join(': ');
    await this.requests.save(request);
    await this.queueEvent(request, 'service_request.cancelled', {
      reason: dto.reason,
      comment: dto.comment,
    });
    return this.detailEntity(request);
  }

  private async syncEntity(request: CorporatePayPartnerRequest) {
    const previousStatus = request.status;
    let booking: ManualBooking | null = null;
    if (request.manualBookingId) {
      const actor = await this.organizationActor(request.organizationId);
      const synced = await this.dispatch.syncStatus(actor, request.organizationId, request.manualBookingId);
      booking = synced.booking;
      request.serviceId = booking.serviceId ?? request.serviceId;
      request.transactionId = booking.corporatePayTransactionId ?? request.transactionId;
      request.status = this.mapManualStatus(booking.status, request.status);
    }
    const transaction = request.transactionId
      ? await this.transactions.findOne({ where: { id: request.transactionId } })
      : null;
    if (transaction) {
      if (transaction.status === CorporatePayTransactionStatus.DECLINED)
        request.status = CorporatePayRequestStatus.DECLINED;
      if (transaction.status === CorporatePayTransactionStatus.FAILED)
        request.status = CorporatePayRequestStatus.FAILED;
      if (transaction.status === CorporatePayTransactionStatus.CANCELLED)
        request.status = CorporatePayRequestStatus.CANCELLED;
      if (transaction.status === CorporatePayTransactionStatus.REFUNDED)
        request.status = CorporatePayRequestStatus.REFUNDED;
      if (
        [CorporatePayTransactionStatus.APPROVED, CorporatePayTransactionStatus.AUTHORIZED].includes(
          transaction.status,
        ) &&
        request.status === CorporatePayRequestStatus.PENDING_APPROVAL
      ) {
        request.status = CorporatePayRequestStatus.AUTHORIZED;
      }
    }
    request.lastSyncedAt = new Date();
    if (request.status === CorporatePayRequestStatus.COMPLETED) {
      request.completedAt ??= new Date();
      await this.ensureCompletionEvidence(request);
    }
    if (request.status === CorporatePayRequestStatus.CANCELLED) request.cancelledAt ??= new Date();
    await this.requests.save(request);
    if (previousStatus !== request.status) {
      await this.queueEvent(request, 'service_request.status_changed', {
        previousStatus,
        status: request.status,
        manualBookingStatus: booking?.status,
        transactionStatus: transaction?.status,
      });
    }
    return request;
  }

  private async detailEntity(request: CorporatePayPartnerRequest) {
    const [authorization, authorizations, evidence, disputes, booking, transaction, service] =
      await Promise.all([
        request.authorizationId
          ? this.authorizations.findOne({ where: { id: request.authorizationId } })
          : null,
        this.authorizations.find({ where: { requestId: request.id }, order: { createdAt: 'DESC' } }),
        this.evidence.find({ where: { requestId: request.id }, order: { capturedAt: 'DESC' } }),
        this.disputes.find({ where: { requestId: request.id }, order: { createdAt: 'DESC' } }),
        request.manualBookingId
          ? this.manualBookings.findOne({ where: { id: request.manualBookingId } })
          : null,
        request.transactionId ? this.transactions.findOne({ where: { id: request.transactionId } }) : null,
        this.serviceEntity(request.serviceType, request.serviceId),
      ]);
    const payment = transaction?.paymentId
      ? await this.payments.findOne({ where: { id: transaction.paymentId } })
      : null;
    return {
      request,
      authorization,
      authorizations,
      booking,
      transaction,
      payment,
      service: this.sanitizeService(request.serviceType, service),
      evidence,
      disputes,
    };
  }

  private async ensureCompletionEvidence(request: CorporatePayPartnerRequest) {
    const existing = await this.evidence.find({ where: { requestId: request.id } });
    const types = new Set(existing.map((item) => item.type));
    if (!types.has(CorporatePayEvidenceType.COMPLETION_LOG)) {
      await this.evidence.save(
        this.evidence.create({
          requestId: request.id,
          type: CorporatePayEvidenceType.COMPLETION_LOG,
          actor: 'EVZONE_RIDE_BACKEND',
          note: `${request.serviceType} service ${request.serviceId ?? ''} completed`,
          capturedAt: request.completedAt ?? new Date(),
          metadata: { generated: true, status: request.status },
        }),
      );
    }
    if (!types.has(CorporatePayEvidenceType.TRIP_RECEIPT)) {
      await this.evidence.save(
        this.evidence.create({
          requestId: request.id,
          type: CorporatePayEvidenceType.TRIP_RECEIPT,
          actor: 'EVZONE_RIDE_BACKEND',
          note: `Receipt available at /api/v1/corporate-pay/partner/service-requests/${request.externalRequestId}/receipt`,
          capturedAt: request.completedAt ?? new Date(),
          metadata: { generated: true },
        }),
      );
    }
  }

  private async quoteService(
    serviceType: ServiceType,
    payload: Record<string, unknown>,
    userId?: string,
  ): Promise<Record<string, unknown>> {
    switch (serviceType) {
      case ServiceType.RIDE:
        return this.asRecord(
          await this.rides.estimate(userId, await this.validated(EstimateRideDto, payload)),
        );
      case ServiceType.DELIVERY:
        return this.asRecord(
          await this.deliveries.estimate(userId, await this.validated(EstimateDeliveryDto, payload)),
        );
      case ServiceType.TOURIST_VEHICLE:
        return this.asRecord(
          await this.tourist.quote(userId, await this.validated(TouristQuoteDto, payload)),
        );
      case ServiceType.AMBULANCE:
        return this.asRecord(
          await this.ambulances.estimate(userId, await this.validated(AmbulanceEstimateDto, payload)),
        );
      case ServiceType.CAR_RENTAL:
        return this.asRecord(await this.rentals.quote(await this.validated(RentalQuoteDto, payload)));
      case ServiceType.SCHOOL_SHUTTLE: {
        const amount = Number(payload.amount);
        if (!Number.isFinite(amount) || amount < 0) {
          throw new BadRequestException('School shuttle quote requires servicePayload.amount');
        }
        return {
          serviceType,
          total: amount,
          currency: this.stringValue(payload.currency) ?? 'UGX',
          breakdown: { externalSchoolBackend: true },
        };
      }
    }
  }

  private async validated<T extends object>(
    cls: ClassConstructor<T>,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const instance = plainToInstance(cls, payload);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: false });
    if (errors.length) {
      const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
      throw new BadRequestException(
        `Invalid ${cls.name} payload: ${messages.join('; ') || 'nested validation failed'}`,
      );
    }
    return instance;
  }

  private async resolveOrganization(input: {
    organizationId?: string;
    externalOrganizationId?: string;
    accountId?: string;
  }) {
    if (input.organizationId) {
      const organization = await this.organizations.findOne({ where: { id: input.organizationId } });
      if (!organization) throw new NotFoundException('EVzone organization not found');
      return organization;
    }
    if (input.externalOrganizationId) {
      const organization = await this.organizations.findOne({
        where: { externalId: input.externalOrganizationId },
      });
      if (organization) return organization;
    }
    if (input.accountId) {
      const account = await this.accounts.findOne({
        where: [{ id: input.accountId }, { externalAccountId: input.accountId }],
      });
      if (account?.organizationId) {
        const organization = await this.organizations.findOne({ where: { id: account.organizationId } });
        if (organization) return organization;
      }
    }
    throw new NotFoundException(
      'CorporatePay organization is not linked to an EVzone organization. Supply organizationId or map externalOrganizationId.',
    );
  }

  private async resolveUser(dto: {
    userId?: string;
    email?: string;
    phone?: string;
    externalOrganizationId?: string;
    externalMemberId?: string;
  }) {
    const subject = await this.resolveSubjectLink(dto.externalOrganizationId, dto.externalMemberId);
    if (subject) {
      const user = await this.users.findOne({ where: { id: subject.userId } });
      if (user) return user;
    }
    if (dto.userId) {
      const user = await this.users.findOne({ where: { id: dto.userId } });
      if (user) return user;
    }
    if (dto.email) {
      const user = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
      if (user) return user;
    }
    if (dto.phone) {
      const user = await this.users.findOne({ where: { phone: dto.phone } });
      if (user) return user;
    }
    throw new NotFoundException('EVzone user could not be resolved for the CorporatePay subject');
  }

  private async resolveQuoteUserId(
    dto: CorporatePayPartnerQuoteDto,
    organization: Organization,
  ): Promise<string | undefined> {
    const subject = await this.resolveSubjectLink(dto.externalOrganizationId, dto.externalMemberId);
    if (subject) return subject.userId;
    if (dto.userId) return dto.userId;
    const customer = dto.customer as unknown as Record<string, unknown>;
    const customerUserId = this.stringValue(customer.userId);
    if (customerUserId) return customerUserId;
    const email = this.stringValue(customer.email)?.toLowerCase();
    if (email) return (await this.users.findOne({ where: { email } }))?.id;
    const phone = this.stringValue(customer.phone);
    if (phone) return (await this.users.findOne({ where: { phone } }))?.id;
    return organization.primaryOwnerUserId;
  }

  private resolveSubjectLink(externalOrganizationId?: string, externalMemberId?: string) {
    if (!externalOrganizationId || !externalMemberId) return Promise.resolve(null);
    return this.subjectLinks.findOne({
      where: { externalOrganizationId, externalMemberId, status: 'ACTIVE' },
    });
  }

  private async resolveOrCreateAccount(
    organization: Organization,
    userId: string,
    accountId: string | undefined,
    currency: string,
  ) {
    if (accountId) {
      const existing = await this.accounts.findOne({
        where: [{ id: accountId }, { externalAccountId: accountId }],
      });
      if (existing) {
        if (existing.organizationId && existing.organizationId !== organization.id) {
          throw new ConflictException('CorporatePay account is linked to another EVzone organization');
        }
        return existing;
      }
    }
    const externalAccountId = accountId ?? organization.externalId ?? `CP-ORG-${organization.id}`;
    const existing = await this.accounts.findOne({ where: { externalAccountId } });
    if (existing) return existing;
    return this.accounts.save(
      this.accounts.create({
        externalAccountId,
        organizationId: organization.id,
        userId,
        name: `${organization.name} CorporatePay`,
        status: 'ACTIVE',
        currency: currency || organization.currency || 'UGX',
        metadata: { autoLinkedBy: 'CORPORATEPAY_PARTNER_API' },
      }),
    );
  }

  private async organizationActor(organizationId: string): Promise<AuthUser> {
    const organization = await this.organizations.findOne({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organization not found');
    const owner = await this.users.findOne({ where: { id: organization.primaryOwnerUserId } });
    if (!owner) throw new NotFoundException('Organization owner user not found');
    return {
      id: owner.id,
      email: owner.email,
      phone: owner.phone,
      role: owner.role ?? UserRole.CUSTOMER,
      firstName: owner.firstName,
      lastName: owner.lastName,
    };
  }

  private async findRequest(
    externalRequestId: string,
    scope?: { organizationId?: string; externalOrganizationId?: string },
  ) {
    let organizationId = scope?.organizationId;
    if (!organizationId && scope?.externalOrganizationId) {
      organizationId = (await this.resolveOrganization(scope)).id;
    }
    if (organizationId) {
      const request = await this.requests.findOne({ where: { organizationId, externalRequestId } });
      if (!request) throw new NotFoundException('CorporatePay service request not found');
      return request;
    }
    const matches = await this.requests.find({ where: { externalRequestId }, take: 2 });
    if (!matches.length) throw new NotFoundException('CorporatePay service request not found');
    if (matches.length > 1) {
      throw new BadRequestException(
        'organizationId or externalOrganizationId is required for this request ID',
      );
    }
    return matches[0];
  }

  private async serviceEntity(
    type: ServiceType,
    serviceId?: string,
  ): Promise<Record<string, unknown> | null> {
    if (!serviceId) return null;
    let entity: unknown;
    switch (type) {
      case ServiceType.RIDE:
        entity = await this.ridesRepository.findOne({ where: { id: serviceId } });
        break;
      case ServiceType.DELIVERY:
        entity = await this.deliveriesRepository.findOne({ where: { id: serviceId } });
        break;
      case ServiceType.TOURIST_VEHICLE:
        entity = await this.touristRepository.findOne({ where: { id: serviceId } });
        break;
      case ServiceType.AMBULANCE:
        entity = await this.ambulanceRepository.findOne({ where: { id: serviceId } });
        break;
      case ServiceType.CAR_RENTAL:
        entity = await this.rentalRepository.findOne({ where: { id: serviceId } });
        break;
      case ServiceType.SCHOOL_SHUTTLE:
        entity = { id: serviceId, externalTripId: serviceId, source: 'SCHOOL_BACKEND' };
        break;
    }
    return entity ? this.asRecord(entity) : null;
  }

  private sanitizeService(type: ServiceType, service: Record<string, unknown> | null) {
    if (!service) return null;
    if (type !== ServiceType.AMBULANCE) return service;
    return {
      id: service.id,
      status: service.status,
      priority: service.priority,
      pickupAddress: service.pickupAddress,
      destinationAddress: service.destinationAddress,
      scheduledAt: service.scheduledAt,
      estimatedDistanceKm: service.estimatedDistanceKm,
      estimatedDurationMinutes: service.estimatedDurationMinutes,
      estimatedCost: service.estimatedCost,
      finalCost: service.finalCost,
      paymentStatus: service.paymentStatus,
      vehicleId: service.vehicleId,
      driverId: service.driverId,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };
  }

  private mapManualStatus(
    status: ManualBookingStatus,
    current: CorporatePayRequestStatus,
  ): CorporatePayRequestStatus {
    if (current === CorporatePayRequestStatus.DISPUTED) return current;
    switch (status) {
      case ManualBookingStatus.COMPLETED:
        return CorporatePayRequestStatus.COMPLETED;
      case ManualBookingStatus.CANCELLED:
        return CorporatePayRequestStatus.CANCELLED;
      case ManualBookingStatus.FAILED:
        return CorporatePayRequestStatus.FAILED;
      case ManualBookingStatus.IN_PROGRESS:
        return CorporatePayRequestStatus.IN_PROGRESS;
      case ManualBookingStatus.ASSIGNED:
      case ManualBookingStatus.DISPATCH_PENDING:
      case ManualBookingStatus.CONFIRMED:
        return CorporatePayRequestStatus.CONFIRMED;
      default:
        return current;
    }
  }

  private actualServiceAmount(type: ServiceType, service: Record<string, unknown> | null) {
    if (!service) return undefined;
    const keys: Record<ServiceType, string[]> = {
      [ServiceType.RIDE]: ['finalFare', 'estimatedFare'],
      [ServiceType.DELIVERY]: ['finalCost', 'estimatedCost'],
      [ServiceType.TOURIST_VEHICLE]: ['finalAmount', 'estimatedAmount'],
      [ServiceType.AMBULANCE]: ['finalCost', 'estimatedCost'],
      [ServiceType.CAR_RENTAL]: ['finalAmount', 'estimatedAmount'],
      [ServiceType.SCHOOL_SHUTTLE]: ['amount'],
    };
    for (const key of keys[type]) {
      const value = Number(service[key]);
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  }

  private serviceDistance(type: ServiceType, service: Record<string, unknown> | null) {
    if (!service) return 0;
    const keys =
      type === ServiceType.RIDE
        ? ['actualDistanceKm', 'estimatedDistanceKm']
        : ['actualDistanceKm', 'estimatedDistanceKm', 'distanceKm'];
    for (const key of keys) {
      const value = Number(service[key]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
    return 0;
  }

  private quoteAmount(
    raw: Record<string, unknown>,
    serviceType: ServiceType,
    payload: Record<string, unknown>,
  ) {
    for (const key of ['total', 'estimatedAmount', 'estimatedCost', 'amount']) {
      const value = Number(raw[key]);
      if (Number.isFinite(value)) return value;
    }
    if (serviceType === ServiceType.SCHOOL_SHUTTLE) return Number(payload.amount);
    return Number.NaN;
  }

  private quoteCurrency(raw: Record<string, unknown>, fallback: string) {
    return this.stringValue(raw.currency) ?? fallback ?? 'UGX';
  }

  private defaultRequestKind(serviceType: ServiceType, scheduledAt?: string) {
    if (serviceType === ServiceType.DELIVERY) return CorporatePayRequestKind.DELIVERY;
    if (serviceType === ServiceType.RIDE && scheduledAt) return CorporatePayRequestKind.RIDE_SCHEDULE;
    return CorporatePayRequestKind.SERVICE_BOOKING;
  }

  private async queueEvent(
    request: CorporatePayPartnerRequest,
    eventType: string,
    data?: Record<string, unknown>,
  ) {
    const eventId = randomUUID();
    return this.outbox.save(
      this.outbox.create({
        destination: 'CORPORATEPAY_EVENT',
        aggregateType: 'CorporatePayPartnerRequest',
        aggregateId: request.id,
        eventType,
        payload: {
          id: eventId,
          type: eventType,
          occurredAt: new Date().toISOString(),
          source: 'EVZONE_RIDE',
          contractVersion: '2026-06-21',
          data: {
            externalRequestId: request.externalRequestId,
            externalOrderId: request.externalOrderId,
            externalOrganizationId: request.externalOrganizationId,
            externalMemberId: request.externalMemberId,
            serviceType: request.serviceType,
            serviceId: request.serviceId,
            status: request.status,
            authorizationStatus: request.authorizationStatus,
            amount: request.amount,
            currency: request.currency,
            transactionId: request.transactionId,
            costCenterId: request.costCenterId,
            groupId: request.groupId,
            ...data,
          },
        },
        status: 'PENDING',
        nextAttemptAt: new Date(),
      }),
    );
  }

  private eventsEndpoint() {
    if (process.env.CORPORATEPAY_EVENTS_URL) return process.env.CORPORATEPAY_EVENTS_URL;
    if (!process.env.CORPORATEPAY_BASE_URL) return undefined;
    return `${process.env.CORPORATEPAY_BASE_URL.replace(/\/$/, '')}/api/v1/integrations/evzone/events`;
  }

  private recordValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private isRequestStatus(value: unknown): value is CorporatePayRequestStatus {
    return Object.values(CorporatePayRequestStatus).includes(value as CorporatePayRequestStatus);
  }

  private sum(rows: Array<Record<string, unknown>>, key: string) {
    return Math.round(rows.reduce((total, row) => total + Number(row[key] ?? 0), 0) * 1000) / 1000;
  }
}
