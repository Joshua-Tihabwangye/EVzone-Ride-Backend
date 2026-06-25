import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Between, In, Repository } from 'typeorm';
import { AmbulanceService } from '../ambulance/ambulance.service';
import { CreateAmbulanceRequestDto } from '../ambulance/ambulance.dto';
import {
  AccountStatus,
  BookingSource,
  BookingStatus,
  DeliveryStatus,
  DispatchAssignmentStatus,
  DispatchPriority,
  DriverAvailabilityStatus,
  FleetAssetStatus,
  ManualBookingStatus,
  MembershipStatus,
  OrganizationMemberRole,
  PaymentMethod,
  RentalStatus,
  ServiceType,
  UserRole,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { stringValue } from '../common/utils/values';
import { CorporatePayService } from '../corporate-pay/corporate-pay.service';
import { CreateDeliveryDto } from '../deliveries/deliveries.dto';
import { DeliveriesService } from '../deliveries/deliveries.service';
import {
  AgentProfile,
  AmbulanceRequest,
  DeliveryOrder,
  DispatchAssignment,
  DispatchDesk,
  DispatchEvent,
  DispatchShift,
  DriverProfile,
  FleetDriver,
  FleetVehicle,
  ManualBooking,
  RentalBooking,
  Ride,
  TouristBooking,
  User,
  Vehicle,
} from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateRentalBookingDto } from '../rentals/rentals.dto';
import { RentalsService } from '../rentals/rentals.service';
import { CreateRideDto } from '../rides/rides.dto';
import { RidesService } from '../rides/rides.service';
import { CreateTouristBookingDto } from '../tourist/tourist.dto';
import { TouristService } from '../tourist/tourist.service';
import {
  AssignManualBookingDto,
  CreateAgentProfileDto,
  CreateDispatchDeskDto,
  CreateDispatchShiftDto,
  CreateManualBookingDto,
  DispatchListQueryDto,
  DispatchNoteDto,
  ManualBookingActionDto,
  ManualCustomerDto,
  UpdateAgentProfileDto,
  UpdateDispatchDeskDto,
  UpdateManualBookingDto,
} from './dispatch.dto';

@Injectable()
export class DispatchService {
  constructor(
    @InjectRepository(DispatchDesk) private readonly desks: Repository<DispatchDesk>,
    @InjectRepository(AgentProfile) private readonly agents: Repository<AgentProfile>,
    @InjectRepository(ManualBooking) private readonly manualBookings: Repository<ManualBooking>,
    @InjectRepository(DispatchAssignment) private readonly assignments: Repository<DispatchAssignment>,
    @InjectRepository(DispatchEvent) private readonly dispatchEvents: Repository<DispatchEvent>,
    @InjectRepository(DispatchShift) private readonly shifts: Repository<DispatchShift>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(FleetDriver) private readonly fleetDrivers: Repository<FleetDriver>,
    @InjectRepository(FleetVehicle) private readonly fleetVehicles: Repository<FleetVehicle>,
    @InjectRepository(Ride) private readonly rideRepository: Repository<Ride>,
    @InjectRepository(DeliveryOrder) private readonly deliveryRepository: Repository<DeliveryOrder>,
    @InjectRepository(TouristBooking) private readonly touristRepository: Repository<TouristBooking>,
    @InjectRepository(AmbulanceRequest) private readonly ambulanceRepository: Repository<AmbulanceRequest>,
    @InjectRepository(RentalBooking) private readonly rentalRepository: Repository<RentalBooking>,
    private readonly organizations: OrganizationsService,
    private readonly rides: RidesService,
    private readonly deliveries: DeliveriesService,
    private readonly tourist: TouristService,
    private readonly ambulances: AmbulanceService,
    private readonly rentals: RentalsService,
    private readonly corporatePay: CorporatePayService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  async createDesk(user: AuthUser, organizationId: string, dto: CreateDispatchDeskDto) {
    await this.assertManagement(user, organizationId);
    const code = dto.code?.toUpperCase() ?? `DSP-${randomUUID().slice(0, 8).toUpperCase()}`;
    if (await this.desks.findOne({ where: { code } }))
      throw new ConflictException('Dispatch desk code already exists');
    return this.desks.save(
      this.desks.create({
        ...dto,
        organizationId,
        code,
        timezone: dto.timezone ?? 'Africa/Kampala',
        active: true,
      }),
    );
  }

  async listDesks(user: AuthUser, organizationId: string) {
    await this.assertAccess(user, organizationId);
    return this.desks.find({ where: { organizationId }, order: { createdAt: 'ASC' } });
  }

  async updateDesk(user: AuthUser, organizationId: string, id: string, dto: UpdateDispatchDeskDto) {
    await this.assertManagement(user, organizationId);
    const desk = await this.desks.findOne({ where: { id, organizationId } });
    if (!desk) throw new NotFoundException('Dispatch desk not found');
    Object.assign(desk, dto);
    return this.desks.save(desk);
  }

  async createAgent(user: AuthUser, organizationId: string, dto: CreateAgentProfileDto) {
    await this.assertManagement(user, organizationId);
    const target = await this.users.findOne({ where: { id: dto.userId } });
    if (!target) throw new NotFoundException('User not found');
    if (dto.deskId && !(await this.desks.findOne({ where: { id: dto.deskId, organizationId } }))) {
      throw new NotFoundException('Dispatch desk not found');
    }
    if (await this.agents.findOne({ where: { userId: target.id } })) {
      throw new ConflictException('User already has an agent/dispatcher profile');
    }
    return this.agents.save(
      this.agents.create({
        ...dto,
        organizationId,
        employeeCode: dto.employeeCode?.toUpperCase() ?? `AGT-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: MembershipStatus.ACTIVE,
        canCreateManualBookings: dto.canCreateManualBookings ?? true,
        canAssignDrivers: dto.canAssignDrivers ?? true,
        canOverridePricing: dto.canOverridePricing ?? false,
        canIssueRefunds: dto.canIssueRefunds ?? false,
      }),
    );
  }

  async listAgents(user: AuthUser, organizationId: string) {
    await this.assertAccess(user, organizationId);
    const profiles = await this.agents.find({ where: { organizationId }, order: { createdAt: 'ASC' } });
    const users = profiles.length
      ? await this.users.find({ where: { id: In(profiles.map((item) => item.userId)) } })
      : [];
    const userById = new Map(users.map((item) => [item.id, item]));
    return profiles.map((profile) => ({ ...profile, user: userById.get(profile.userId) }));
  }

  async updateAgent(user: AuthUser, organizationId: string, agentId: string, dto: UpdateAgentProfileDto) {
    await this.assertManagement(user, organizationId);
    const profile = await this.agents.findOne({ where: { id: agentId, organizationId } });
    if (!profile) throw new NotFoundException('Agent profile not found');
    if (dto.deskId && !(await this.desks.findOne({ where: { id: dto.deskId, organizationId } }))) {
      throw new NotFoundException('Dispatch desk not found');
    }
    Object.assign(profile, dto);
    return this.agents.save(profile);
  }

  async dashboard(user: AuthUser, organizationId: string, deskId?: string) {
    await this.assertAccess(user, organizationId);
    const where = { organizationId, ...(deskId ? { deskId } : {}) };
    const [total, pending, assigned, active, completed, cancelled, urgent, onlineAgents] = await Promise.all([
      this.manualBookings.count({ where }),
      this.manualBookings.count({ where: { ...where, status: ManualBookingStatus.DISPATCH_PENDING } }),
      this.manualBookings.count({ where: { ...where, status: ManualBookingStatus.ASSIGNED } }),
      this.manualBookings.count({ where: { ...where, status: ManualBookingStatus.IN_PROGRESS } }),
      this.manualBookings.count({ where: { ...where, status: ManualBookingStatus.COMPLETED } }),
      this.manualBookings.count({ where: { ...where, status: ManualBookingStatus.CANCELLED } }),
      this.manualBookings.count({
        where: { ...where, priority: In([DispatchPriority.URGENT, DispatchPriority.EMERGENCY]) },
      }),
      deskId
        ? this.shifts.count({ where: { deskId, status: 'CHECKED_IN' } })
        : this.shifts
            .createQueryBuilder('shift')
            .innerJoin(DispatchDesk, 'desk', 'desk.id = shift.deskId')
            .where('desk.organizationId = :organizationId', { organizationId })
            .andWhere('shift.status = :status', { status: 'CHECKED_IN' })
            .getCount(),
    ]);
    const byService = await this.manualBookings
      .createQueryBuilder('booking')
      .select('booking.serviceType', 'serviceType')
      .addSelect('COUNT(*)', 'count')
      .where('booking.organizationId = :organizationId', { organizationId })
      .groupBy('booking.serviceType')
      .getRawMany<{ serviceType: string; count: string }>();
    return {
      totals: { total, pending, assigned, active, completed, cancelled, urgent },
      onlineAgents,
      byService: byService.map((row) => ({ serviceType: row.serviceType, count: Number(row.count) })),
      generatedAt: new Date(),
    };
  }

  async createManualBooking(user: AuthUser, organizationId: string, dto: CreateManualBookingDto) {
    await this.assertCanCreate(user, organizationId, dto.serviceType);
    if (
      dto.deskId &&
      !(await this.desks.findOne({ where: { id: dto.deskId, organizationId, active: true } }))
    ) {
      throw new NotFoundException('Active dispatch desk not found');
    }
    const customer = await this.resolveCustomer(dto.customer);
    const paymentMethod = dto.paymentMethod ?? this.payloadPaymentMethod(dto.payload) ?? PaymentMethod.CASH;
    const payload = { ...dto.payload, paymentMethod } as Record<string, unknown>;
    if (dto.scheduledAt && payload.scheduledAt === undefined) payload.scheduledAt = dto.scheduledAt;
    const booking = await this.manualBookings.save(
      this.manualBookings.create({
        reference: `MB-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`,
        organizationId,
        deskId: dto.deskId,
        agentUserId: user.id,
        source:
          dto.source ?? (user.role === UserRole.DISPATCHER ? BookingSource.DISPATCHER : BookingSource.AGENT),
        serviceType: dto.serviceType,
        status: ManualBookingStatus.DRAFT,
        priority:
          dto.priority ??
          (dto.serviceType === ServiceType.AMBULANCE ? DispatchPriority.EMERGENCY : DispatchPriority.NORMAL),
        customerUserId: customer.id,
        customer: { ...dto.customer, userId: customer.id },
        bookingPayload: payload,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        paymentMethod,
        quotedAmount: dto.quotedAmount,
        notes: dto.notes,
      }),
    );
    await this.log(booking.id, 'MANUAL_BOOKING_DRAFTED', user.id, {
      source: booking.source,
      customerUserId: customer.id,
    });
    try {
      const result = await this.provisionService(customer.id, dto.serviceType, payload);
      if (
        dto.corporatePayAuthorizedAmount !== undefined &&
        result.amount > dto.corporatePayAuthorizedAmount + 0.01
      ) {
        await this.rollbackProvisionedService(
          customer,
          dto.serviceType,
          result.serviceId,
          'CORPORATEPAY_AUTHORIZATION_EXCEEDED',
        );
        throw new BadRequestException(
          `Provisioned amount ${result.amount} exceeds CorporatePay authorization ${dto.corporatePayAuthorizedAmount}`,
        );
      }
      booking.serviceId = result.serviceId;
      booking.status = ManualBookingStatus.DISPATCH_PENDING;
      booking.quotedAmount = dto.quotedAmount ?? result.amount;
      booking.currency = result.currency ?? 'UGX';
      await this.manualBookings.save(booking);
      await this.log(booking.id, 'SERVICE_BOOKING_CREATED', user.id, {
        serviceId: result.serviceId,
        serviceType: dto.serviceType,
      });
      if (dto.assignment?.driverId || dto.assignment?.vehicleId) {
        await this.assign(user, organizationId, booking.id, dto.assignment);
      }
      if (paymentMethod === PaymentMethod.CORPORATE_PAY && dto.corporatePayAccountId) {
        const transaction = await this.corporatePay.initiateForActor(user, customer.id, {
          accountId: dto.corporatePayAccountId,
          organizationId,
          serviceType: dto.serviceType,
          serviceId: result.serviceId,
          manualBookingId: booking.id,
          idempotencyKey: `manual-${booking.id}`,
          description: `Manual booking ${booking.reference}`,
          externalRequestId: dto.corporatePayExternalRequestId,
          externalAuthorizationId: dto.corporatePayExternalAuthorizationId,
          authorizedAmount: dto.corporatePayAuthorizedAmount,
          approvalId: dto.corporatePayApprovalId,
          policyId: dto.corporatePayPolicyId,
          budgetId: dto.corporatePayBudgetId,
          budgetReservationId: dto.corporatePayBudgetReservationId,
          costCenterId: dto.corporatePayCostCenterId,
          groupId: dto.corporatePayGroupId,
          purchaseOrderId: dto.corporatePayPurchaseOrderId,
          corporateContext: dto.corporateContext,
        });
        booking.corporatePayTransactionId = transaction?.id;
        await this.manualBookings.save(booking);
      }
      await this.notifications.create({
        userId: customer.id,
        title: 'Booking created by EVzone agent',
        body: `${booking.reference} has been created for ${dto.serviceType}.`,
        data: { manualBookingId: booking.id, serviceId: booking.serviceId, serviceType: booking.serviceType },
      });
      this.events.emit('dispatch.booking.updated', {
        organizationId,
        manualBookingId: booking.id,
        data: booking,
      });
      return this.detail(user, organizationId, booking.id);
    } catch (error) {
      booking.status = ManualBookingStatus.FAILED;
      booking.failureReason = error instanceof Error ? error.message : String(error);
      await this.manualBookings.save(booking);
      await this.log(booking.id, 'MANUAL_BOOKING_FAILED', user.id, { error: booking.failureReason });
      throw error;
    }
  }

  async list(user: AuthUser, organizationId: string, query: DispatchListQueryDto) {
    await this.assertAccess(user, organizationId);
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const builder = this.manualBookings
      .createQueryBuilder('booking')
      .where('booking.organizationId = :organizationId', { organizationId });
    if (query.serviceType)
      builder.andWhere('booking.serviceType = :serviceType', { serviceType: query.serviceType });
    if (query.status) builder.andWhere('booking.status = :status', { status: query.status });
    if (query.priority) builder.andWhere('booking.priority = :priority', { priority: query.priority });
    if (query.from) builder.andWhere('booking.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) builder.andWhere('booking.createdAt <= :to', { to: new Date(query.to) });
    if (query.search) {
      builder.andWhere('(LOWER(booking.reference) LIKE :search OR LOWER(booking.serviceId) LIKE :search)', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }
    const [items, total] = await builder
      .orderBy(
        "CASE booking.priority WHEN 'EMERGENCY' THEN 1 WHEN 'URGENT' THEN 2 WHEN 'HIGH' THEN 3 WHEN 'NORMAL' THEN 4 ELSE 5 END",
        'ASC',
      )
      .addOrderBy('booking.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async detail(user: AuthUser, organizationId: string, id: string) {
    await this.assertAccess(user, organizationId);
    const booking = await this.manualBookings.findOne({ where: { id, organizationId } });
    if (!booking) throw new NotFoundException('Manual booking not found');
    const [assignments, events, service] = await Promise.all([
      this.assignments.find({ where: { manualBookingId: id }, order: { createdAt: 'DESC' } }),
      this.dispatchEvents.find({ where: { manualBookingId: id }, order: { createdAt: 'ASC' } }),
      this.serviceEntity(booking.serviceType, booking.serviceId),
    ]);
    return { booking, assignments, events, service };
  }

  async update(user: AuthUser, organizationId: string, id: string, dto: UpdateManualBookingDto) {
    await this.assertCanCreate(user, organizationId);
    const booking = await this.manualBookings.findOne({ where: { id, organizationId } });
    if (!booking) throw new NotFoundException('Manual booking not found');
    if (
      [
        ManualBookingStatus.IN_PROGRESS,
        ManualBookingStatus.COMPLETED,
        ManualBookingStatus.CANCELLED,
      ].includes(booking.status)
    ) {
      throw new BadRequestException(`Booking cannot be edited in ${booking.status} status`);
    }
    Object.assign(booking, dto, {
      bookingPayload: dto.payload ? { ...booking.bookingPayload, ...dto.payload } : booking.bookingPayload,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : booking.scheduledAt,
    });
    await this.log(booking.id, 'MANUAL_BOOKING_UPDATED', user.id, dto as unknown as Record<string, unknown>);
    return this.manualBookings.save(booking);
  }

  async assign(user: AuthUser, organizationId: string, id: string, dto: AssignManualBookingDto) {
    await this.assertCanAssign(user, organizationId);
    const booking = await this.manualBookings.findOne({ where: { id, organizationId } });
    if (!booking) throw new NotFoundException('Manual booking not found');
    if (!booking.serviceId) throw new BadRequestException('Manual booking has no provisioned service');
    if (!dto.driverId && !dto.vehicleId) throw new BadRequestException('driverId or vehicleId is required');
    const driver = dto.driverId ? await this.drivers.findOne({ where: { id: dto.driverId } }) : undefined;
    const vehicle = dto.vehicleId ? await this.vehicles.findOne({ where: { id: dto.vehicleId } }) : undefined;
    if (dto.driverId && !driver) throw new NotFoundException('Driver profile not found');
    if (dto.vehicleId && !vehicle) throw new NotFoundException('Vehicle not found');
    if (driver && !driver.serviceCapabilities?.includes(booking.serviceType)) {
      throw new BadRequestException('Driver does not support this service');
    }
    if (vehicle && !vehicle.serviceCapabilities?.includes(booking.serviceType)) {
      throw new BadRequestException('Vehicle does not support this service');
    }
    if (dto.fleetId)
      await this.validateFleetAssets(dto.fleetId, dto.driverId, dto.vehicleId, booking.serviceType);
    await this.applyAssignment(booking, driver ?? undefined, vehicle ?? undefined, user.id);
    const assignment = await this.assignments.save(
      this.assignments.create({
        manualBookingId: booking.id,
        serviceType: booking.serviceType,
        serviceId: booking.serviceId,
        dispatcherUserId: user.id,
        fleetId: dto.fleetId,
        driverId: driver?.id,
        vehicleId: vehicle?.id,
        status: dto.status ?? DispatchAssignmentStatus.ACCEPTED,
        offeredAt: new Date(),
        respondedAt: new Date(),
        reason: dto.reason,
        metadata: dto.metadata,
      }),
    );
    booking.assignedDriverId = driver?.id;
    booking.assignedVehicleId = vehicle?.id;
    booking.status = ManualBookingStatus.ASSIGNED;
    await this.manualBookings.save(booking);
    if (driver) {
      driver.availabilityStatus = DriverAvailabilityStatus.BUSY;
      await this.drivers.save(driver);
      await this.notifications.create({
        userId: driver.userId,
        title: 'Dispatcher assignment',
        body: `You have been assigned ${booking.reference}.`,
        data: { manualBookingId: booking.id, serviceType: booking.serviceType, serviceId: booking.serviceId },
      });
    }
    if (booking.customerUserId) {
      await this.notifications.create({
        userId: booking.customerUserId,
        title: 'Driver assigned',
        body: `A driver has been assigned to ${booking.reference}.`,
        data: { manualBookingId: booking.id, driverId: driver?.id, vehicleId: vehicle?.id },
      });
    }
    await this.log(booking.id, 'DISPATCH_ASSIGNED', user.id, {
      assignmentId: assignment.id,
      driverId: driver?.id,
      vehicleId: vehicle?.id,
    });
    this.events.emit('dispatch.booking.updated', {
      organizationId,
      manualBookingId: booking.id,
      data: booking,
    });
    return { booking, assignment };
  }

  async addNote(user: AuthUser, organizationId: string, id: string, dto: DispatchNoteDto) {
    await this.assertAccess(user, organizationId);
    const booking = await this.manualBookings.findOne({ where: { id, organizationId } });
    if (!booking) throw new NotFoundException('Manual booking not found');
    return this.log(
      id,
      dto.internal === false ? 'CUSTOMER_NOTE' : 'INTERNAL_NOTE',
      user.id,
      dto as unknown as Record<string, unknown>,
    );
  }

  async cancel(user: AuthUser, organizationId: string, id: string, dto: ManualBookingActionDto) {
    await this.assertCanCreate(user, organizationId);
    const booking = await this.manualBookings.findOne({ where: { id, organizationId } });
    if (!booking) throw new NotFoundException('Manual booking not found');
    if ([ManualBookingStatus.COMPLETED, ManualBookingStatus.CANCELLED].includes(booking.status)) {
      throw new BadRequestException(`Booking is already ${booking.status}`);
    }
    if (booking.serviceId && booking.customerUserId) {
      const customer = await this.users.findOne({ where: { id: booking.customerUserId } });
      if (customer) {
        const auth = this.authForUser(customer);
        const reason = [dto.reason, dto.comment].filter(Boolean).join(': ');
        switch (booking.serviceType) {
          case ServiceType.RIDE:
            await this.rides.cancel(auth, booking.serviceId, { reason: dto.reason, comment: dto.comment });
            break;
          case ServiceType.DELIVERY:
            await this.deliveries.cancel(auth, booking.serviceId, { reason });
            break;
          case ServiceType.TOURIST_VEHICLE:
            await this.tourist.cancel(auth, booking.serviceId, { reason });
            break;
          case ServiceType.AMBULANCE:
            await this.ambulances.cancel(auth, booking.serviceId, { reason });
            break;
          case ServiceType.CAR_RENTAL:
            await this.rentals.cancel(auth, booking.serviceId, { reason });
            break;
          case ServiceType.SCHOOL_SHUTTLE:
            break;
        }
      }
    }
    booking.status = ManualBookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    booking.notes = [booking.notes, dto.reason, dto.comment].filter(Boolean).join('\n');
    await this.manualBookings.save(booking);
    await this.assignments.update(
      { manualBookingId: booking.id },
      { status: DispatchAssignmentStatus.CANCELLED, reason: dto.reason },
    );
    await this.log(booking.id, 'MANUAL_BOOKING_CANCELLED', user.id, {
      reason: dto.reason,
      comment: dto.comment,
    });
    return booking;
  }

  async syncStatus(user: AuthUser, organizationId: string, id: string) {
    await this.assertAccess(user, organizationId);
    const booking = await this.manualBookings.findOne({ where: { id, organizationId } });
    if (!booking) throw new NotFoundException('Manual booking not found');
    const service = await this.serviceEntity(booking.serviceType, booking.serviceId);
    if (service) {
      booking.status = this.mapManualStatus(String((service as any).status));
      if (booking.status === ManualBookingStatus.COMPLETED) booking.completedAt ??= new Date();
      if (booking.status === ManualBookingStatus.CANCELLED) booking.cancelledAt ??= new Date();
      await this.manualBookings.save(booking);
    }
    return { booking, service };
  }

  async createShift(user: AuthUser, organizationId: string, dto: CreateDispatchShiftDto) {
    await this.assertManagement(user, organizationId);
    const desk = await this.desks.findOne({ where: { id: dto.deskId, organizationId } });
    if (!desk) throw new NotFoundException('Dispatch desk not found');
    const agent = await this.agents.findOne({ where: { userId: dto.userId, organizationId } });
    if (!agent) throw new NotFoundException('Agent profile not found');
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('Shift end must be after shift start');
    return this.shifts.save(this.shifts.create({ ...dto, startsAt, endsAt, status: 'SCHEDULED' }));
  }

  async listShifts(user: AuthUser, organizationId: string, deskId?: string, from?: string, to?: string) {
    await this.assertAccess(user, organizationId);
    const desks = deskId
      ? [await this.desks.findOne({ where: { id: deskId, organizationId } })].filter(Boolean)
      : await this.desks.find({ where: { organizationId } });
    const ids = desks.map((item) => item!.id);
    if (!ids.length) return [];
    const dateWhere = from && to ? { startsAt: Between(new Date(from), new Date(to)) } : {};
    return this.shifts.find({ where: { deskId: In(ids), ...dateWhere }, order: { startsAt: 'ASC' } });
  }

  async checkIn(user: AuthUser, shiftId: string) {
    const shift = await this.shifts.findOne({ where: { id: shiftId, userId: user.id } });
    if (!shift) throw new NotFoundException('Your dispatch shift was not found');
    shift.status = 'CHECKED_IN';
    shift.checkedInAt = new Date();
    return this.shifts.save(shift);
  }

  async checkOut(user: AuthUser, shiftId: string) {
    const shift = await this.shifts.findOne({ where: { id: shiftId, userId: user.id } });
    if (!shift) throw new NotFoundException('Your dispatch shift was not found');
    shift.status = 'COMPLETED';
    shift.checkedOutAt = new Date();
    return this.shifts.save(shift);
  }

  private async rollbackProvisionedService(
    customer: User,
    type: ServiceType,
    serviceId: string,
    reason: string,
  ) {
    const auth = this.authForUser(customer);
    try {
      switch (type) {
        case ServiceType.RIDE:
          await this.rides.cancel(auth, serviceId, { reason });
          break;
        case ServiceType.DELIVERY:
          await this.deliveries.cancel(auth, serviceId, { reason });
          break;
        case ServiceType.TOURIST_VEHICLE:
          await this.tourist.cancel(auth, serviceId, { reason });
          break;
        case ServiceType.AMBULANCE:
          await this.ambulances.cancel(auth, serviceId, { reason });
          break;
        case ServiceType.CAR_RENTAL:
          await this.rentals.cancel(auth, serviceId, { reason });
          break;
        case ServiceType.SCHOOL_SHUTTLE:
          break;
      }
    } catch {
      // The original authorization error remains the primary error; status synchronization will
      // surface any service that could not be rolled back for operations review.
    }
  }

  private async provisionService(
    customerUserId: string,
    type: ServiceType,
    payload: Record<string, unknown>,
  ) {
    switch (type) {
      case ServiceType.RIDE: {
        const dto = await this.validatePayload(CreateRideDto, payload);
        const result = await this.rides.create(customerUserId, dto);
        return {
          serviceId: result.ride.id,
          amount: result.ride.estimatedFare,
          currency: result.ride.currency,
        };
      }
      case ServiceType.DELIVERY: {
        const dto = await this.validatePayload(CreateDeliveryDto, payload);
        const result = await this.deliveries.create(customerUserId, dto);
        return {
          serviceId: result.order.id,
          amount: result.order.estimatedCost,
          currency: result.order.currency,
        };
      }
      case ServiceType.TOURIST_VEHICLE: {
        const dto = await this.validatePayload(CreateTouristBookingDto, payload);
        const result = await this.tourist.create(customerUserId, dto);
        return { serviceId: result.id, amount: result.estimatedAmount, currency: result.currency };
      }
      case ServiceType.AMBULANCE: {
        const dto = await this.validatePayload(CreateAmbulanceRequestDto, payload);
        const result = await this.ambulances.create(customerUserId, dto);
        return { serviceId: result.id, amount: result.estimatedCost, currency: 'UGX' };
      }
      case ServiceType.CAR_RENTAL: {
        const dto = await this.validatePayload(CreateRentalBookingDto, payload);
        const result = await this.rentals.create(customerUserId, dto);
        return { serviceId: result.id, amount: result.estimatedAmount, currency: result.currency };
      }
      case ServiceType.SCHOOL_SHUTTLE: {
        const externalTripId = stringValue(payload.externalTripId ?? payload.tripId);
        if (!externalTripId)
          throw new BadRequestException('School shuttle manual booking requires payload.externalTripId');
        return {
          serviceId: externalTripId,
          amount: Number(payload.amount ?? 0),
          currency: stringValue(payload.currency, 'UGX'),
        };
      }
    }
  }

  private async applyAssignment(
    booking: ManualBooking,
    driver: DriverProfile | undefined,
    vehicle: Vehicle | undefined,
    dispatcherUserId: string,
  ) {
    if (!booking.serviceId) throw new BadRequestException('Service ID is missing');
    switch (booking.serviceType) {
      case ServiceType.RIDE: {
        const ride = await this.rideRepository.findOne({ where: { id: booking.serviceId } });
        if (!ride) throw new NotFoundException('Ride not found');
        ride.driverId = driver?.id;
        ride.vehicleId = vehicle?.id ?? driver?.currentVehicleId;
        ride.status = BookingStatus.DRIVER_EN_ROUTE;
        ride.acceptedAt = new Date();
        await this.rideRepository.save(ride);
        break;
      }
      case ServiceType.DELIVERY: {
        const order = await this.deliveryRepository.findOne({ where: { id: booking.serviceId } });
        if (!order) throw new NotFoundException('Delivery not found');
        order.driverId = driver?.id;
        order.vehicleId = vehicle?.id ?? driver?.currentVehicleId;
        order.status = DeliveryStatus.DRIVER_ASSIGNED;
        await this.deliveryRepository.save(order);
        break;
      }
      case ServiceType.TOURIST_VEHICLE: {
        const item = await this.touristRepository.findOne({ where: { id: booking.serviceId } });
        if (!item) throw new NotFoundException('Tourist booking not found');
        item.driverId = driver?.id;
        item.vehicleId = vehicle?.id ?? driver?.currentVehicleId;
        item.status = BookingStatus.DRIVER_EN_ROUTE;
        await this.touristRepository.save(item);
        break;
      }
      case ServiceType.AMBULANCE: {
        const item = await this.ambulanceRepository.findOne({ where: { id: booking.serviceId } });
        if (!item) throw new NotFoundException('Ambulance request not found');
        item.dispatcherId = dispatcherUserId;
        item.driverId = driver?.id;
        item.vehicleId = vehicle?.id ?? driver?.currentVehicleId;
        item.status = BookingStatus.DRIVER_EN_ROUTE;
        await this.ambulanceRepository.save(item);
        break;
      }
      case ServiceType.CAR_RENTAL: {
        const item = await this.rentalRepository.findOne({ where: { id: booking.serviceId } });
        if (!item) throw new NotFoundException('Rental booking not found');
        item.driverId = driver?.id;
        if (vehicle) item.vehicleId = vehicle.id;
        item.status = RentalStatus.CONFIRMED;
        await this.rentalRepository.save(item);
        break;
      }
      case ServiceType.SCHOOL_SHUTTLE:
        break;
    }
  }

  private async validateFleetAssets(
    fleetId: string,
    driverId: string | undefined,
    vehicleId: string | undefined,
    type: ServiceType,
  ) {
    if (driverId) {
      const link = await this.fleetDrivers.findOne({
        where: { fleetId, driverId, status: FleetAssetStatus.ACTIVE },
      });
      if (!link) throw new BadRequestException('Driver is not active in the selected fleet');
      if (!link.serviceCapabilities?.includes(type))
        throw new BadRequestException('Fleet driver lacks this service capability');
    }
    if (vehicleId) {
      const link = await this.fleetVehicles.findOne({
        where: { fleetId, vehicleId, status: FleetAssetStatus.ACTIVE },
      });
      if (!link) throw new BadRequestException('Vehicle is not active in the selected fleet');
      if (!link.serviceCapabilities?.includes(type))
        throw new BadRequestException('Fleet vehicle lacks this service capability');
    }
  }

  private async serviceEntity(type: ServiceType, id?: string) {
    if (!id) return null;
    switch (type) {
      case ServiceType.RIDE:
        return this.rideRepository.findOne({ where: { id } });
      case ServiceType.DELIVERY:
        return this.deliveryRepository.findOne({ where: { id } });
      case ServiceType.TOURIST_VEHICLE:
        return this.touristRepository.findOne({ where: { id } });
      case ServiceType.AMBULANCE:
        return this.ambulanceRepository.findOne({ where: { id } });
      case ServiceType.CAR_RENTAL:
        return this.rentalRepository.findOne({ where: { id } });
      case ServiceType.SCHOOL_SHUTTLE:
        return { externalTripId: id, source: 'SCHOOL_APP' };
    }
  }

  private async resolveCustomer(dto: ManualCustomerDto) {
    if (dto.userId) {
      const user = await this.users.findOne({ where: { id: dto.userId } });
      if (!user) throw new NotFoundException('Customer user was not found');
      return user;
    }
    let user: User | null = null;
    if (dto.email) user = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
    if (!user && dto.phone) user = await this.users.findOne({ where: { phone: dto.phone } });
    if (user) return user;
    if (!dto.email && !dto.phone)
      throw new BadRequestException('Manual customer requires userId, email or phone');
    const passwordHash = await bcrypt.hash(randomUUID(), 12);
    try {
      return await this.users.save(
        this.users.create({
          email: dto.email?.toLowerCase(),
          phone: dto.phone,
          passwordHash,
          firstName: dto.firstName ?? dto.companyName ?? 'Manual',
          lastName: dto.lastName ?? 'Customer',
          role: UserRole.CUSTOMER,
          status: AccountStatus.ACTIVE,
          metadata: { source: 'AGENT_MANUAL_BOOKING', companyName: dto.companyName, ...(dto.metadata ?? {}) },
        }),
      );
    } catch {
      const existing = dto.email
        ? await this.users.findOne({ where: { email: dto.email.toLowerCase() } })
        : dto.phone
          ? await this.users.findOne({ where: { phone: dto.phone } })
          : null;
      if (existing) return existing;
      throw new ConflictException('Unable to create manual customer account');
    }
  }

  private async validatePayload<T extends object>(
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

  private payloadPaymentMethod(payload: Record<string, unknown>) {
    const value = payload.paymentMethod;
    return Object.values(PaymentMethod).includes(value as PaymentMethod)
      ? (value as PaymentMethod)
      : undefined;
  }

  private mapManualStatus(status: string) {
    if (['COMPLETED', 'DELIVERED'].includes(status)) return ManualBookingStatus.COMPLETED;
    if (['CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED'].includes(status))
      return ManualBookingStatus.CANCELLED;
    if (['IN_PROGRESS', 'ACTIVE', 'IN_TRANSIT'].includes(status)) return ManualBookingStatus.IN_PROGRESS;
    if (['DRIVER_EN_ROUTE', 'DRIVER_ASSIGNED', 'CONFIRMED', 'ACCEPTED'].includes(status))
      return ManualBookingStatus.ASSIGNED;
    return ManualBookingStatus.DISPATCH_PENDING;
  }

  private authForUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  private async assertAccess(user: AuthUser, organizationId: string) {
    return this.organizations.assertAccess(user, organizationId, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
      OrganizationMemberRole.DISPATCH_MANAGER,
      OrganizationMemberRole.DISPATCHER,
      OrganizationMemberRole.AGENT,
      OrganizationMemberRole.FLEET_MANAGER,
      OrganizationMemberRole.VIEWER,
    ]);
  }

  private async assertManagement(user: AuthUser, organizationId: string) {
    return this.organizations.assertAccess(user, organizationId, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
      OrganizationMemberRole.DISPATCH_MANAGER,
    ]);
  }

  private async assertCanCreate(user: AuthUser, organizationId: string, serviceType?: ServiceType) {
    await this.organizations.assertAccess(user, organizationId, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
      OrganizationMemberRole.DISPATCH_MANAGER,
      OrganizationMemberRole.DISPATCHER,
      OrganizationMemberRole.AGENT,
    ]);
    const profile = await this.agents.findOne({ where: { userId: user.id, organizationId } });
    if (profile) {
      if (profile.status !== MembershipStatus.ACTIVE || !profile.canCreateManualBookings) {
        throw new ForbiddenException('Agent profile cannot create manual bookings');
      }
      if (
        serviceType &&
        profile.serviceCapabilities?.length &&
        !profile.serviceCapabilities.includes(serviceType)
      ) {
        throw new ForbiddenException('Agent is not enabled for this service');
      }
    }
  }

  private async assertCanAssign(user: AuthUser, organizationId: string) {
    await this.organizations.assertAccess(user, organizationId, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
      OrganizationMemberRole.DISPATCH_MANAGER,
      OrganizationMemberRole.DISPATCHER,
    ]);
    const profile = await this.agents.findOne({ where: { userId: user.id, organizationId } });
    if (profile && !profile.canAssignDrivers) throw new ForbiddenException('Agent cannot assign drivers');
  }

  private log(
    manualBookingId: string,
    eventType: string,
    actorUserId?: string,
    data?: Record<string, unknown>,
  ) {
    return this.dispatchEvents.save(
      this.dispatchEvents.create({ manualBookingId, eventType, actorUserId, data }),
    );
  }
}
