import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  UniversalDispatchAssignment,
  UniversalDispatchUnit,
  UniversalServiceRequest,
  UniversalTripSession,
  UniversalTripStop,
} from '../domain/universal-dispatch.entities';
import {
  DispatchUnitStatus,
  UniversalAssignmentStatus,
  UniversalRequestStatus,
  UniversalStopStatus,
  UniversalTripStatus,
  UniversalTripStopType,
} from '../domain/universal-dispatch.enums';
import { UniversalDispatchStateMachineService } from './universal-dispatch-state-machine.service';
import {
  ArrivalDto,
  TransitionUniversalTripDto,
  VerifyUniversalTripCodeDto,
} from '../universal-dispatch.dto';

@Injectable()
export class UniversalTripService {
  constructor(
    @InjectRepository(UniversalTripSession)
    private readonly trips: Repository<UniversalTripSession>,
    @InjectRepository(UniversalTripStop)
    private readonly stops: Repository<UniversalTripStop>,
    @InjectRepository(UniversalDispatchAssignment)
    private readonly assignments: Repository<UniversalDispatchAssignment>,
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    @InjectRepository(UniversalDispatchUnit)
    private readonly units: Repository<UniversalDispatchUnit>,
    private readonly dataSource: DataSource,
    private readonly stateMachine: UniversalDispatchStateMachineService,
  ) {}

  async transition(
    driverId: string,
    tripId: string,
    input: TransitionUniversalTripDto,
  ): Promise<UniversalTripSession> {
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip session not found');
    const unit = await this.units.findOne({ where: { id: trip.dispatchUnitId } });
    if (!unit || unit.driverId !== driverId) {
      throw new BadRequestException({ code: 'TRIP_NOT_FOR_DRIVER' });
    }
    if (trip.routeVersion !== input.expectedVersion) {
      throw new BadRequestException({ code: 'VERSION_CONFLICT' });
    }

    await this.stateMachine.transitionTrip(this.dataSource.manager, trip, input.targetStatus, {
      actorType: 'DRIVER',
      actorId: driverId,
    });
    trip.routeVersion += 1;
    const saved = await this.trips.save(trip);

    const request = await this.requests.findOne({ where: { id: trip.primaryRequestId } });
    if (request) {
      if (input.targetStatus === UniversalTripStatus.DRIVER_EN_ROUTE_PICKUP) {
        await this.stateMachine.transitionRequest(
          this.dataSource.manager,
          request,
          UniversalRequestStatus.DRIVER_EN_ROUTE,
          { actorType: 'DRIVER', actorId: driverId },
        );
      } else if (input.targetStatus === UniversalTripStatus.DRIVER_ARRIVED) {
        await this.stateMachine.transitionRequest(
          this.dataSource.manager,
          request,
          UniversalRequestStatus.ARRIVED,
          { actorType: 'DRIVER', actorId: driverId },
        );
      } else if (input.targetStatus === UniversalTripStatus.TRIP_STARTED) {
        await this.stateMachine.transitionRequest(
          this.dataSource.manager,
          request,
          UniversalRequestStatus.ACTIVE,
          { actorType: 'DRIVER', actorId: driverId },
        );
      } else if (input.targetStatus === UniversalTripStatus.COMPLETED) {
        request.completedAt = new Date();
        await this.stateMachine.transitionRequest(
          this.dataSource.manager,
          request,
          UniversalRequestStatus.COMPLETED,
          { actorType: 'DRIVER', actorId: driverId },
        );
        const assignment = await this.assignments.findOne({ where: { requestId: request.id } });
        if (assignment) {
          assignment.endedAt = new Date();
          await this.stateMachine.transitionAssignment(
            this.dataSource.manager,
            assignment,
            UniversalAssignmentStatus.COMPLETED,
            { actorType: 'DRIVER', actorId: driverId },
          );
        }
        unit.activeRequestId = undefined;
        unit.activeOfferId = undefined;
        await this.stateMachine.transitionUnit(this.dataSource.manager, unit, DispatchUnitStatus.AVAILABLE, {
          actorType: 'DRIVER',
          actorId: driverId,
        });
      }
    }

    return saved;
  }

  async arrivePickup(driverId: string, tripId: string, input: ArrivalDto): Promise<UniversalTripSession> {
    return this.transition(driverId, tripId, {
      targetStatus: UniversalTripStatus.DRIVER_ARRIVED,
      expectedVersion: input.expectedVersion,
      location: input.location,
    });
  }

  async verifyRider(
    driverId: string,
    tripId: string,
    input: VerifyUniversalTripCodeDto,
  ): Promise<UniversalTripSession> {
    if (!input.code || input.code.length < 4) {
      throw new BadRequestException({ code: 'INVALID_RIDER_CODE' });
    }
    return this.transition(driverId, tripId, {
      targetStatus: UniversalTripStatus.RIDER_VERIFIED,
      expectedVersion: 1,
    });
  }

  async verifyQr(
    driverId: string,
    tripId: string,
    input: VerifyUniversalTripCodeDto,
  ): Promise<UniversalTripSession> {
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip session not found');
    const unit = await this.units.findOne({ where: { id: trip.dispatchUnitId } });
    if (!unit || unit.driverId !== driverId) {
      throw new BadRequestException({ code: 'TRIP_NOT_FOR_DRIVER' });
    }

    const stop = await this.stops.findOne({
      where: { tripSessionId: tripId, sequence: input.stopSequence ?? 1 },
    });
    if (!stop) throw new NotFoundException('Trip stop not found');

    stop.status = UniversalStopStatus.COMPLETED;
    stop.completedAt = new Date();
    await this.stops.save(stop);

    if (stop.type === UniversalTripStopType.DELIVERY_PICKUP) {
      trip.status = UniversalTripStatus.PACKAGE_PICKED_UP;
    } else if (stop.type === UniversalTripStopType.DELIVERY_DROPOFF) {
      trip.status = UniversalTripStatus.PACKAGE_DELIVERED;
    }
    return this.trips.save(trip);
  }
}
