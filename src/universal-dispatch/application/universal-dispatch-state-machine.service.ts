import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  StateTransitionLog,
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
  dispatchAssignmentMachine,
  dispatchUnitMachine,
  universalOfferMachine,
  universalRequestMachine,
  universalTripMachine,
} from '../domain/universal-dispatch.state-machine';

export interface TransitionOptions {
  actorType?: string;
  actorId?: string;
  reasonCode?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class UniversalDispatchStateMachineService {
  async transitionRequest(
    manager: EntityManager,
    request: UniversalServiceRequest,
    target: UniversalRequestStatus,
    options: TransitionOptions = {},
  ): Promise<UniversalServiceRequest> {
    return this.applyTransition(
      manager,
      request,
      target,
      'service_request',
      universalRequestMachine,
      (entity, status) => {
        entity.previousStatus = entity.status;
        entity.status = status;
      },
      options,
    );
  }

  async transitionOffer(
    manager: EntityManager,
    offer: UniversalDispatchOffer,
    target: UniversalOfferStatus,
    options: TransitionOptions = {},
  ): Promise<UniversalDispatchOffer> {
    return this.applyTransition(
      manager,
      offer,
      target,
      'dispatch_offer',
      universalOfferMachine,
      (entity, status) => {
        entity.previousStatus = entity.status;
        entity.status = status;
      },
      options,
    );
  }

  async transitionUnit(
    manager: EntityManager,
    unit: UniversalDispatchUnit,
    target: DispatchUnitStatus,
    options: TransitionOptions = {},
  ): Promise<UniversalDispatchUnit> {
    return this.applyTransition(
      manager,
      unit,
      target,
      'dispatch_unit',
      dispatchUnitMachine,
      (entity, status) => {
        entity.previousStatus = entity.status;
        entity.status = status;
      },
      options,
    );
  }

  async transitionAssignment(
    manager: EntityManager,
    assignment: UniversalDispatchAssignment,
    target: UniversalAssignmentStatus,
    options: TransitionOptions = {},
  ): Promise<UniversalDispatchAssignment> {
    return this.applyTransition(
      manager,
      assignment,
      target,
      'dispatch_assignment',
      dispatchAssignmentMachine,
      (entity, status) => {
        entity.previousStatus = entity.status;
        entity.status = status;
      },
      options,
    );
  }

  async transitionTrip(
    manager: EntityManager,
    trip: UniversalTripSession,
    target: UniversalTripStatus,
    options: TransitionOptions = {},
  ): Promise<UniversalTripSession> {
    return this.applyTransition(
      manager,
      trip,
      target,
      'trip_session',
      universalTripMachine,
      (entity, status) => {
        entity.previousStatus = entity.status;
        entity.status = status;
      },
      options,
    );
  }

  private async applyTransition<E extends { id: string; status: S; previousStatus?: S }, S extends string>(
    manager: EntityManager,
    entity: E,
    target: S,
    entityType: string,
    machine: { assertTransition(from: S, to: S): void },
    mutator: (entity: E, status: S) => void,
    options: TransitionOptions,
  ): Promise<E> {
    if (entity.status === target) {
      return entity;
    }

    try {
      machine.assertTransition(entity.status, target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message,
        entityType,
        from: entity.status,
        to: target,
      });
    }

    const fromStatus = entity.status;
    mutator(entity, target);
    await manager.getRepository(Object.getPrototypeOf(entity).constructor).save(entity);

    const logRepository = manager.getRepository(StateTransitionLog);
    await logRepository.save(
      logRepository.create({
        entityType,
        entityId: entity.id,
        fromStatus,
        toStatus: target,
        actorType: options.actorType,
        actorId: options.actorId,
        reasonCode: options.reasonCode,
        metadata: options.metadata,
      }),
    );

    return entity;
  }
}
