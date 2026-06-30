import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  UniversalDispatchAssignment,
  UniversalDispatchOffer,
  UniversalDispatchUnit,
  UniversalServiceRequest,
  UniversalTripSession,
} from '../domain/universal-dispatch.entities';
import {
  DispatchUnitStatus,
  UniversalAssignmentStatus,
  UniversalOfferStatus,
  UniversalRequestStatus,
  UniversalTripStatus,
} from '../domain/universal-dispatch.enums';
import {
  assertDispatchUnitTransition,
  assertOfferTransition,
  assertRequestTransition,
} from '../domain/universal-dispatch.utils';
import { UniversalOutboxService } from '../infrastructure/universal-outbox.service';
import { DispatchRealtimeService } from '../infrastructure/dispatch-realtime.service';
import { AcceptUniversalOfferDto, DeclineUniversalOfferDto } from '../universal-dispatch.dto';

@Injectable()
export class UniversalOfferService {
  constructor(
    @InjectRepository(UniversalDispatchOffer)
    private readonly offers: Repository<UniversalDispatchOffer>,
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    @InjectRepository(UniversalDispatchUnit)
    private readonly units: Repository<UniversalDispatchUnit>,
    @InjectRepository(UniversalDispatchAssignment)
    private readonly assignments: Repository<UniversalDispatchAssignment>,
    @InjectRepository(UniversalTripSession)
    private readonly trips: Repository<UniversalTripSession>,
    private readonly dataSource: DataSource,
    private readonly outbox: UniversalOutboxService,
    private readonly realtime: DispatchRealtimeService,
  ) {}

  async accept(
    driverId: string,
    offerId: string,
    input: AcceptUniversalOfferDto,
    _idempotencyKey?: string,
  ): Promise<UniversalDispatchAssignment> {
    return this.dataSource.transaction(async (manager) => {
      const offerRepository = manager.getRepository(UniversalDispatchOffer);
      const requestRepository = manager.getRepository(UniversalServiceRequest);
      const unitRepository = manager.getRepository(UniversalDispatchUnit);
      const assignmentRepository = manager.getRepository(UniversalDispatchAssignment);
      const tripRepository = manager.getRepository(UniversalTripSession);

      const offer = await offerRepository.findOne({ where: { id: offerId } });
      if (!offer) throw new NotFoundException('Offer not found');
      const unit = await unitRepository.findOne({ where: { id: offer.dispatchUnitId } });
      if (!unit || unit.driverId !== driverId) {
        throw new ConflictException({ code: 'OFFER_NOT_FOR_DRIVER' });
      }

      const request = await requestRepository.findOne({
        where: { id: offer.requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Request not found');

      if (request.status === UniversalRequestStatus.ASSIGNED) {
        const existing = await assignmentRepository.findOne({
          where: { requestId: request.id },
        });
        if (existing && existing.dispatchUnitId === unit.id) return existing;
        throw new ConflictException({
          code: 'OFFER_ALREADY_TAKEN',
          message: 'This request has already been assigned.',
          requestId: request.id,
        });
      }

      if (![UniversalRequestStatus.SEARCHING, UniversalRequestStatus.OFFERING].includes(request.status)) {
        throw new ConflictException({ code: 'OFFER_INVALID_STATE' });
      }
      if (offer.status !== UniversalOfferStatus.PENDING) {
        throw new ConflictException({ code: 'OFFER_NOT_PENDING' });
      }
      if (input.expectedOfferVersion && offer.version !== input.expectedOfferVersion) {
        throw new ConflictException({ code: 'OFFER_VERSION_CONFLICT' });
      }
      if (input.expectedDispatchUnitVersion && unit.version !== input.expectedDispatchUnitVersion) {
        throw new ConflictException({ code: 'DISPATCH_UNIT_VERSION_CONFLICT' });
      }
      if (offer.expiresAt < new Date()) {
        assertOfferTransition(offer.status, UniversalOfferStatus.EXPIRED);
        offer.status = UniversalOfferStatus.EXPIRED;
        await offerRepository.save(offer);
        throw new ConflictException({ code: 'OFFER_EXPIRED' });
      }

      if (unit.activeRequestId) {
        throw new ConflictException({ code: 'ACTIVE_ASSIGNMENT_CONFLICT' });
      }

      assertRequestTransition(request.status, UniversalRequestStatus.ASSIGNED);
      assertOfferTransition(offer.status, UniversalOfferStatus.ACCEPTED);

      request.status = UniversalRequestStatus.ASSIGNED;
      request.assignedDispatchUnitId = unit.id;
      request.assignedAt = new Date();
      request.version += 1;
      await requestRepository.save(request);

      assertDispatchUnitTransition(unit.status, DispatchUnitStatus.RESERVED);
      unit.status = DispatchUnitStatus.RESERVED;
      unit.activeRequestId = request.id;
      unit.activeOfferId = offer.id;
      await unitRepository.save(unit);

      const assignment = await assignmentRepository.save(
        assignmentRepository.create({
          requestId: request.id,
          dispatchUnitId: unit.id,
          offerId: offer.id,
          status: UniversalAssignmentStatus.ACTIVE,
          policyVersion: offer.policyVersion,
        }),
      );

      offer.status = UniversalOfferStatus.ACCEPTED;
      offer.respondedAt = new Date();
      await offerRepository.save(offer);

      await offerRepository.update(
        { requestId: request.id, status: UniversalOfferStatus.PENDING },
        { status: UniversalOfferStatus.CANCELLED, respondedAt: new Date() },
      );

      await tripRepository.save(
        tripRepository.create({
          dispatchUnitId: unit.id,
          primaryRequestId: request.id,
          serviceType: request.serviceType,
          status: UniversalTripStatus.ASSIGNED,
        }),
      );

      await this.outbox.enqueue(
        {
          aggregateType: 'service_request',
          aggregateId: request.id,
          eventType: 'dispatch.request_assigned',
          eventVersion: 1,
          payload: {
            requestId: request.id,
            dispatchUnitId: unit.id,
            offerId: offer.id,
            assignmentId: assignment.id,
          },
          availableAt: new Date(),
        },
        manager,
      );

      await this.realtime.publishRequestUpdate(request.id, 'request.assigned', {
        requestId: request.id,
        dispatchUnitId: unit.id,
        assignmentId: assignment.id,
      });
      await this.realtime.publishDriverUpdate(driverId, 'offer.accepted', {
        offerId: offer.id,
        requestId: request.id,
      });

      return assignment;
    });
  }

  async decline(
    driverId: string,
    offerId: string,
    input: DeclineUniversalOfferDto,
  ): Promise<UniversalDispatchOffer> {
    const offer = await this.offers.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    const unit = await this.units.findOne({ where: { id: offer.dispatchUnitId } });
    if (!unit || unit.driverId !== driverId) {
      throw new ConflictException({ code: 'OFFER_NOT_FOR_DRIVER' });
    }
    if (offer.status !== UniversalOfferStatus.PENDING) {
      throw new ConflictException({ code: 'OFFER_NOT_PENDING' });
    }
    assertOfferTransition(offer.status, UniversalOfferStatus.DECLINED);
    offer.status = UniversalOfferStatus.DECLINED;
    offer.respondedAt = new Date();
    offer.responseReason = input.reasonCode;
    const saved = await this.offers.save(offer);

    const request = await this.requests.findOne({ where: { id: offer.requestId } });
    if (request && request.status === UniversalRequestStatus.OFFERING) {
      assertRequestTransition(request.status, UniversalRequestStatus.SEARCHING);
      request.status = UniversalRequestStatus.SEARCHING;
      request.nextMatchAt = new Date();
      await this.requests.save(request);
    }

    return saved;
  }
}
