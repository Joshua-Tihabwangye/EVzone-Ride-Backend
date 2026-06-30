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
import { UniversalDispatchStateMachineService } from './universal-dispatch-state-machine.service';
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
    private readonly stateMachine: UniversalDispatchStateMachineService,
  ) {}

  async accept(
    driverId: string,
    offerId: string,
    input: AcceptUniversalOfferDto,
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
        await this.stateMachine.transitionOffer(manager, offer, UniversalOfferStatus.EXPIRED, {
          reasonCode: 'OFFER_EXPIRED',
        });
        throw new ConflictException({ code: 'OFFER_EXPIRED' });
      }

      if (unit.activeRequestId) {
        throw new ConflictException({ code: 'ACTIVE_ASSIGNMENT_CONFLICT' });
      }

      request.assignedDispatchUnitId = unit.id;
      request.assignedAt = new Date();
      request.version += 1;
      await this.stateMachine.transitionRequest(manager, request, UniversalRequestStatus.ASSIGNED, {
        actorType: 'DRIVER',
        actorId: driverId,
      });

      unit.activeRequestId = request.id;
      unit.activeOfferId = offer.id;
      await this.stateMachine.transitionUnit(manager, unit, DispatchUnitStatus.RESERVED, {
        actorType: 'DRIVER',
        actorId: driverId,
      });

      const assignment = await assignmentRepository.save(
        assignmentRepository.create({
          requestId: request.id,
          dispatchUnitId: unit.id,
          offerId: offer.id,
          status: UniversalAssignmentStatus.ACTIVE,
          policyVersion: offer.policyVersion,
        }),
      );

      offer.respondedAt = new Date();
      await this.stateMachine.transitionOffer(manager, offer, UniversalOfferStatus.ACCEPTED, {
        actorType: 'DRIVER',
        actorId: driverId,
      });

      const otherOffers = await offerRepository.find({
        where: { requestId: request.id, status: UniversalOfferStatus.PENDING },
      });
      for (const otherOffer of otherOffers) {
        await this.stateMachine.transitionOffer(manager, otherOffer, UniversalOfferStatus.CANCELLED, {
          reasonCode: 'LOST_RACE',
        });
      }

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
    offer.respondedAt = new Date();
    offer.responseReason = input.reasonCode;
    const saved = await this.stateMachine.transitionOffer(
      this.dataSource.manager,
      offer,
      UniversalOfferStatus.DECLINED,
      { actorType: 'DRIVER', actorId: driverId, reasonCode: input.reasonCode },
    );

    const request = await this.requests.findOne({ where: { id: offer.requestId } });
    if (request && request.status === UniversalRequestStatus.OFFERING) {
      request.nextMatchAt = new Date();
      await this.stateMachine.transitionRequest(
        this.dataSource.manager,
        request,
        UniversalRequestStatus.SEARCHING,
        { reasonCode: input.reasonCode },
      );
    }

    return saved;
  }
}
