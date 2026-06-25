import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AccountStatus,
  BookingStatus,
  DeliveryStatus,
  DocumentStatus,
  PaymentStatus,
  OrganizationStatus,
  VehicleStatus,
} from '../common/enums';
import { pageMeta } from '../common/dto/page-query.dto';
import {
  AgentProfile,
  AmbulanceRequest,
  AuditLog,
  CorporatePayTransaction,
  DispatchDesk,
  DeliveryOrder,
  DriverDocument,
  DriverProfile,
  EmergencyIncident,
  FleetProfile,
  IntegrationOutbox,
  ManualBooking,
  Organization,
  Payment,
  PlatformSetting,
  RentalBooking,
  Ride,
  SchoolFleetConnection,
  SupportTicket,
  TouristBooking,
  User,
  Vehicle,
  VehicleDocument,
} from '../database/entities';
import {
  ReviewDocumentDto,
  ReviewDriverDto,
  ReviewOrganizationDto,
  ReviewVehicleDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  UpsertPlatformSettingDto,
} from './admin.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(DriverDocument) private readonly driverDocuments: Repository<DriverDocument>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(VehicleDocument) private readonly vehicleDocuments: Repository<VehicleDocument>,
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(DeliveryOrder) private readonly deliveries: Repository<DeliveryOrder>,
    @InjectRepository(TouristBooking) private readonly touristBookings: Repository<TouristBooking>,
    @InjectRepository(AmbulanceRequest) private readonly ambulanceRequests: Repository<AmbulanceRequest>,
    @InjectRepository(RentalBooking) private readonly rentalBookings: Repository<RentalBooking>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(EmergencyIncident) private readonly emergencies: Repository<EmergencyIncident>,
    @InjectRepository(SupportTicket) private readonly tickets: Repository<SupportTicket>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(FleetProfile) private readonly fleets: Repository<FleetProfile>,
    @InjectRepository(ManualBooking) private readonly manualBookings: Repository<ManualBooking>,
    @InjectRepository(AgentProfile) private readonly agents: Repository<AgentProfile>,
    @InjectRepository(DispatchDesk) private readonly dispatchDesks: Repository<DispatchDesk>,
    @InjectRepository(CorporatePayTransaction)
    private readonly corporatePay: Repository<CorporatePayTransaction>,
    @InjectRepository(SchoolFleetConnection)
    private readonly schoolConnections: Repository<SchoolFleetConnection>,
    @InjectRepository(IntegrationOutbox) private readonly outbox: Repository<IntegrationOutbox>,
    @InjectRepository(PlatformSetting) private readonly settings: Repository<PlatformSetting>,
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
  ) {}

  async dashboard() {
    const [
      users,
      activeUsers,
      drivers,
      activeVehicles,
      rides,
      activeRides,
      deliveries,
      activeDeliveries,
      touristBookings,
      ambulanceRequests,
      rentalBookings,
      paidPayments,
      openEmergencies,
      openTickets,
      organizations,
      activeFleets,
      manualBookings,
      corporatePayTransactions,
      schoolConnections,
      dispatchAgents,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({ where: { status: AccountStatus.ACTIVE } }),
      this.drivers.count(),
      this.vehicles.count({ where: { isActive: true } }),
      this.rides.count(),
      this.rides.count({ where: { status: BookingStatus.IN_PROGRESS } }),
      this.deliveries.count(),
      this.deliveries.count({ where: { status: DeliveryStatus.IN_TRANSIT } }),
      this.touristBookings.count(),
      this.ambulanceRequests.count(),
      this.rentalBookings.count(),
      this.payments.count({ where: { status: PaymentStatus.PAID } }),
      this.emergencies.count({ where: { status: 'OPEN' as any } }),
      this.tickets.count({ where: { status: 'OPEN' as any } }),
      this.organizations.count(),
      this.fleets.count({ where: { status: OrganizationStatus.ACTIVE } }),
      this.manualBookings.count(),
      this.corporatePay.count(),
      this.schoolConnections.count(),
      this.agents.count(),
    ]);

    const revenue = await this.payments
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .where('payment.status = :status', { status: PaymentStatus.PAID })
      .getRawOne<{ total: string | number }>();

    return {
      users: { total: users, active: activeUsers },
      drivers: { total: drivers },
      vehicles: { active: activeVehicles },
      services: {
        rides: { total: rides, active: activeRides },
        deliveries: { total: deliveries, active: activeDeliveries },
        touristVehicles: { total: touristBookings },
        ambulance: { total: ambulanceRequests },
        carRental: { total: rentalBookings },
      },
      operations: {
        openEmergencies,
        openSupportTickets: openTickets,
        organizations,
        activeFleets,
        manualBookings,
        dispatchAgents,
        schoolConnections,
      },
      payments: {
        paidTransactions: paidPayments,
        corporatePayTransactions,
        grossVolume: Number(revenue?.total ?? 0),
        currency: 'UGX',
      },
      generatedAt: new Date(),
    };
  }

  async listUsers(page = 1, limit = 20, search?: string) {
    const query = this.users.createQueryBuilder('user').orderBy('user.createdAt', 'DESC');
    if (search) {
      query.where(
        '(LOWER(user.firstName) LIKE :search OR LOWER(user.lastName) LIKE :search OR LOWER(user.email) LIKE :search OR user.phone LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }
    const [items, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, meta: pageMeta(page, limit, total) };
  }

  async updateUserStatus(id: string, dto: UpdateUserStatusDto) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.status = dto.status;
    return this.users.save(user);
  }

  async updateUserRole(id: string, dto: UpdateUserRoleDto) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.role = dto.role;
    return this.users.save(user);
  }

  async listDrivers(page = 1, limit = 20) {
    const [items, total] = await this.drivers.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const userIds = items.map((item) => item.userId);
    const users = userIds.length
      ? await this.users.createQueryBuilder('user').where('user.id IN (:...ids)', { ids: userIds }).getMany()
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    return {
      items: items.map((driver) => ({ ...driver, user: userById.get(driver.userId) })),
      meta: pageMeta(page, limit, total),
    };
  }

  async reviewDriver(id: string, dto: ReviewDriverDto) {
    const driver = await this.drivers.findOne({ where: { id } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    driver.verificationStatus = dto.verificationStatus;
    return this.drivers.save(driver);
  }

  async pendingDriverDocuments(page = 1, limit = 20) {
    const [items, total] = await this.driverDocuments.findAndCount({
      where: { status: DocumentStatus.IN_REVIEW },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: pageMeta(page, limit, total) };
  }

  async reviewDriverDocument(adminUserId: string, id: string, dto: ReviewDocumentDto) {
    if (dto.status === DocumentStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('A rejection reason is required');
    }
    const document = await this.driverDocuments.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Driver document not found');
    document.status = dto.status;
    document.rejectionReason = dto.rejectionReason;
    document.reviewedByUserId = adminUserId;
    document.reviewedAt = new Date();
    return this.driverDocuments.save(document);
  }

  async pendingVehicleDocuments(page = 1, limit = 20) {
    const [items, total] = await this.vehicleDocuments.findAndCount({
      where: { status: DocumentStatus.IN_REVIEW },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: pageMeta(page, limit, total) };
  }

  async reviewVehicleDocument(id: string, dto: ReviewDocumentDto) {
    if (dto.status === DocumentStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('A rejection reason is required');
    }
    const document = await this.vehicleDocuments.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Vehicle document not found');
    document.status = dto.status;
    document.rejectionReason = dto.rejectionReason;
    return this.vehicleDocuments.save(document);
  }

  async reviewVehicle(id: string, dto: ReviewVehicleDto) {
    const vehicle = await this.vehicles.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    vehicle.status = dto.status;
    if (dto.status !== VehicleStatus.ACTIVE) vehicle.isActive = false;
    return this.vehicles.save(vehicle);
  }

  async recentBookings(limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const [rides, deliveries, tourist, ambulance, rentals] = await Promise.all([
      this.rides.find({ order: { createdAt: 'DESC' }, take }),
      this.deliveries.find({ order: { createdAt: 'DESC' }, take }),
      this.touristBookings.find({ order: { createdAt: 'DESC' }, take }),
      this.ambulanceRequests.find({ order: { createdAt: 'DESC' }, take }),
      this.rentalBookings.find({ order: { createdAt: 'DESC' }, take }),
    ]);
    return { rides, deliveries, touristVehicles: tourist, ambulance, carRentals: rentals };
  }

  async listOrganizations(page = 1, limit = 20, status?: OrganizationStatus) {
    const [items, total] = await this.organizations.findAndCount({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: pageMeta(page, limit, total) };
  }

  async reviewOrganization(adminUserId: string, id: string, dto: ReviewOrganizationDto) {
    const organization = await this.organizations.findOne({ where: { id } });
    if (!organization) throw new NotFoundException('Organization not found');
    organization.status = dto.status;
    organization.settings = { ...(organization.settings ?? {}), reviewReason: dto.reason };
    if (dto.status === OrganizationStatus.ACTIVE) {
      organization.approvedByUserId = adminUserId;
      organization.approvedAt = new Date();
    }
    await this.fleets.update({ organizationId: id }, { status: dto.status });
    return this.organizations.save(organization);
  }

  async listFleets(page = 1, limit = 20) {
    const [items, total] = await this.fleets.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: pageMeta(page, limit, total) };
  }

  async listManualBookings(page = 1, limit = 20) {
    const [items, total] = await this.manualBookings.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: pageMeta(page, limit, total) };
  }

  async listCorporatePay(page = 1, limit = 20) {
    const [items, total] = await this.corporatePay.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: pageMeta(page, limit, total) };
  }

  async integrationHealth() {
    const [school, pendingOutbox, failedOutbox, desks, agents] = await Promise.all([
      this.schoolConnections.find({ order: { updatedAt: 'DESC' } }),
      this.outbox.count({ where: { status: 'PENDING' } }),
      this.outbox.count({ where: { status: 'FAILED' } }),
      this.dispatchDesks.count(),
      this.agents.count(),
    ]);
    return {
      schoolConnections: school,
      outbox: { pending: pendingOutbox, failed: failedOutbox },
      dispatch: { desks, agents },
      generatedAt: new Date(),
    };
  }

  async listSettings() {
    return this.settings.find({ order: { category: 'ASC', key: 'ASC' } });
  }

  async upsertSetting(adminUserId: string, key: string, dto: UpsertPlatformSettingDto) {
    let item = await this.settings.findOne({ where: { key } });
    item = this.settings.create({
      ...(item ?? {}),
      key,
      category: dto.category,
      value: dto.value,
      protected: dto.protected ?? item?.protected ?? false,
      updatedByUserId: adminUserId,
    });
    return this.settings.save(item);
  }

  async deleteSetting(key: string) {
    const item = await this.settings.findOne({ where: { key } });
    if (!item) throw new NotFoundException('Platform setting not found');
    if (item.protected) throw new BadRequestException('Protected platform settings cannot be deleted');
    await this.settings.delete(item.id);
    return { deleted: true };
  }

  async auditLogs(page = 1, limit = 50) {
    const [items, total] = await this.audits.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: pageMeta(page, limit, total) };
  }
}
