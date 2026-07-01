import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { DeliveryOrder, Ride, RideStop } from '../../database/entities';
import {
  ServiceType,
  DeliveryServiceType,
  BookingStatus,
  DeliveryStatus,
  StopType,
} from '../../common/enums';
import {
  UniversalDispatchAssignment,
  UniversalDispatchUnit,
  UniversalServiceRequest,
  UniversalTripSession,
} from '../domain/universal-dispatch.entities';
import {
  UniversalAssignmentStatus,
  UniversalServiceFamily,
  UniversalServiceType,
  UniversalTripStatus,
  UniversalRequestStatus,
} from '../domain/universal-dispatch.enums';
import { UniversalDispatchStateMachineService } from './universal-dispatch-state-machine.service';
import { UniversalRequestService } from './universal-request.service';
import { CreateUniversalServiceRequestDto } from '../universal-dispatch.dto';

interface DomainEventInput {
  topic: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  eventKey: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class LegacyDispatchAdapterService {
  private readonly logger = new Logger(LegacyDispatchAdapterService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly requestService: UniversalRequestService,
    private readonly stateMachine: UniversalDispatchStateMachineService,
    @InjectRepository(Ride)
    private readonly rides: Repository<Ride>,
    @InjectRepository(RideStop)
    private readonly rideStops: Repository<RideStop>,
    @InjectRepository(DeliveryOrder)
    private readonly deliveryOrders: Repository<DeliveryOrder>,
    @InjectRepository(UniversalServiceRequest)
    private readonly universalRequests: Repository<UniversalServiceRequest>,
    @InjectRepository(UniversalDispatchAssignment)
    private readonly assignments: Repository<UniversalDispatchAssignment>,
    @InjectRepository(UniversalTripSession)
    private readonly trips: Repository<UniversalTripSession>,
  ) {}

  private isAuthorityEnabled(): boolean {
    return this.config.get<string>('UNIVERSAL_DISPATCH_AUTHORITY_ENABLED') === 'true';
  }

  @OnEvent('domain.event')
  async onDomainEvent(event: DomainEventInput): Promise<void> {
    if (!this.isAuthorityEnabled()) return;

    try {
      if (event.topic === 'rides' && event.eventType === 'ride.status.changed') {
        await this.handleRideStatusChanged(event.payload);
      } else if (event.topic === 'deliveries' && event.eventType === 'delivery.status.changed') {
        await this.handleDeliveryStatusChanged(event.payload);
      }
    } catch (error) {
      this.logger.warn(
        `Legacy adapter failed to process ${event.topic}/${event.eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @OnEvent('matching.job.assigned')
  async onMatchingJobAssigned(
    payload: {
      serviceType?: ServiceType;
      serviceId?: string;
      driverId?: string;
    } = {},
  ): Promise<void> {
    if (!this.isAuthorityEnabled()) return;
    if (!payload.serviceId) return;
    if (payload.serviceType !== ServiceType.RIDE && payload.serviceType !== ServiceType.DELIVERY) {
      return;
    }

    try {
      await this.ensureAssigned(payload.serviceType, payload.serviceId, payload.driverId);
    } catch (error) {
      this.logger.warn(
        `Legacy adapter failed to sync assignment for ${payload.serviceType}:${payload.serviceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async handleRideStatusChanged(payload: Record<string, unknown>): Promise<void> {
    const rideId = payload.rideId as string | undefined;
    const status = payload.status as BookingStatus | undefined;
    if (!rideId) return;

    const activeLegacyStatuses = new Set<BookingStatus>([
      BookingStatus.SEARCHING,
      BookingStatus.OFFERED,
      BookingStatus.ACCEPTED,
      BookingStatus.DRIVER_EN_ROUTE,
    ]);
    if (!status || !activeLegacyStatuses.has(status)) return;

    const existing = await this.universalRequests.findOne({
      where: { sourceType: 'RIDE', sourceId: rideId },
    });
    if (existing) return;

    const ride = await this.rides.findOne({ where: { id: rideId } });
    if (!ride) return;

    const stops = await this.rideStops.find({ where: { rideId }, order: { sequence: 'ASC' } });
    const pickup = stops.find((stop) => stop.type === StopType.PICKUP);
    const dropoff = stops.find((stop) => stop.type === StopType.DROPOFF);
    if (!pickup || !dropoff) {
      this.logger.warn(`Ride ${rideId} missing pickup/dropoff stops; skipping universal request`);
      return;
    }

    const dto: CreateUniversalServiceRequestDto = {
      clientRequestId: this.legacyClientRequestId('RIDE', rideId),
      serviceFamily: UniversalServiceFamily.PASSENGER,
      serviceType: this.mapRideCategory(ride.category),
      scheduleType: 'IMMEDIATE' as never,
      pickup: {
        latitude: Number(pickup.latitude),
        longitude: Number(pickup.longitude),
        address: pickup.address,
      },
      dropoff: {
        latitude: Number(dropoff.latitude),
        longitude: Number(dropoff.longitude),
        address: dropoff.address,
      },
      passengerCount: ride.passengerCount,
      sourceType: 'RIDE',
      sourceId: rideId,
      metadata: { legacyStatus: status },
    };

    await this.requestService.create(ride.riderId, dto);
  }

  private async handleDeliveryStatusChanged(payload: Record<string, unknown>): Promise<void> {
    const orderId = payload.orderId as string | undefined;
    const status = payload.status as DeliveryStatus | undefined;
    if (!orderId) return;

    const activeLegacyStatuses = new Set<DeliveryStatus>([
      DeliveryStatus.ACCEPTED,
      DeliveryStatus.EN_ROUTE_PICKUP,
      DeliveryStatus.DRIVER_ASSIGNED,
    ]);
    if (!status || !activeLegacyStatuses.has(status)) return;

    const existing = await this.universalRequests.findOne({
      where: { sourceType: 'DELIVERY', sourceId: orderId },
    });
    if (existing) return;

    const order = await this.deliveryOrders.findOne({ where: { id: orderId } });
    if (!order) return;

    const dto: CreateUniversalServiceRequestDto = {
      clientRequestId: this.legacyClientRequestId('DELIVERY', orderId),
      serviceFamily: UniversalServiceFamily.DELIVERY,
      serviceType: this.mapDeliveryServiceType(order.serviceType),
      scheduleType: 'IMMEDIATE' as never,
      pickup: {
        latitude: Number(order.pickupLatitude),
        longitude: Number(order.pickupLongitude),
        address: order.pickupAddress,
      },
      dropoff: {
        latitude: Number(order.destinationLatitude),
        longitude: Number(order.destinationLongitude),
        address: order.destinationAddress,
      },
      cargoWeightKg: Number(order.weightKg),
      sourceType: 'DELIVERY',
      sourceId: orderId,
      metadata: { legacyStatus: status },
    };

    await this.requestService.create(order.customerId, dto);
  }

  private async ensureAssigned(
    serviceType: ServiceType,
    serviceId: string,
    driverId?: string,
  ): Promise<void> {
    const sourceType = serviceType === ServiceType.RIDE ? 'RIDE' : 'DELIVERY';
    const request = await this.universalRequests.findOne({
      where: { sourceType, sourceId: serviceId },
    });

    if (!request || request.status === UniversalRequestStatus.ASSIGNED) return;

    if (!driverId) {
      this.logger.warn(`No driverId in matching assignment for ${sourceType}:${serviceId}`);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const requestRepository = manager.getRepository(UniversalServiceRequest);
      // Refresh request inside transaction to avoid stale state.
      const freshRequest = await requestRepository.findOne({ where: { id: request.id } });
      if (!freshRequest || freshRequest.status === UniversalRequestStatus.ASSIGNED) return;

      await this.stateMachine.transitionRequest(manager, freshRequest, UniversalRequestStatus.ASSIGNED, {
        actorType: 'MATCHING_ENGINE',
        reasonCode: 'LEGACY_MATCHING_ASSIGNED',
      });

      // Find the dispatch unit for the assigned driver.
      const unitRepository = manager.getRepository(UniversalDispatchUnit);
      const unit = await unitRepository.findOne({ where: { driverId }, order: { createdAt: 'DESC' } });
      if (!unit) {
        this.logger.warn(`No dispatch unit for driver ${driverId}`);
        return;
      }

      freshRequest.assignedDispatchUnitId = unit.id;
      freshRequest.assignedAt = new Date();
      unit.lastAssignedAt = new Date();
      await requestRepository.save(freshRequest);
      await unitRepository.save(unit);

      const assignmentRepository = manager.getRepository(UniversalDispatchAssignment);
      await assignmentRepository.save(
        assignmentRepository.create({
          requestId: freshRequest.id,
          dispatchUnitId: (unit as { id: string }).id,
          status: UniversalAssignmentStatus.ACTIVE,
          assignedAt: new Date(),
          policyVersion: freshRequest.policyVersion ?? 'legacy',
        }),
      );

      const tripRepository = manager.getRepository(UniversalTripSession);
      await tripRepository.save(
        tripRepository.create({
          dispatchUnitId: (unit as { id: string }).id,
          primaryRequestId: freshRequest.id,
          serviceType: freshRequest.serviceType,
          status: UniversalTripStatus.ASSIGNED,
        }),
      );
    });
  }

  private legacyClientRequestId(sourceType: string, sourceId: string): string {
    return `legacy:${sourceType}:${sourceId}`;
  }

  private mapRideCategory(category: string): UniversalServiceType {
    const mapping: Record<string, UniversalServiceType> = {
      STANDARD: UniversalServiceType.STANDARD_RIDE,
      PREMIUM: UniversalServiceType.PREMIUM_RIDE,
      SENIOR_ASSISTANCE: UniversalServiceType.SENIOR_ASSISTANCE,
      MEDICAL_PWD_TRANSFER: UniversalServiceType.MEDICAL_PWD_RIDE,
      AIRPORT_TRANSFER: UniversalServiceType.AIRPORT_TRANSFER,
      EVENT: UniversalServiceType.TOURISM_EVENT,
      SCHOOL: UniversalServiceType.SCHOOL_RIDE,
      BUSINESS: UniversalServiceType.BUSINESS_RIDE,
    };
    return mapping[category] ?? UniversalServiceType.STANDARD_RIDE;
  }

  private mapDeliveryServiceType(serviceType: DeliveryServiceType): UniversalServiceType {
    switch (serviceType) {
      case DeliveryServiceType.BIKE:
        return UniversalServiceType.PARCEL_BIKE;
      case DeliveryServiceType.ELECTRIC_VEHICLE:
        return UniversalServiceType.PARCEL_SCOOTER;
      case DeliveryServiceType.TRUCK:
        return UniversalServiceType.CARGO_TRUCK;
      case DeliveryServiceType.COURIER:
        return UniversalServiceType.COURIER;
      case DeliveryServiceType.FOOD:
        return UniversalServiceType.FOOD_DELIVERY;
      default:
        return UniversalServiceType.COURIER;
    }
  }
}
