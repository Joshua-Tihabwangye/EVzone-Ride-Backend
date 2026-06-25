import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, MoreThan, Repository } from 'typeorm';
import {
  EmergencyStatus,
  ServiceType,
  SupportPriority,
  SupportTicketStatus,
  TripPauseStatus,
  UserRole,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AmbulanceRequest,
  DeliveryOrder,
  DriverProfile,
  EmergencyIncident,
  MapReport,
  RentalBooking,
  Ride,
  SafetyEventLog,
  SavedContact,
  SupportTicket,
  TouristBooking,
  TripPauseRequest,
  TripShare,
  User,
  Vehicle,
} from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateEmergencyDto,
  CreateMapReportDto,
  CreateSupportTicketDto,
  CreateTripShareDto,
  RequestTripPauseDto,
  RespondTripPauseDto,
  ResumeTripDto,
  SupportMessageDto,
  UpdateEmergencyDto,
  UpdateSupportTicketDto,
} from './safety.dto';

type ServiceRecord = Ride | DeliveryOrder | TouristBooking | AmbulanceRequest | RentalBooking;

type ServiceParties = {
  entity: ServiceRecord;
  ownerUserId: string;
  driverUserId?: string;
  driverProfileId?: string;
};

@Injectable()
export class SafetyService {
  constructor(
    @InjectRepository(EmergencyIncident) private readonly incidents: Repository<EmergencyIncident>,
    @InjectRepository(TripShare) private readonly shares: Repository<TripShare>,
    @InjectRepository(MapReport) private readonly reports: Repository<MapReport>,
    @InjectRepository(SupportTicket) private readonly tickets: Repository<SupportTicket>,
    @InjectRepository(SavedContact) private readonly contacts: Repository<SavedContact>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(DeliveryOrder) private readonly deliveries: Repository<DeliveryOrder>,
    @InjectRepository(TouristBooking) private readonly tourist: Repository<TouristBooking>,
    @InjectRepository(AmbulanceRequest) private readonly ambulances: Repository<AmbulanceRequest>,
    @InjectRepository(RentalBooking) private readonly rentals: Repository<RentalBooking>,
    @InjectRepository(TripPauseRequest) private readonly pauses: Repository<TripPauseRequest>,
    @InjectRepository(SafetyEventLog) private readonly safetyLogs: Repository<SafetyEventLog>,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  async createEmergency(user: AuthUser, dto: CreateEmergencyDto, sos = false) {
    if ((dto.serviceType && !dto.serviceId) || (!dto.serviceType && dto.serviceId)) {
      throw new BadRequestException('serviceType and serviceId must be supplied together');
    }
    if (dto.serviceType && dto.serviceId) {
      await this.assertServiceOwner(user.id, dto.serviceType, dto.serviceId, true);
    }
    const driver =
      user.role === UserRole.DRIVER ? await this.drivers.findOne({ where: { userId: user.id } }) : null;
    const incident = await this.incidents.save(
      this.incidents.create({
        reporterUserId: user.id,
        driverId: driver?.id,
        ...dto,
        status: EmergencyStatus.OPEN,
        sos,
      }),
    );
    const emergencyContacts = await this.contacts.find({
      where: { ownerUserId: user.id, isEmergencyContact: true },
    });
    const responders = await this.users.find({
      where: { role: In([UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER]) },
    });
    for (const responder of responders) {
      await this.notifications.create({
        userId: responder.id,
        title: sos ? 'SOS emergency alert' : 'Emergency assistance request',
        body: `${user.firstName} ${user.lastName} reported ${dto.type}.`,
        data: {
          incidentId: incident.id,
          latitude: dto.latitude,
          longitude: dto.longitude,
          serviceType: dto.serviceType,
          serviceId: dto.serviceId,
        },
      });
    }
    incident.notifiedContacts = [
      ...(dto.notifiedContacts ?? []),
      ...emergencyContacts.map((contact) => ({
        name: contact.name,
        phone: contact.phone,
        source: 'EMERGENCY_CONTACT',
      })),
    ];
    await this.incidents.save(incident);
    await this.logSafetyEvent(
      incident.id,
      sos ? 'SOS_CREATED' : 'INCIDENT_CREATED',
      user.id,
      {
        status: incident.status,
        type: incident.type,
        notifiedResponderCount: responders.length,
        emergencyContactCount: emergencyContacts.length,
      },
      'INCIDENT',
      dto.serviceType,
      dto.serviceId,
    );
    const payload = { incident, reporter: user, emergencyContacts };
    this.events.emit('safety.incident.new', payload);
    this.events.emit('user.event', { userId: user.id, event: 'safety.emergency.created', data: incident });
    this.events.emit('domain.event', {
      eventType: sos ? 'safety.sos.created' : 'safety.incident.created',
      aggregateType: 'EmergencyIncident',
      aggregateId: incident.id,
      payload: {
        incidentId: incident.id,
        reporterUserId: user.id,
        serviceType: dto.serviceType,
        serviceId: dto.serviceId,
        type: dto.type,
        status: incident.status,
        sos,
      },
    });
    return { incident, emergencyContacts, emergencyNumber: '112' };
  }

  async listIncidents(user: AuthUser, page = 1, limit = 20) {
    const where = [UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER].includes(user.role)
      ? {}
      : { reporterUserId: user.id };
    const [items, total] = await this.incidents.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async updateIncident(user: AuthUser, id: string, dto: UpdateEmergencyDto) {
    const incident = await this.getIncidentForUser(user, id);
    const previousStatus = incident.status;
    incident.status = dto.status;
    if ([EmergencyStatus.RESOLVED, EmergencyStatus.CANCELLED].includes(dto.status)) {
      incident.resolvedAt = new Date();
    } else {
      incident.resolvedAt = undefined;
    }
    const saved = await this.incidents.save(incident);
    await this.logSafetyEvent(
      id,
      'STATUS_CHANGED',
      user.id,
      {
        previousStatus,
        status: saved.status,
      },
      'INCIDENT',
      saved.serviceType,
      saved.serviceId,
    );
    this.events.emit('service.updated', {
      serviceType: saved.serviceType,
      serviceId: saved.serviceId,
      data: { event: 'safety.incident.status.changed', incident: saved },
    });
    this.events.emit('domain.event', {
      eventType: 'safety.incident.status.changed',
      aggregateType: 'EmergencyIncident',
      aggregateId: saved.id,
      payload: { incidentId: saved.id, previousStatus, status: saved.status, actorUserId: user.id },
    });
    return saved;
  }

  async incidentHistory(user: AuthUser, id: string) {
    await this.getIncidentForUser(user, id);
    return this.safetyLogs.find({ where: { incidentId: id }, order: { createdAt: 'ASC' } });
  }

  async requestTripPause(user: AuthUser, dto: RequestTripPauseDto) {
    const parties = await this.serviceParties(dto.serviceType, dto.serviceId);
    const actor = this.assertParticipant(user.id, parties);
    if (!parties.driverUserId) throw new BadRequestException('No driver is assigned to this service');
    const duplicate = await this.pauses.findOne({
      where: [
        { serviceType: dto.serviceType, serviceId: dto.serviceId, status: TripPauseStatus.REQUESTED },
        { serviceType: dto.serviceType, serviceId: dto.serviceId, status: TripPauseStatus.PAUSED },
      ],
      order: { createdAt: 'DESC' },
    });
    if (duplicate) throw new BadRequestException('An active pause request already exists for this service');
    const now = new Date();
    const pause = await this.pauses.save(
      this.pauses.create({
        serviceType: dto.serviceType,
        serviceId: dto.serviceId,
        requestedByUserId: user.id,
        status: TripPauseStatus.REQUESTED,
        reason: dto.reason,
        riderConfirmedAt: actor === 'OWNER' ? now : undefined,
        driverConfirmedAt: actor === 'DRIVER' ? now : undefined,
        expiresAt: new Date(now.getTime() + (dto.expiresInMinutes ?? 10) * 60_000),
        metadata: { requestedByRole: actor },
      }),
    );
    await this.logPauseEvent(pause, 'PAUSE_REQUESTED', user.id, { reason: dto.reason });
    await this.notifyPauseParty(parties, user.id, 'Trip pause requested', dto.reason, pause);
    this.emitPauseUpdate(pause, 'trip.pause.requested');
    return pause;
  }

  async respondTripPause(user: AuthUser, id: string, dto: RespondTripPauseDto) {
    const pause = await this.getPauseForUser(user.id, id);
    if (pause.status !== TripPauseStatus.REQUESTED) {
      throw new BadRequestException('This pause request is no longer awaiting a response');
    }
    if (pause.expiresAt && pause.expiresAt.getTime() <= Date.now()) {
      pause.status = TripPauseStatus.CANCELLED;
      await this.pauses.save(pause);
      await this.logPauseEvent(pause, 'PAUSE_EXPIRED', user.id);
      throw new BadRequestException('This pause request has expired');
    }
    const parties = await this.serviceParties(pause.serviceType, pause.serviceId);
    const actor = this.assertParticipant(user.id, parties);
    if (!dto.approve) {
      pause.status = TripPauseStatus.REJECTED;
      pause.metadata = { ...(pause.metadata ?? {}), rejectionNote: dto.note, rejectedBy: actor };
      const rejected = await this.pauses.save(pause);
      await this.logPauseEvent(rejected, 'PAUSE_REJECTED', user.id, { note: dto.note, actor });
      await this.notifyPauseParty(
        parties,
        user.id,
        'Trip pause declined',
        dto.note ?? pause.reason,
        rejected,
      );
      this.emitPauseUpdate(rejected, 'trip.pause.rejected');
      return rejected;
    }
    const now = new Date();
    if (actor === 'OWNER') pause.riderConfirmedAt = now;
    else pause.driverConfirmedAt = now;
    if (pause.riderConfirmedAt && pause.driverConfirmedAt) {
      pause.status = TripPauseStatus.PAUSED;
      pause.pausedAt = now;
    }
    pause.metadata = { ...(pause.metadata ?? {}), approvalNote: dto.note };
    const saved = await this.pauses.save(pause);
    await this.logPauseEvent(
      saved,
      saved.status === TripPauseStatus.PAUSED ? 'TRIP_PAUSED' : 'PAUSE_APPROVED',
      user.id,
      {
        note: dto.note,
        actor,
      },
    );
    await this.notifyPauseParty(
      parties,
      user.id,
      saved.status === TripPauseStatus.PAUSED ? 'Trip temporarily paused' : 'Trip pause approved',
      dto.note ?? pause.reason,
      saved,
    );
    this.emitPauseUpdate(
      saved,
      saved.status === TripPauseStatus.PAUSED ? 'trip.paused' : 'trip.pause.approved',
    );
    return saved;
  }

  async confirmTripResume(user: AuthUser, id: string, dto: ResumeTripDto) {
    const pause = await this.getPauseForUser(user.id, id);
    if (pause.status !== TripPauseStatus.PAUSED) {
      throw new BadRequestException('Only a paused trip can be resumed');
    }
    const parties = await this.serviceParties(pause.serviceType, pause.serviceId);
    if (!parties.driverUserId) throw new BadRequestException('No driver is assigned to this service');
    const actor = this.assertParticipant(user.id, parties);
    const now = new Date();
    pause.resumeRequestedByUserId ??= user.id;
    if (actor === 'OWNER') pause.riderResumeConfirmedAt = now;
    else pause.driverResumeConfirmedAt = now;
    pause.metadata = { ...(pause.metadata ?? {}), resumeNote: dto.note };
    if (pause.riderResumeConfirmedAt && pause.driverResumeConfirmedAt) {
      pause.status = TripPauseStatus.RESUMED;
      pause.resumedAt = now;
    }
    const saved = await this.pauses.save(pause);
    await this.logPauseEvent(
      saved,
      saved.status === TripPauseStatus.RESUMED ? 'TRIP_RESUMED' : 'RESUME_REQUESTED',
      user.id,
      {
        note: dto.note,
        actor,
      },
    );
    await this.notifyPauseParty(
      parties,
      user.id,
      saved.status === TripPauseStatus.RESUMED ? 'Trip resumed' : 'Trip resume confirmation requested',
      dto.note ?? pause.reason,
      saved,
    );
    this.emitPauseUpdate(
      saved,
      saved.status === TripPauseStatus.RESUMED ? 'trip.resumed' : 'trip.resume.requested',
    );
    return saved;
  }

  async cancelTripPause(user: AuthUser, id: string) {
    const pause = await this.getPauseForUser(user.id, id);
    if (pause.status !== TripPauseStatus.REQUESTED) {
      throw new BadRequestException('Only a pending pause request can be cancelled');
    }
    if (pause.requestedByUserId !== user.id && ![UserRole.ADMIN, UserRole.SUPPORT].includes(user.role)) {
      throw new ForbiddenException('Only the requester or support staff can cancel this pause request');
    }
    pause.status = TripPauseStatus.CANCELLED;
    const saved = await this.pauses.save(pause);
    await this.logPauseEvent(saved, 'PAUSE_CANCELLED', user.id);
    const parties = await this.serviceParties(saved.serviceType, saved.serviceId);
    await this.notifyPauseParty(parties, user.id, 'Trip pause request cancelled', pause.reason, saved);
    this.emitPauseUpdate(saved, 'trip.pause.cancelled');
    return saved;
  }

  async listTripPauses(user: AuthUser, serviceType?: ServiceType, serviceId?: string) {
    if ((serviceType && !serviceId) || (!serviceType && serviceId)) {
      throw new BadRequestException('serviceType and serviceId must be supplied together');
    }
    if (serviceType && serviceId) {
      const parties = await this.serviceParties(serviceType, serviceId);
      this.assertParticipantOrStaff(user, parties);
      return this.pauses.find({ where: { serviceType, serviceId }, order: { createdAt: 'DESC' } });
    }
    if ([UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER].includes(user.role)) {
      return this.pauses.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    const recent = await this.pauses.find({ order: { createdAt: 'DESC' }, take: 200 });
    const visible: TripPauseRequest[] = [];
    for (const pause of recent) {
      try {
        const parties = await this.serviceParties(pause.serviceType, pause.serviceId);
        this.assertParticipant(user.id, parties);
        visible.push(pause);
      } catch (error) {
        if (!(error instanceof ForbiddenException) && !(error instanceof NotFoundException)) throw error;
      }
    }
    return visible;
  }

  async createShare(userId: string, dto: CreateTripShareDto) {
    await this.assertServiceOwner(userId, dto.serviceType, dto.serviceId);
    const share = await this.shares.save(
      this.shares.create({
        ownerUserId: userId,
        serviceType: dto.serviceType,
        serviceId: dto.serviceId,
        token: randomUUID().replaceAll('-', ''),
        recipients: dto.recipients,
        expiresAt: new Date(Date.now() + (dto.expiresInHours ?? 24) * 3600000),
        active: true,
      }),
    );
    this.events.emit('domain.event', {
      eventType: 'safety.trip-share.created',
      aggregateType: 'TripShare',
      aggregateId: share.id,
      payload: { serviceType: share.serviceType, serviceId: share.serviceId, ownerUserId: userId },
    });
    return share;
  }

  async publicShare(token: string) {
    const share = await this.shares.findOne({
      where: { token, active: true, expiresAt: MoreThan(new Date()) },
    });
    if (!share) throw new NotFoundException('Tracking link is invalid or expired');
    const proof = await this.serviceProof(share.serviceType, share.serviceId);
    return { share: { serviceType: share.serviceType, expiresAt: share.expiresAt }, proof };
  }

  async proof(userId: string, serviceType: ServiceType, serviceId: string) {
    await this.assertServiceOwner(userId, serviceType, serviceId, true);
    return this.serviceProof(serviceType, serviceId);
  }

  createMapReport(userId: string, dto: CreateMapReportDto) {
    return this.reports.save(this.reports.create({ reporterUserId: userId, ...dto, status: 'OPEN' }));
  }

  listMapReports(user: AuthUser) {
    return this.reports.find({
      where: user.role === UserRole.ADMIN ? {} : { reporterUserId: user.id },
      order: { createdAt: 'DESC' },
    });
  }

  async createTicket(userId: string, dto: CreateSupportTicketDto) {
    return this.tickets.save(
      this.tickets.create({
        userId,
        ...dto,
        priority: dto.priority ?? SupportPriority.NORMAL,
        status: SupportTicketStatus.OPEN,
        messages: [{ senderUserId: userId, message: dto.description, at: new Date().toISOString() }],
      }),
    );
  }

  listTickets(user: AuthUser, page = 1, limit = 20) {
    const where = [UserRole.ADMIN, UserRole.SUPPORT].includes(user.role) ? {} : { userId: user.id };
    return this.tickets
      .findAndCount({ where, order: { createdAt: 'DESC' }, skip: (page - 1) * limit, take: limit })
      .then(([items, total]) => ({
        items,
        meta: { page, limit, total, pageCount: Math.ceil(total / limit) },
      }));
  }

  async addTicketMessage(user: AuthUser, id: string, dto: SupportMessageDto) {
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    if (![UserRole.ADMIN, UserRole.SUPPORT].includes(user.role) && ticket.userId !== user.id) {
      throw new ForbiddenException('You cannot access this ticket');
    }
    ticket.messages = [
      ...(ticket.messages ?? []),
      { senderUserId: user.id, message: dto.message, at: new Date().toISOString() },
    ];
    if (ticket.status === SupportTicketStatus.CLOSED) ticket.status = SupportTicketStatus.OPEN;
    return this.tickets.save(ticket);
  }

  async updateTicket(user: AuthUser, id: string, dto: UpdateSupportTicketDto) {
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    if (![UserRole.ADMIN, UserRole.SUPPORT].includes(user.role)) {
      throw new ForbiddenException('Support role required');
    }
    Object.assign(ticket, dto);
    return this.tickets.save(ticket);
  }

  async drivingHours(userId: string) {
    const driver = await this.drivers.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    const maximumMinutes = Number(process.env.MAX_DAILY_DRIVING_MINUTES ?? 600);
    return {
      drivingMinutesToday: driver.drivingMinutesToday,
      availableMinutes: Math.max(0, maximumMinutes - driver.drivingMinutesToday),
      mandatoryRestMinutesRemaining: driver.mandatoryRestMinutesRemaining,
      policy: { maximumDailyMinutes: maximumMinutes, recommendedRestHours: '4-6' },
    };
  }

  private async serviceProof(serviceType: ServiceType, serviceId: string) {
    const entity = await this.getService(serviceType, serviceId);
    const driverId = entity.driverId;
    const vehicleId = entity.vehicleId;
    const [driver, vehicle] = await Promise.all([
      driverId ? this.drivers.findOne({ where: { id: driverId } }) : null,
      vehicleId ? this.vehicles.findOne({ where: { id: vehicleId } }) : null,
    ]);
    const driverUser = driver ? await this.users.findOne({ where: { id: driver.userId } }) : null;
    return {
      issuedAt: new Date(),
      issuer: 'EVzone Ride',
      serviceType,
      serviceId,
      status: entity.status,
      startedAt:
        (entity as Ride).startedAt ??
        (entity as DeliveryOrder).pickedUpAt ??
        (entity as RentalBooking).pickupAt ??
        (entity as TouristBooking).startAt,
      completedAt: (entity as Ride).completedAt,
      driver: driver
        ? {
            name: driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : undefined,
            rating: driver.rating,
            active: true,
          }
        : null,
      vehicle: vehicle
        ? { make: vehicle.make, model: vehicle.model, plateNumber: vehicle.plateNumber }
        : null,
      liveLocation:
        driver?.lastLatitude != null
          ? {
              latitude: driver.lastLatitude,
              longitude: driver.lastLongitude,
              updatedAt: driver.lastLocationAt,
            }
          : null,
      verificationText:
        'This record was generated by the EVzone Ride backend and reflects the current service status.',
    };
  }

  private async assertServiceOwner(userId: string, type: ServiceType, id: string, allowDriver = false) {
    const parties = await this.serviceParties(type, id);
    if (parties.ownerUserId === userId) return;
    if (allowDriver && parties.driverUserId === userId) return;
    throw new ForbiddenException('You do not have access to this service');
  }

  private async serviceParties(type: ServiceType, id: string): Promise<ServiceParties> {
    const entity = await this.getService(type, id);
    const ownerUserId =
      type === ServiceType.RIDE
        ? (entity as Ride).riderId
        : type === ServiceType.DELIVERY
          ? (entity as DeliveryOrder).customerId
          : type === ServiceType.TOURIST_VEHICLE
            ? (entity as TouristBooking).customerId
            : type === ServiceType.AMBULANCE
              ? (entity as AmbulanceRequest).requesterId
              : (entity as RentalBooking).renterId;
    const driverProfileId = entity.driverId;
    const driver = driverProfileId
      ? await this.drivers.findOne({ where: { id: driverProfileId } })
      : undefined;
    return { entity, ownerUserId, driverUserId: driver?.userId, driverProfileId };
  }

  private assertParticipant(userId: string, parties: ServiceParties): 'OWNER' | 'DRIVER' {
    if (parties.ownerUserId === userId) return 'OWNER';
    if (parties.driverUserId === userId) return 'DRIVER';
    throw new ForbiddenException('You are not a participant in this service');
  }

  private assertParticipantOrStaff(user: AuthUser, parties: ServiceParties): void {
    if ([UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER].includes(user.role)) return;
    this.assertParticipant(user.id, parties);
  }

  private async getPauseForUser(userId: string, id: string): Promise<TripPauseRequest> {
    const pause = await this.pauses.findOne({ where: { id } });
    if (!pause) throw new NotFoundException('Trip pause request not found');
    const parties = await this.serviceParties(pause.serviceType, pause.serviceId);
    this.assertParticipant(userId, parties);
    return pause;
  }

  private async getIncidentForUser(user: AuthUser, id: string): Promise<EmergencyIncident> {
    const incident = await this.incidents.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('Emergency incident not found');
    const privileged = [UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER].includes(user.role);
    if (!privileged && incident.reporterUserId !== user.id) {
      throw new ForbiddenException('You cannot access this incident');
    }
    return incident;
  }

  private async notifyPauseParty(
    parties: ServiceParties,
    actorUserId: string,
    title: string,
    body: string,
    pause: TripPauseRequest,
  ): Promise<void> {
    const recipientUserId = actorUserId === parties.ownerUserId ? parties.driverUserId : parties.ownerUserId;
    if (!recipientUserId) return;
    await this.notifications.create({
      userId: recipientUserId,
      title,
      body,
      data: {
        pauseRequestId: pause.id,
        serviceType: pause.serviceType,
        serviceId: pause.serviceId,
        status: pause.status,
      },
    });
  }

  private emitPauseUpdate(pause: TripPauseRequest, eventType: string): void {
    const data = { event: eventType, pause };
    this.events.emit('service.updated', {
      serviceType: pause.serviceType,
      serviceId: pause.serviceId,
      data,
    });
    this.events.emit('domain.event', {
      eventType,
      aggregateType: 'TripPauseRequest',
      aggregateId: pause.id,
      payload: {
        pauseRequestId: pause.id,
        serviceType: pause.serviceType,
        serviceId: pause.serviceId,
        requestedByUserId: pause.requestedByUserId,
        status: pause.status,
      },
    });
  }

  private logPauseEvent(
    pause: TripPauseRequest,
    eventType: string,
    actorUserId?: string,
    data?: Record<string, unknown>,
  ) {
    return this.logSafetyEvent(
      pause.id,
      eventType,
      actorUserId,
      { status: pause.status, ...(data ?? {}) },
      'TRIP_PAUSE',
      pause.serviceType,
      pause.serviceId,
    );
  }

  private logSafetyEvent(
    referenceId: string,
    eventType: string,
    actorUserId?: string,
    data?: Record<string, unknown>,
    referenceType = 'INCIDENT',
    serviceType?: ServiceType,
    serviceId?: string,
  ) {
    return this.safetyLogs.save(
      this.safetyLogs.create({
        incidentId: referenceId,
        referenceType,
        serviceType,
        serviceId,
        eventType,
        actorUserId,
        data,
      }),
    );
  }

  private async getService(type: ServiceType, id: string): Promise<ServiceRecord> {
    let entity: ServiceRecord | null;
    switch (type) {
      case ServiceType.RIDE:
        entity = await this.rides.findOne({ where: { id } });
        break;
      case ServiceType.DELIVERY:
        entity = await this.deliveries.findOne({ where: { id } });
        break;
      case ServiceType.TOURIST_VEHICLE:
        entity = await this.tourist.findOne({ where: { id } });
        break;
      case ServiceType.AMBULANCE:
        entity = await this.ambulances.findOne({ where: { id } });
        break;
      case ServiceType.CAR_RENTAL:
        entity = await this.rentals.findOne({ where: { id } });
        break;
      case ServiceType.SCHOOL_SHUTTLE:
        throw new BadRequestException(
          'School shuttle trips are managed by the School backend; use fleet synchronization endpoints here',
        );
      default:
        throw new BadRequestException('Unsupported service type');
    }
    if (!entity) throw new NotFoundException('Service record not found');
    return entity;
  }
}
