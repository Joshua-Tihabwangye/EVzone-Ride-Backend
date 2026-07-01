import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BookingStatus,
  DriverAvailabilityStatus,
  EmergencyPriority,
  PaymentMethod,
  ServiceType,
  UserRole,
  VehicleStatus,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { estimatedMinutes, haversineKm } from '../common/utils/geo';
import {
  AmbulanceEvent,
  AmbulanceRequest,
  DriverProfile,
  MedicalFacility,
  User,
  Vehicle,
} from '../database/entities';
import { DriversService } from '../drivers/drivers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../pricing/pricing.service';
import {
  AmbulanceActionDto,
  AmbulanceEstimateDto,
  CreateAmbulanceRequestDto,
  DispatchAmbulanceDto,
} from './ambulance.dto';

@Injectable()
export class AmbulanceService {
  constructor(
    @InjectRepository(AmbulanceRequest) private readonly requests: Repository<AmbulanceRequest>,
    @InjectRepository(AmbulanceEvent) private readonly eventsRepository: Repository<AmbulanceEvent>,
    @InjectRepository(MedicalFacility) private readonly facilities: Repository<MedicalFacility>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly drivers: DriversService,
    private readonly pricing: PricingService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly events: EventEmitter2,
  ) {}

  listFacilities() {
    return this.facilities.find({ where: { active: true }, order: { name: 'ASC' } });
  }

  async nearestFacilities(latitude: number, longitude: number, limit = 10) {
    const items = await this.listFacilities();
    return items
      .map((facility) => ({ facility, distanceKm: haversineKm({ latitude, longitude }, facility) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  async estimate(userId: string | undefined, dto: AmbulanceEstimateDto) {
    const destination = dto.destination ?? dto.pickup;
    const distanceKm = Math.max(1, haversineKm(dto.pickup, destination));
    const durationMinutes = estimatedMinutes(distanceKm, 45);
    return this.pricing.quote(
      {
        serviceType: ServiceType.AMBULANCE,
        distanceKm,
        durationMinutes,
        extras: {
          critical: dto.priority === EmergencyPriority.CRITICAL ? 1 : 0,
          oxygen: dto.medicalNeeds?.oxygenTank ? 1 : 0,
          stretcher: dto.medicalNeeds?.stretcher ? 1 : 0,
        },
      },
      userId,
    );
  }

  async create(requesterId: string, dto: CreateAmbulanceRequestDto, organizationId?: string) {
    if (!dto.consentToShareMedicalInfo) {
      throw new BadRequestException('Consent to share the minimum required medical information is required');
    }
    if (dto.scheduledAt && new Date(dto.scheduledAt) <= new Date()) {
      throw new BadRequestException('Scheduled ambulance time must be in the future');
    }
    let destination = dto.destination;
    if (!destination && dto.medicalFacilityId) {
      const facility = await this.facilities.findOne({ where: { id: dto.medicalFacilityId, active: true } });
      if (!facility) throw new NotFoundException('Medical facility not found');
      destination = { address: facility.address, latitude: facility.latitude, longitude: facility.longitude };
    }
    const quote = await this.estimate(requesterId, { ...dto, destination });
    const request = await this.requests.save(
      this.requests.create({
        requesterId,
        organizationId,
        status: BookingStatus.SEARCHING,
        priority: dto.priority,
        patientName: dto.patientName,
        patientPhone: dto.patientPhone,
        patientAge: dto.patientAge,
        medicalCondition: dto.medicalCondition,
        medicalNeeds: dto.medicalNeeds,
        pickupAddress: dto.pickup.address,
        pickupLatitude: dto.pickup.latitude,
        pickupLongitude: dto.pickup.longitude,
        destinationAddress: destination?.address,
        destinationLatitude: destination?.latitude,
        destinationLongitude: destination?.longitude,
        medicalFacilityId: dto.medicalFacilityId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        estimatedDistanceKm: quote.distanceKm,
        estimatedDurationMinutes: quote.durationMinutes,
        estimatedCost: quote.total,
        paymentMethod: dto.paymentMethod,
        consentToShareMedicalInfo: true,
      }),
    );
    await this.log(request.id, 'AMBULANCE_REQUESTED', requesterId, { priority: dto.priority });
    await this.notifyNearby(request);
    this.emit(request);
    return request;
  }

  async list(user: AuthUser, page = 1, limit = 20) {
    const driver =
      user.role === UserRole.DRIVER
        ? await this.driverProfiles.findOne({ where: { userId: user.id } })
        : null;
    const query = this.requests.createQueryBuilder('request');
    if (driver) query.where('request.driverId = :driverId', { driverId: driver.id });
    else if ([UserRole.DISPATCHER, UserRole.ADMIN, UserRole.MEDICAL_PARTNER].includes(user.role))
      query.where('1=1');
    else query.where('request.requesterId = :userId', { userId: user.id });
    query.orderBy(
      "CASE request.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 ELSE 4 END",
      'ASC',
    );
    query
      .addOrderBy('request.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await query.getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async detail(user: AuthUser, id: string) {
    const request = await this.get(id);
    await this.assertAccess(user, request);
    const [events, driver, vehicle, facility] = await Promise.all([
      this.eventsRepository.find({ where: { requestId: id }, order: { createdAt: 'ASC' } }),
      request.driverId ? this.driverProfiles.findOne({ where: { id: request.driverId } }) : null,
      request.vehicleId ? this.vehicles.findOne({ where: { id: request.vehicleId } }) : null,
      request.medicalFacilityId
        ? this.facilities.findOne({ where: { id: request.medicalFacilityId } })
        : null,
    ]);
    const driverUser = driver ? await this.users.findOne({ where: { id: driver.userId } }) : null;
    return {
      request,
      events,
      driver: driver ? { profile: driver, user: driverUser } : null,
      vehicle,
      facility,
    };
  }

  async driverRequests(userId: string) {
    const driver = await this.drivers.getByUserId(userId);
    const requests = await this.requests.find({
      where: { status: BookingStatus.SEARCHING },
      order: { createdAt: 'ASC' },
      take: 50,
    });
    return requests
      .map((request) => ({
        request,
        distanceToPickupKm:
          driver.lastLatitude != null && driver.lastLongitude != null
            ? haversineKm(
                { latitude: Number(driver.lastLatitude), longitude: Number(driver.lastLongitude) },
                { latitude: request.pickupLatitude, longitude: request.pickupLongitude },
              )
            : null,
      }))
      .sort(
        (a, b) =>
          this.priorityWeight(a.request.priority) - this.priorityWeight(b.request.priority) ||
          (a.distanceToPickupKm ?? 9999) - (b.distanceToPickupKm ?? 9999),
      );
  }

  async driverAccept(userId: string, id: string) {
    const driver = await this.drivers.getByUserId(userId);
    const request = await this.get(id);
    if (request.status !== BookingStatus.SEARCHING)
      throw new BadRequestException('Ambulance request is no longer available');
    if (!driver.currentVehicleId) throw new BadRequestException('Select an ambulance vehicle');
    const vehicle = await this.vehicles.findOne({
      where: { id: driver.currentVehicleId, status: VehicleStatus.ACTIVE },
    });
    if (!vehicle?.serviceCapabilities?.includes(ServiceType.AMBULANCE))
      throw new BadRequestException('Active vehicle is not a verified ambulance');
    request.driverId = driver.id;
    request.vehicleId = vehicle.id;
    request.status = BookingStatus.DRIVER_EN_ROUTE;
    await this.requests.save(request);
    driver.availabilityStatus = DriverAvailabilityStatus.BUSY;
    await this.driverProfiles.save(driver);
    await this.log(request.id, 'AMBULANCE_ACCEPTED', userId, { driverId: driver.id, vehicleId: vehicle.id });
    await this.notifications.create({
      userId: request.requesterId,
      title: 'Ambulance dispatched',
      body: 'A verified ambulance is on the way.',
      data: { requestId: request.id },
    });
    this.emit(request);
    return request;
  }

  async dispatch(dispatcherId: string, id: string, dto: DispatchAmbulanceDto) {
    const request = await this.get(id);
    if (![BookingStatus.SEARCHING, BookingStatus.REQUESTED].includes(request.status))
      throw new BadRequestException('Request cannot be dispatched now');
    let driver: DriverProfile | null = dto.driverId
      ? await this.driverProfiles.findOne({ where: { id: dto.driverId } })
      : null;
    if (!driver) {
      const nearby = await this.drivers.nearby(
        ServiceType.AMBULANCE,
        request.pickupLatitude,
        request.pickupLongitude,
        100,
      );
      driver = nearby[0]?.driver ?? null;
    }
    if (!driver) throw new NotFoundException('No available ambulance driver found');
    const vehicleId = dto.vehicleId ?? driver.currentVehicleId;
    const vehicle = vehicleId
      ? await this.vehicles.findOne({ where: { id: vehicleId, status: VehicleStatus.ACTIVE } })
      : null;
    if (!vehicle?.serviceCapabilities?.includes(ServiceType.AMBULANCE))
      throw new BadRequestException('Verified ambulance vehicle required');
    request.dispatcherId = dispatcherId;
    request.driverId = driver.id;
    request.vehicleId = vehicle.id;
    request.status = BookingStatus.DRIVER_EN_ROUTE;
    await this.requests.save(request);
    driver.availabilityStatus = DriverAvailabilityStatus.BUSY;
    await this.driverProfiles.save(driver);
    await this.log(request.id, 'DISPATCHER_ASSIGNED', dispatcherId, {
      driverId: driver.id,
      vehicleId: vehicle.id,
    });
    await this.notifications.create({
      userId: driver.userId,
      title: 'Urgent ambulance dispatch',
      body: `Priority: ${request.priority}. Proceed to pickup immediately.`,
      data: { requestId: request.id },
    });
    await this.notifications.create({
      userId: request.requesterId,
      title: 'Ambulance dispatched',
      body: 'A verified ambulance has been assigned.',
      data: { requestId: request.id },
    });
    this.emit(request);
    return request;
  }

  async driverTransition(
    userId: string,
    id: string,
    action: 'arrive' | 'start' | 'complete',
    dto?: AmbulanceActionDto,
  ) {
    const driver = await this.drivers.getByUserId(userId);
    const request = await this.get(id);
    if (request.driverId !== driver.id)
      throw new ForbiddenException('Request is not assigned to this driver');
    const expected =
      action === 'arrive'
        ? BookingStatus.DRIVER_EN_ROUTE
        : action === 'start'
          ? BookingStatus.ARRIVED
          : BookingStatus.IN_PROGRESS;
    if (request.status !== expected)
      throw new BadRequestException(`Cannot ${action} ambulance request in ${request.status}`);
    request.status =
      action === 'arrive'
        ? BookingStatus.ARRIVED
        : action === 'start'
          ? BookingStatus.IN_PROGRESS
          : BookingStatus.COMPLETED;
    if (action === 'complete') {
      request.finalCost = dto?.finalCost ?? request.estimatedCost;
      driver.availabilityStatus = DriverAvailabilityStatus.ONLINE;
      await this.driverProfiles.save(driver);
    }
    await this.requests.save(request);
    await this.log(request.id, `AMBULANCE_${action.toUpperCase()}`, userId, dto as any);
    this.emit(request);
    if (action === 'complete' && request.paymentMethod === PaymentMethod.EVZONE_WALLET) {
      try {
        const payment = await this.payments.createIntent(request.requesterId, {
          serviceType: ServiceType.AMBULANCE,
          serviceId: request.id,
          method: request.paymentMethod,
          idempotencyKey: `ambulance-complete-${request.id}`,
        });
        await this.payments.confirm(request.requesterId, payment.id);
      } catch {
        // Payment remains pending and can be retried through the payments API.
      }
    }
    return request;
  }

  async cancel(user: AuthUser, id: string, dto: AmbulanceActionDto) {
    const request = await this.get(id);
    await this.assertAccess(user, request);
    if (
      [BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, BookingStatus.CANCELLED].includes(request.status)
    )
      throw new BadRequestException('Request cannot be cancelled now');
    request.status = BookingStatus.CANCELLED;
    request.cancellationReason = dto.reason ?? 'Cancelled';
    await this.requests.save(request);
    if (request.driverId)
      await this.driverProfiles.update(request.driverId, {
        availabilityStatus: DriverAvailabilityStatus.ONLINE,
      });
    await this.log(request.id, 'AMBULANCE_CANCELLED', user.id, { reason: request.cancellationReason });
    this.emit(request);
    return request;
  }

  private async notifyNearby(request: AmbulanceRequest) {
    const nearby = await this.drivers.nearby(
      ServiceType.AMBULANCE,
      request.pickupLatitude,
      request.pickupLongitude,
      100,
    );
    for (const item of nearby.slice(0, 5)) {
      await this.notifications.create({
        userId: item.driver.userId,
        title: `${request.priority} ambulance request`,
        body: `Emergency pickup is ${item.distanceKm.toFixed(1)} km away.`,
        data: { requestId: request.id },
      });
      this.events.emit('user.event', {
        userId: item.driver.userId,
        event: 'ambulance.requested',
        data: request,
      });
    }
  }

  private async get(id: string) {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Ambulance request not found');
    return request;
  }

  private async assertAccess(user: AuthUser, request: AmbulanceRequest) {
    if ([UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER, UserRole.MEDICAL_PARTNER].includes(user.role))
      return;
    if (request.requesterId === user.id) return;
    if (user.role === UserRole.DRIVER) {
      const driver = await this.driverProfiles.findOne({ where: { userId: user.id } });
      if (driver?.id === request.driverId) return;
    }
    throw new ForbiddenException('You do not have access to this ambulance request');
  }

  private async log(
    requestId: string,
    eventType: string,
    actorUserId?: string,
    data?: Record<string, unknown>,
  ) {
    await this.eventsRepository.save(
      this.eventsRepository.create({ requestId, eventType, actorUserId, data }),
    );
  }

  private emit(request: AmbulanceRequest) {
    this.events.emit('service.updated', {
      serviceType: ServiceType.AMBULANCE,
      serviceId: request.id,
      data: request,
    });
    this.events.emit('user.event', {
      userId: request.requesterId,
      event: 'ambulance.updated',
      data: request,
    });
  }

  private priorityWeight(priority: EmergencyPriority) {
    return { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 }[priority];
  }
}
