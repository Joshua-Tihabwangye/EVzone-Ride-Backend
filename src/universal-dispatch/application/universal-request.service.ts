import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  UniversalDispatchCancellation,
  UniversalDispatchIdempotency,
  UniversalRequestRequirement,
  UniversalRequestStop,
  UniversalServiceRequest,
} from '../domain/universal-dispatch.entities';
import {
  DispatchCancellationParty,
  UniversalRequestStatus,
  UniversalScheduleType,
  TERMINAL_REQUEST_STATUSES,
} from '../domain/universal-dispatch.enums';
import { AuditService } from '../../audit/audit.service';
import { DispatchPolicyService } from './dispatch-policy.service';
import { UniversalDispatchStateMachineService } from './universal-dispatch-state-machine.service';
import { UniversalOutboxService } from '../infrastructure/universal-outbox.service';
import { DispatchRealtimeService } from '../infrastructure/dispatch-realtime.service';
import {
  CancelUniversalRequestDto,
  CreateUniversalServiceRequestDto,
  RescheduleUniversalRequestDto,
} from '../universal-dispatch.dto';

@Injectable()
export class UniversalRequestService {
  private defaultMarketId = 'default';

  constructor(
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    @InjectRepository(UniversalRequestStop)
    private readonly stops: Repository<UniversalRequestStop>,
    @InjectRepository(UniversalRequestRequirement)
    private readonly requirements: Repository<UniversalRequestRequirement>,
    @InjectRepository(UniversalDispatchCancellation)
    private readonly cancellations: Repository<UniversalDispatchCancellation>,
    @InjectRepository(UniversalDispatchIdempotency)
    private readonly idempotency: Repository<UniversalDispatchIdempotency>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly policyService: DispatchPolicyService,
    private readonly outbox: UniversalOutboxService,
    private readonly realtime: DispatchRealtimeService,
    private readonly stateMachine: UniversalDispatchStateMachineService,
    private readonly auditService: AuditService,
  ) {}

  private readonly logger = new Logger(UniversalRequestService.name);

  async create(
    requesterUserId: string,
    input: CreateUniversalServiceRequestDto,
    idempotencyKey?: string,
  ): Promise<UniversalServiceRequest> {
    const marketId = input.marketId ?? this.defaultMarketId;
    const { policy } = await this.policyService.resolve(input.serviceType, marketId);
    const scheduleType = input.scheduleType ?? UniversalScheduleType.IMMEDIATE;

    return this.dataSource.transaction(async (manager) => {
      const requestRepository = manager.getRepository(UniversalServiceRequest);
      const stopRepository = manager.getRepository(UniversalRequestStop);
      const requirementRepository = manager.getRepository(UniversalRequestRequirement);
      const idempotencyRepository = manager.getRepository(UniversalDispatchIdempotency);

      if (idempotencyKey) {
        const existing = await idempotencyRepository.findOne({
          where: { scope: 'service_request', keyHash: idempotencyKey },
        });
        if (existing) {
          const request = await requestRepository.findOne({
            where: { clientRequestId: input.clientRequestId },
          });
          if (request) return request;
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key reused with different payload',
          });
        }
      }

      const existingRequest = await requestRepository.findOne({
        where: { clientRequestId: input.clientRequestId, requesterUserId },
      });
      if (existingRequest) {
        return existingRequest;
      }

      const status =
        scheduleType === UniversalScheduleType.IMMEDIATE
          ? UniversalRequestStatus.SEARCHING
          : UniversalRequestStatus.SCHEDULED;

      let request = requestRepository.create({
        clientRequestId: input.clientRequestId,
        requesterUserId,
        beneficiaryUserId: input.beneficiaryUserId,
        organizationId: input.organizationId,
        serviceFamily: input.serviceFamily,
        serviceType: input.serviceType,
        scheduleType,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        recurrenceRule: input.recurrenceRule,
        marketId,
        status,
        pickupLatitude: input.pickup.latitude,
        pickupLongitude: input.pickup.longitude,
        dropoffLatitude: input.dropoff.latitude,
        dropoffLongitude: input.dropoff.longitude,
        pickupAddress: input.pickup.address,
        dropoffAddress: input.dropoff.address,
        passengerCount: input.passengerCount,
        cargoWeightKg: input.cargoWeightKg,
        cargoVolumeM3: input.cargoVolumeM3,
        requirements: input.requirements,
        preferences: input.preferences,
        payment: input.payment,
        fareQuoteId: input.fareQuoteId,
        paymentAuthorizationId: input.paymentAuthorizationId,
        sharingAllowed: input.sharingAllowed ?? false,
        tripType: input.tripType ?? 'ONE_WAY',
        policyId: policy.id,
        policyVersion: `${policy.policyKey}:${policy.version}`,
        searchStartedAt: status === UniversalRequestStatus.SEARCHING ? new Date() : undefined,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        metadata: input.metadata,
      });
      request = await requestRepository.save(request);

      await this.auditService.record(
        {
          actorUserId: requesterUserId,
          action: 'SERVICE_REQUEST_CREATED',
          entityType: 'UniversalServiceRequest',
          entityId: request.id,
          after: { ...request },
          metadata: { clientRequestId: input.clientRequestId, serviceType: input.serviceType },
        },
        manager,
      );

      if (input.stops?.length) {
        await stopRepository.save(
          input.stops.map((stop) =>
            stopRepository.create({
              requestId: request.id,
              sequence: stop.sequence,
              type: stop.type,
              latitude: stop.location.latitude,
              longitude: stop.location.longitude,
              address: stop.location.address,
              earliestAt: stop.earliestAt ? new Date(stop.earliestAt) : undefined,
              latestAt: stop.latestAt ? new Date(stop.latestAt) : undefined,
              serviceDurationSeconds: stop.serviceDurationSeconds ?? 0,
              requirements: stop.requirements,
            }),
          ),
        );
      }

      if (input.requirementItems?.length) {
        await requirementRepository.save(
          input.requirementItems.map((requirement) =>
            requirementRepository.create({
              requestId: request.id,
              code: requirement.code,
              category: requirement.category,
              mandatory: requirement.mandatory ?? true,
              value: requirement.value,
            }),
          ),
        );
      }

      await this.outbox.enqueue(
        {
          aggregateType: 'service_request',
          aggregateId: request.id,
          eventType: 'dispatch.request_created',
          eventVersion: 1,
          payload: { requestId: request.id, serviceType: request.serviceType, status: request.status },
          availableAt: new Date(),
        },
        manager,
      );

      if (idempotencyKey) {
        await idempotencyRepository.save(
          idempotencyRepository.create({
            scope: 'service_request',
            keyHash: idempotencyKey,
            requestHash: input.clientRequestId,
            resourceId: request.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          }),
        );
      }

      return request;
    });
  }

  async getById(requestId: string): Promise<UniversalServiceRequest> {
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Service request not found');
    return request;
  }

  async cancel(
    requestId: string,
    input: CancelUniversalRequestDto,
    actorUserId?: string,
  ): Promise<UniversalServiceRequest> {
    return this.dataSource.transaction(async (manager) => {
      const requestRepository = manager.getRepository(UniversalServiceRequest);
      const cancellationRepository = manager.getRepository(UniversalDispatchCancellation);
      const request = await requestRepository.findOne({ where: { id: requestId } });
      if (!request) throw new NotFoundException('Service request not found');
      if (TERMINAL_REQUEST_STATUSES.has(request.status)) {
        throw new BadRequestException({ code: 'REQUEST_ALREADY_TERMINAL' });
      }
      const before = { ...request };
      request.cancellationCode = input.reasonCode;
      request.completedAt = new Date();
      const saved = await this.stateMachine.transitionRequest(
        manager,
        request,
        UniversalRequestStatus.CANCELLED,
        {
          actorType: input.actorParty ?? DispatchCancellationParty.RIDER,
          actorId: actorUserId,
          reasonCode: input.reasonCode,
        },
      );

      await cancellationRepository.save(
        cancellationRepository.create({
          requestId: saved.id,
          actorUserId,
          actorParty: input.actorParty ?? DispatchCancellationParty.RIDER,
          code: input.reasonCode,
          reason: input.note,
          latitude: input.location?.latitude,
          longitude: input.location?.longitude,
        }),
      );

      await this.outbox.enqueue(
        {
          aggregateType: 'service_request',
          aggregateId: saved.id,
          eventType: 'dispatch.request_cancelled',
          eventVersion: 1,
          payload: { requestId: saved.id, reasonCode: input.reasonCode },
          availableAt: new Date(),
        },
        manager,
      );

      await this.realtime.publishRequestUpdate(saved.id, 'request.cancelled', {
        requestId: saved.id,
        status: saved.status,
      });

      await this.auditService.record(
        {
          actorUserId: actorUserId,
          action: 'SERVICE_REQUEST_CANCELLED',
          entityType: 'UniversalServiceRequest',
          entityId: saved.id,
          before,
          after: { ...saved },
          reason: input.reasonCode,
          metadata: { actorParty: input.actorParty },
        },
        manager,
      );

      return saved;
    });
  }

  async reschedule(
    requestId: string,
    input: RescheduleUniversalRequestDto,
  ): Promise<UniversalServiceRequest> {
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Service request not found');
    if (request.status !== UniversalRequestStatus.SCHEDULED) {
      throw new BadRequestException({ code: 'REQUEST_NOT_SCHEDULED' });
    }
    const before = { ...request };
    request.scheduledAt = new Date(input.scheduledAt);
    request.recurrenceRule = input.recurrenceRule ?? request.recurrenceRule;
    const saved = await this.requests.save(request);
    void this.auditService
      .record({
        actorUserId: undefined,
        action: 'SERVICE_REQUEST_RESCHEDULED',
        entityType: 'UniversalServiceRequest',
        entityId: saved.id,
        before,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }
}
