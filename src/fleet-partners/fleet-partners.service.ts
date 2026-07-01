import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import {
  BookingStatus,
  DeliveryStatus,
  DriverVerificationStatus,
  FleetAssetStatus,
  FleetAssignmentStatus,
  IntegrationStatus,
  MaintenanceStatus,
  OrganizationMemberRole,
  OrganizationStatus,
  OrganizationType,
  RentalStatus,
  ServiceType,
  SyncDirection,
  SyncStatus,
  UserRole,
  VehicleStatus,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { decryptSecret, encryptSecret, verifyPayloadSignature } from '../common/utils/crypto-vault';
import { getRequiredSecret } from '../common/utils/required-secret.util';
import { stringValue } from '../common/utils/values';
import {
  AmbulanceRequest,
  DeliveryOrder,
  DriverProfile,
  FleetAssignment,
  FleetDriver,
  FleetMaintenanceRecord,
  FleetProfile,
  FleetVehicle,
  Organization,
  Payment,
  RentalBooking,
  Ride,
  SchoolFleetConnection,
  SchoolFleetResource,
  SchoolSyncJob,
  TouristBooking,
  User,
  Vehicle,
} from '../database/entities';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  CreateFleetAssignmentDto,
  CreateFleetProfileDto,
  CreateMaintenanceRecordDto,
  CreateSchoolConnectionDto,
  FleetListQueryDto,
  LinkFleetDriverDto,
  LinkFleetVehicleDto,
  RunSchoolSyncDto,
  SchoolResourceDto,
  UpdateFleetAssignmentDto,
  UpdateFleetDriverDto,
  UpdateFleetProfileDto,
  UpdateFleetVehicleDto,
  UpdateMaintenanceRecordDto,
  UpdateSchoolConnectionDto,
} from './fleet-partners.dto';

@Injectable()
export class FleetPartnersService {
  constructor(
    @InjectRepository(Organization) private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(FleetProfile) private readonly fleets: Repository<FleetProfile>,
    @InjectRepository(FleetVehicle) private readonly fleetVehicles: Repository<FleetVehicle>,
    @InjectRepository(FleetDriver) private readonly fleetDrivers: Repository<FleetDriver>,
    @InjectRepository(FleetAssignment) private readonly assignments: Repository<FleetAssignment>,
    @InjectRepository(FleetMaintenanceRecord)
    private readonly maintenance: Repository<FleetMaintenanceRecord>,
    @InjectRepository(SchoolFleetConnection) private readonly connections: Repository<SchoolFleetConnection>,
    @InjectRepository(SchoolFleetResource) private readonly schoolResources: Repository<SchoolFleetResource>,
    @InjectRepository(SchoolSyncJob) private readonly syncJobs: Repository<SchoolSyncJob>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(DeliveryOrder) private readonly deliveries: Repository<DeliveryOrder>,
    @InjectRepository(TouristBooking) private readonly tourist: Repository<TouristBooking>,
    @InjectRepository(AmbulanceRequest) private readonly ambulances: Repository<AmbulanceRequest>,
    @InjectRepository(RentalBooking) private readonly rentals: Repository<RentalBooking>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly organizations: OrganizationsService,
    private readonly events: EventEmitter2,
  ) {}

  async createProfile(user: AuthUser, organizationId: string, dto: CreateFleetProfileDto) {
    await this.organizations.assertAccess(user, organizationId, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
      OrganizationMemberRole.FLEET_MANAGER,
    ]);
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organization not found');
    if (
      ![
        OrganizationType.FLEET_PARTNER,
        OrganizationType.SCHOOL_OPERATOR,
        OrganizationType.MEDICAL_PROVIDER,
        OrganizationType.TOUR_OPERATOR,
        OrganizationType.RENTAL_OPERATOR,
      ].includes(organization.type)
    ) {
      throw new BadRequestException('This organization type cannot own a fleet profile');
    }
    if (await this.fleets.findOne({ where: { organizationId } })) {
      throw new ConflictException('A fleet profile already exists for this organization');
    }
    const code = dto.code?.toUpperCase() ?? `FLT-${randomUUID().slice(0, 8).toUpperCase()}`;
    if (await this.fleets.findOne({ where: { code } }))
      throw new ConflictException('Fleet code already exists');
    const fleet = await this.fleets.save(
      this.fleets.create({
        ...dto,
        organizationId,
        code,
        status: organization.status,
        serviceCapabilities: dto.serviceCapabilities ?? organization.serviceCapabilities ?? [],
        schoolShuttleEnabled:
          dto.schoolShuttleEnabled ?? dto.serviceCapabilities?.includes(ServiceType.SCHOOL_SHUTTLE) ?? false,
      }),
    );
    organization.serviceCapabilities = fleet.serviceCapabilities;
    await this.organizationRepository.save(organization);
    return fleet;
  }

  async profile(user: AuthUser, organizationId: string) {
    await this.organizations.assertAccess(user, organizationId);
    return this.getFleetByOrganization(organizationId);
  }

  async updateProfile(user: AuthUser, organizationId: string, dto: UpdateFleetProfileDto) {
    await this.organizations.assertAccess(user, organizationId, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
      OrganizationMemberRole.FLEET_MANAGER,
    ]);
    const fleet = await this.getFleetByOrganization(organizationId);
    Object.assign(fleet, dto);
    if (dto.serviceCapabilities) {
      const organization = await this.organizationRepository.findOne({ where: { id: organizationId } });
      if (organization) {
        organization.serviceCapabilities = dto.serviceCapabilities;
        await this.organizationRepository.save(organization);
      }
    }
    return this.fleets.save(fleet);
  }

  async dashboard(user: AuthUser, organizationId: string) {
    await this.organizations.assertAccess(user, organizationId);
    const fleet = await this.getFleetByOrganization(organizationId);
    const fleetVehicleLinks = await this.fleetVehicles.find({ where: { fleetId: fleet.id } });
    const fleetDriverLinks = await this.fleetDrivers.find({ where: { fleetId: fleet.id } });
    const vehicleIds = fleetVehicleLinks.map((item) => item.vehicleId);
    const driverIds = fleetDriverLinks.map((item) => item.driverId);
    const [
      activeVehicleCount,
      activeDriverCount,
      plannedAssignments,
      activeAssignments,
      openMaintenance,
      schoolConnections,
      recentSyncFailures,
    ] = await Promise.all([
      this.fleetVehicles.count({ where: { fleetId: fleet.id, status: FleetAssetStatus.ACTIVE } }),
      this.fleetDrivers.count({ where: { fleetId: fleet.id, status: FleetAssetStatus.ACTIVE } }),
      this.assignments.count({ where: { fleetId: fleet.id, status: FleetAssignmentStatus.PLANNED } }),
      this.assignments.count({ where: { fleetId: fleet.id, status: FleetAssignmentStatus.ACTIVE } }),
      this.maintenance.count({
        where: {
          fleetId: fleet.id,
          status: In([MaintenanceStatus.SCHEDULED, MaintenanceStatus.IN_PROGRESS]),
        },
      }),
      this.connections.count({ where: { fleetId: fleet.id } }),
      this.syncJobs.count({ where: { status: SyncStatus.FAILED } }),
    ]);
    const services = await this.serviceCounts(driverIds, vehicleIds);
    const serviceIds = [
      ...services.ids.rides,
      ...services.ids.deliveries,
      ...services.ids.touristVehicles,
      ...services.ids.ambulances,
      ...services.ids.carRentals,
    ];
    let grossPaid = 0;
    if (serviceIds.length) {
      const result = await this.payments
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)', 'total')
        .where('payment.serviceId IN (:...serviceIds)', { serviceIds })
        .andWhere('payment.status = :status', { status: 'PAID' })
        .getRawOne<{ total: string | number }>();
      grossPaid = Number(result?.total ?? 0);
    }
    return {
      fleet,
      assets: {
        vehicles: { total: fleetVehicleLinks.length, active: activeVehicleCount },
        drivers: { total: fleetDriverLinks.length, active: activeDriverCount },
      },
      assignments: { planned: plannedAssignments, active: activeAssignments },
      maintenance: { open: openMaintenance },
      schoolIntegration: { connections: schoolConnections, failedSyncJobs: recentSyncFailures },
      services: services.counts,
      finance: { grossPaid, currency: 'UGX' },
      generatedAt: new Date(),
    };
  }

  async linkVehicle(user: AuthUser, organizationId: string, dto: LinkFleetVehicleDto) {
    const fleet = await this.manageFleet(user, organizationId);
    const vehicle = await this.vehicles.findOne({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (await this.fleetVehicles.findOne({ where: { fleetId: fleet.id, vehicleId: vehicle.id } })) {
      throw new ConflictException('Vehicle is already linked to this fleet');
    }
    const capabilities = dto.serviceCapabilities ?? vehicle.serviceCapabilities ?? [];
    this.assertFleetCapabilities(fleet, capabilities);
    const link = await this.fleetVehicles.save(
      this.fleetVehicles.create({
        ...dto,
        fleetId: fleet.id,
        vehicleId: vehicle.id,
        status: dto.status ?? FleetAssetStatus.PENDING,
        ownershipType: dto.ownershipType ?? 'OWNED',
        serviceCapabilities: capabilities,
        activatedAt: dto.status === FleetAssetStatus.ACTIVE ? new Date() : undefined,
      }),
    );
    this.events.emit('fleet.asset.updated', {
      fleetId: fleet.id,
      type: 'VEHICLE',
      assetId: vehicle.id,
      data: link,
    });
    return { link, vehicle };
  }

  async listVehicles(user: AuthUser, organizationId: string, query: FleetListQueryDto) {
    const fleet = await this.accessFleet(user, organizationId);
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const builder = this.fleetVehicles
      .createQueryBuilder('fleetVehicle')
      .where('fleetVehicle.fleetId = :fleetId', { fleetId: fleet.id });
    if (query.status) {
      builder.andWhere('fleetVehicle.status = :status', { status: query.status });
    } else {
      builder.andWhere('fleetVehicle.status != :removedStatus', {
        removedStatus: FleetAssetStatus.REMOVED,
      });
    }
    const [links, total] = await builder
      .orderBy('fleetVehicle.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const vehicles = links.length
      ? await this.vehicles.find({ where: { id: In(links.map((item) => item.vehicleId)) } })
      : [];
    const vehicleById = new Map(vehicles.map((item) => [item.id, item]));
    let items = links.map((link) => ({ ...link, vehicle: vehicleById.get(link.vehicleId) }));
    if (query.serviceType)
      items = items.filter((item) => item.serviceCapabilities?.includes(query.serviceType!));
    if (query.search) {
      const search = query.search.toLowerCase();
      items = items.filter((item) => {
        const vehicle = item.vehicle;
        return [vehicle?.make, vehicle?.model, vehicle?.plateNumber, item.externalId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      });
    }
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async updateVehicle(user: AuthUser, organizationId: string, linkId: string, dto: UpdateFleetVehicleDto) {
    const fleet = await this.manageFleet(user, organizationId);
    const link = await this.fleetVehicles.findOne({ where: { id: linkId, fleetId: fleet.id } });
    if (!link) throw new NotFoundException('Fleet vehicle not found');
    if (dto.serviceCapabilities) this.assertFleetCapabilities(fleet, dto.serviceCapabilities);
    Object.assign(link, dto);
    if (dto.status === FleetAssetStatus.ACTIVE && !link.activatedAt) link.activatedAt = new Date();
    return this.fleetVehicles.save(link);
  }

  async removeVehicle(user: AuthUser, organizationId: string, linkId: string) {
    const fleet = await this.manageFleet(user, organizationId);
    const link = await this.fleetVehicles.findOne({ where: { id: linkId, fleetId: fleet.id } });
    if (!link) throw new NotFoundException('Fleet vehicle not found');
    link.status = FleetAssetStatus.REMOVED;
    await this.fleetVehicles.save(link);
    return { removed: true };
  }

  async linkDriver(user: AuthUser, organizationId: string, dto: LinkFleetDriverDto) {
    const fleet = await this.manageFleet(user, organizationId);
    const driver = await this.drivers.findOne({ where: { id: dto.driverId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    if (await this.fleetDrivers.findOne({ where: { fleetId: fleet.id, driverId: driver.id } })) {
      throw new ConflictException('Driver is already linked to this fleet');
    }
    const capabilities = dto.serviceCapabilities ?? driver.serviceCapabilities ?? [];
    this.assertFleetCapabilities(fleet, capabilities);
    const link = await this.fleetDrivers.save(
      this.fleetDrivers.create({
        ...dto,
        fleetId: fleet.id,
        driverId: driver.id,
        status: dto.status ?? FleetAssetStatus.PENDING,
        engagementType: dto.engagementType ?? 'CONTRACTOR',
        serviceCapabilities: capabilities,
        joinedAt: new Date(),
      }),
    );
    this.events.emit('fleet.asset.updated', {
      fleetId: fleet.id,
      type: 'DRIVER',
      assetId: driver.id,
      data: link,
    });
    return { link, driver, user: await this.users.findOne({ where: { id: driver.userId } }) };
  }

  async listDrivers(user: AuthUser, organizationId: string, query: FleetListQueryDto) {
    const fleet = await this.accessFleet(user, organizationId);
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const builder = this.fleetDrivers
      .createQueryBuilder('fleetDriver')
      .where('fleetDriver.fleetId = :fleetId', { fleetId: fleet.id });
    if (query.status) {
      builder.andWhere('fleetDriver.status = :status', { status: query.status });
    } else {
      builder.andWhere('fleetDriver.status != :removedStatus', {
        removedStatus: FleetAssetStatus.REMOVED,
      });
    }
    const [links, total] = await builder
      .orderBy('fleetDriver.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const drivers = links.length
      ? await this.drivers.find({ where: { id: In(links.map((item) => item.driverId)) } })
      : [];
    const users = drivers.length
      ? await this.users.find({ where: { id: In(drivers.map((item) => item.userId)) } })
      : [];
    const driverById = new Map(drivers.map((item) => [item.id, item]));
    const userById = new Map(users.map((item) => [item.id, item]));
    let items = links.map((link) => {
      const driver = driverById.get(link.driverId);
      return { ...link, driver, user: driver ? userById.get(driver.userId) : undefined };
    });
    if (query.serviceType)
      items = items.filter((item) => item.serviceCapabilities?.includes(query.serviceType!));
    if (query.search) {
      const search = query.search.toLowerCase();
      items = items.filter((item) =>
        [item.user?.firstName, item.user?.lastName, item.user?.email, item.user?.phone, item.externalId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      );
    }
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async updateDriver(user: AuthUser, organizationId: string, linkId: string, dto: UpdateFleetDriverDto) {
    const fleet = await this.manageFleet(user, organizationId);
    const link = await this.fleetDrivers.findOne({ where: { id: linkId, fleetId: fleet.id } });
    if (!link) throw new NotFoundException('Fleet driver not found');
    if (dto.serviceCapabilities) this.assertFleetCapabilities(fleet, dto.serviceCapabilities);
    Object.assign(link, dto);
    return this.fleetDrivers.save(link);
  }

  async removeDriver(user: AuthUser, organizationId: string, linkId: string) {
    const fleet = await this.manageFleet(user, organizationId);
    const link = await this.fleetDrivers.findOne({ where: { id: linkId, fleetId: fleet.id } });
    if (!link) throw new NotFoundException('Fleet driver not found');
    link.status = FleetAssetStatus.REMOVED;
    await this.fleetDrivers.save(link);
    return { removed: true };
  }

  async createAssignment(user: AuthUser, organizationId: string, dto: CreateFleetAssignmentDto) {
    const fleet = await this.manageFleet(user, organizationId);
    if (!dto.driverId && !dto.vehicleId) throw new BadRequestException('Driver or vehicle is required');
    await this.validateAssets(fleet.id, dto.driverId, dto.vehicleId, dto.serviceType);
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : undefined;
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('Assignment end must be after start');
    const assignment = await this.assignments.save(
      this.assignments.create({
        ...dto,
        fleetId: fleet.id,
        startsAt,
        endsAt,
        status:
          startsAt <= new Date() && (!endsAt || endsAt > new Date())
            ? FleetAssignmentStatus.ACTIVE
            : FleetAssignmentStatus.PLANNED,
        assignedByUserId: user.id,
      }),
    );
    this.events.emit('fleet.assignment.updated', { fleetId: fleet.id, assignment });
    return assignment;
  }

  async listAssignments(user: AuthUser, organizationId: string, status?: FleetAssignmentStatus) {
    const fleet = await this.accessFleet(user, organizationId);
    return this.assignments.find({
      where: { fleetId: fleet.id, ...(status ? { status } : {}) },
      order: { startsAt: 'DESC' },
    });
  }

  async updateAssignment(
    user: AuthUser,
    organizationId: string,
    assignmentId: string,
    dto: UpdateFleetAssignmentDto,
  ) {
    const fleet = await this.manageFleet(user, organizationId);
    const assignment = await this.assignments.findOne({ where: { id: assignmentId, fleetId: fleet.id } });
    if (!assignment) throw new NotFoundException('Fleet assignment not found');
    await this.validateAssets(
      fleet.id,
      dto.driverId ?? assignment.driverId,
      dto.vehicleId ?? assignment.vehicleId,
      assignment.serviceType,
    );
    Object.assign(assignment, dto, {
      startsAt: dto.startsAt ? new Date(dto.startsAt) : assignment.startsAt,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : assignment.endsAt,
    });
    return this.assignments.save(assignment);
  }

  async createMaintenance(user: AuthUser, organizationId: string, dto: CreateMaintenanceRecordDto) {
    const fleet = await this.manageFleet(user, organizationId);
    const link = await this.fleetVehicles.findOne({ where: { fleetId: fleet.id, vehicleId: dto.vehicleId } });
    if (!link || link.status === FleetAssetStatus.REMOVED)
      throw new NotFoundException('Vehicle is not in this fleet');
    return this.maintenance.save(
      this.maintenance.create({
        ...dto,
        fleetId: fleet.id,
        scheduledAt: new Date(dto.scheduledAt),
        currency: dto.currency ?? 'UGX',
        status: MaintenanceStatus.SCHEDULED,
      }),
    );
  }

  async listMaintenance(user: AuthUser, organizationId: string, status?: MaintenanceStatus) {
    const fleet = await this.accessFleet(user, organizationId);
    return this.maintenance.find({
      where: { fleetId: fleet.id, ...(status ? { status } : {}) },
      order: { scheduledAt: 'DESC' },
    });
  }

  async updateMaintenance(
    user: AuthUser,
    organizationId: string,
    recordId: string,
    dto: UpdateMaintenanceRecordDto,
  ) {
    const fleet = await this.manageFleet(user, organizationId);
    const record = await this.maintenance.findOne({ where: { id: recordId, fleetId: fleet.id } });
    if (!record) throw new NotFoundException('Maintenance record not found');
    Object.assign(record, dto, {
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : record.scheduledAt,
      completedAt: dto.completedAt
        ? new Date(dto.completedAt)
        : dto.status === MaintenanceStatus.COMPLETED
          ? new Date()
          : record.completedAt,
    });
    return this.maintenance.save(record);
  }

  async compliance(user: AuthUser, organizationId: string) {
    const fleet = await this.accessFleet(user, organizationId);
    const vehicleLinks = await this.fleetVehicles.find({ where: { fleetId: fleet.id } });
    const driverLinks = await this.fleetDrivers.find({ where: { fleetId: fleet.id } });
    const vehicles = vehicleLinks.length
      ? await this.vehicles.find({ where: { id: In(vehicleLinks.map((item) => item.vehicleId)) } })
      : [];
    const drivers = driverLinks.length
      ? await this.drivers.find({ where: { id: In(driverLinks.map((item) => item.driverId)) } })
      : [];
    const alerts = [
      ...vehicles
        .filter((item) => item.status !== VehicleStatus.ACTIVE)
        .map((item) => ({
          severity: 'HIGH',
          type: 'VEHICLE_STATUS',
          assetId: item.id,
          message: `${item.plateNumber} is ${item.status}`,
        })),
      ...drivers
        .filter((item) => item.verificationStatus !== DriverVerificationStatus.VERIFIED)
        .map((item) => ({
          severity: 'HIGH',
          type: 'DRIVER_VERIFICATION',
          assetId: item.id,
          message: `Driver verification is ${item.verificationStatus}`,
        })),
      ...(await this.maintenance.find({ where: { fleetId: fleet.id, status: MaintenanceStatus.SCHEDULED } }))
        .filter((item) => item.scheduledAt < new Date())
        .map((item) => ({
          severity: 'MEDIUM',
          type: 'MAINTENANCE_OVERDUE',
          assetId: item.vehicleId,
          message: item.title,
        })),
    ];
    return {
      alerts,
      summary: { total: alerts.length, high: alerts.filter((item) => item.severity === 'HIGH').length },
    };
  }

  async createSchoolConnection(user: AuthUser, organizationId: string, dto: CreateSchoolConnectionDto) {
    const fleet = await this.manageFleet(user, organizationId);
    if (!fleet.schoolShuttleEnabled && !fleet.serviceCapabilities?.includes(ServiceType.SCHOOL_SHUTTLE)) {
      throw new ForbiddenException('Enable SCHOOL_SHUTTLE on this fleet before connecting a school');
    }
    if (await this.connections.findOne({ where: { fleetId: fleet.id, schoolId: dto.schoolId } })) {
      throw new ConflictException('This school is already connected to the fleet');
    }
    return this.connections.save(
      this.connections.create({
        ...dto,
        fleetId: fleet.id,
        syncDirection: dto.syncDirection ?? SyncDirection.BIDIRECTIONAL,
        status: dto.baseUrl ? IntegrationStatus.CONNECTED : IntegrationStatus.DISCONNECTED,
        credentialsEncrypted:
          dto.apiKey || dto.webhookSecret
            ? encryptSecret({ apiKey: dto.apiKey, webhookSecret: dto.webhookSecret })
            : undefined,
        config: { ...(dto.config ?? {}), localSandbox: !dto.baseUrl },
      }),
    );
  }

  async listSchoolConnections(user: AuthUser, organizationId: string) {
    const fleet = await this.accessFleet(user, organizationId);
    return this.connections.find({ where: { fleetId: fleet.id }, order: { createdAt: 'DESC' } });
  }

  async updateSchoolConnection(
    user: AuthUser,
    organizationId: string,
    connectionId: string,
    dto: UpdateSchoolConnectionDto,
  ) {
    const fleet = await this.manageFleet(user, organizationId);
    const connection = await this.connections.findOne({ where: { id: connectionId, fleetId: fleet.id } });
    if (!connection) throw new NotFoundException('School fleet connection not found');
    const currentSecrets = await this.connectionSecrets(connectionId);
    Object.assign(connection, dto);
    if (dto.apiKey !== undefined || dto.webhookSecret !== undefined) {
      connection.credentialsEncrypted = encryptSecret({
        apiKey: dto.apiKey ?? currentSecrets.apiKey,
        webhookSecret: dto.webhookSecret ?? currentSecrets.webhookSecret,
      });
    }
    if (dto.baseUrl !== undefined)
      connection.status = dto.baseUrl ? IntegrationStatus.CONNECTED : IntegrationStatus.DISCONNECTED;
    return this.connections.save(connection);
  }

  async testSchoolConnection(user: AuthUser, organizationId: string, connectionId: string) {
    const fleet = await this.accessFleet(user, organizationId);
    const connection = await this.connections.findOne({ where: { id: connectionId, fleetId: fleet.id } });
    if (!connection) throw new NotFoundException('School fleet connection not found');
    if (!connection.baseUrl) {
      connection.status = IntegrationStatus.CONNECTED;
      connection.lastError = undefined;
      await this.connections.save(connection);
      return { connected: true, mode: 'LOCAL_SANDBOX' };
    }
    try {
      const secrets = await this.connectionSecrets(connection.id);
      const response = await fetch(`${connection.baseUrl.replace(/\/$/, '')}/health`, {
        headers: secrets.apiKey ? { Authorization: `Bearer ${stringValue(secrets.apiKey)}` } : undefined,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`School backend returned HTTP ${response.status}`);
      connection.status = IntegrationStatus.CONNECTED;
      connection.lastError = undefined;
      await this.connections.save(connection);
      return { connected: true, mode: 'REMOTE', status: response.status };
    } catch (error) {
      connection.status = IntegrationStatus.ERROR;
      connection.lastError = error instanceof Error ? error.message : String(error);
      await this.connections.save(connection);
      return { connected: false, error: connection.lastError };
    }
  }

  async runSchoolSync(user: AuthUser, organizationId: string, connectionId: string, dto: RunSchoolSyncDto) {
    const fleet = await this.manageFleet(user, organizationId);
    const connection = await this.connections.findOne({ where: { id: connectionId, fleetId: fleet.id } });
    if (!connection) throw new NotFoundException('School fleet connection not found');
    const direction = dto.direction ?? connection.syncDirection;
    const job = await this.syncJobs.save(
      this.syncJobs.create({
        connectionId,
        direction,
        status: SyncStatus.PROCESSING,
        resourceType: dto.resourceType,
        requestedByUserId: user.id,
        correlationId: randomUUID(),
        startedAt: new Date(),
      }),
    );
    try {
      let resources = dto.resources ?? [];
      if (!resources.length && direction !== SyncDirection.OUTBOUND && connection.baseUrl) {
        resources = await this.fetchSchoolResources(connection, dto.resourceType);
      }
      if (direction !== SyncDirection.OUTBOUND) {
        const result = await this.upsertSchoolResources(connection, fleet, resources);
        job.processedCount += result.processed;
        job.failedCount += result.failed;
      }
      if (direction !== SyncDirection.INBOUND) {
        const outbound = await this.outboundFleetPayload(fleet, dto.resourceType);
        await this.pushSchoolResources(connection, outbound);
        job.processedCount += outbound.length;
      }
      job.status = job.failedCount ? SyncStatus.PARTIAL : SyncStatus.SUCCEEDED;
      job.completedAt = new Date();
      job.summary = {
        direction,
        resourceType: dto.resourceType,
        processed: job.processedCount,
        failed: job.failedCount,
      };
      connection.status = IntegrationStatus.CONNECTED;
      connection.lastSyncedAt = new Date();
      connection.lastError = undefined;
      await this.connections.save(connection);
      return this.syncJobs.save(job);
    } catch (error) {
      job.status = SyncStatus.FAILED;
      job.error = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date();
      connection.status = IntegrationStatus.ERROR;
      connection.lastError = job.error;
      await this.connections.save(connection);
      await this.syncJobs.save(job);
      throw new BadRequestException(`School fleet synchronization failed: ${job.error}`);
    }
  }

  async schoolResourcesList(
    user: AuthUser,
    organizationId: string,
    connectionId: string,
    resourceType?: string,
  ) {
    const fleet = await this.accessFleet(user, organizationId);
    const connection = await this.connections.findOne({ where: { id: connectionId, fleetId: fleet.id } });
    if (!connection) throw new NotFoundException('School fleet connection not found');
    return this.schoolResources.find({
      where: { connectionId, ...(resourceType ? { resourceType } : {}) },
      order: { updatedAt: 'DESC' },
    });
  }

  async schoolSyncJobs(user: AuthUser, organizationId: string, connectionId: string) {
    const fleet = await this.accessFleet(user, organizationId);
    const connection = await this.connections.findOne({ where: { id: connectionId, fleetId: fleet.id } });
    if (!connection) throw new NotFoundException('School fleet connection not found');
    return this.syncJobs.find({ where: { connectionId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  async receiveSchoolWebhook(
    connectionId: string,
    rawBody: string,
    signature: string | undefined,
    payload: RunSchoolSyncDto,
  ) {
    const connection = await this.connections
      .createQueryBuilder('connection')
      .addSelect('connection.credentialsEncrypted')
      .where('connection.id = :connectionId', { connectionId })
      .getOne();
    if (!connection) throw new NotFoundException('School fleet connection not found');
    const secrets = decryptSecret(connection.credentialsEncrypted);
    const secret = stringValue(
      secrets.webhookSecret,
      getRequiredSecret('SCHOOL_WEBHOOK_SECRET', process.env.SCHOOL_WEBHOOK_SECRET, process.env.NODE_ENV, {
        allowLocalFallback: true,
        localFallback: 'evzone-school-local-secret',
      }),
    );
    if (!verifyPayloadSignature(rawBody, signature, secret))
      throw new ForbiddenException('Invalid school webhook signature');
    const fleet = await this.fleets.findOne({ where: { id: connection.fleetId } });
    if (!fleet) throw new NotFoundException('Fleet profile not found');
    const resources = payload.resources ?? [];
    const job = await this.syncJobs.save(
      this.syncJobs.create({
        connectionId,
        direction: SyncDirection.INBOUND,
        status: SyncStatus.PROCESSING,
        resourceType: payload.resourceType,
        correlationId: randomUUID(),
        startedAt: new Date(),
      }),
    );
    const result = await this.upsertSchoolResources(connection, fleet, resources);
    job.processedCount = result.processed;
    job.failedCount = result.failed;
    job.status = result.failed ? SyncStatus.PARTIAL : SyncStatus.SUCCEEDED;
    job.completedAt = new Date();
    connection.lastSyncedAt = new Date();
    connection.status = IntegrationStatus.CONNECTED;
    await this.connections.save(connection);
    await this.syncJobs.save(job);
    return { accepted: true, jobId: job.id, ...result };
  }

  async adminList(page = 1, limit = 20) {
    const [items, total] = await this.fleets.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async adminSetStatus(admin: AuthUser, fleetId: string, status: OrganizationStatus, reason?: string) {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException('Administrator access required');
    const fleet = await this.fleets.findOne({ where: { id: fleetId } });
    if (!fleet) throw new NotFoundException('Fleet profile not found');
    fleet.status = status;
    const organization = await this.organizationRepository.findOne({ where: { id: fleet.organizationId } });
    if (organization) {
      organization.status = status;
      organization.settings = { ...(organization.settings ?? {}), fleetReviewReason: reason };
      if (status === OrganizationStatus.ACTIVE) {
        organization.approvedAt = new Date();
        organization.approvedByUserId = admin.id;
      }
      await this.organizationRepository.save(organization);
    }
    return this.fleets.save(fleet);
  }

  private async accessFleet(user: AuthUser, organizationId: string) {
    await this.organizations.assertAccess(user, organizationId);
    return this.getFleetByOrganization(organizationId);
  }

  private async manageFleet(user: AuthUser, organizationId: string) {
    await this.organizations.assertAccess(user, organizationId, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
      OrganizationMemberRole.FLEET_MANAGER,
      OrganizationMemberRole.DISPATCH_MANAGER,
    ]);
    const fleet = await this.getFleetByOrganization(organizationId);
    if (fleet.status === OrganizationStatus.SUSPENDED || fleet.status === OrganizationStatus.CLOSED) {
      throw new ForbiddenException(`Fleet is ${fleet.status.toLowerCase()}`);
    }
    return fleet;
  }

  private async getFleetByOrganization(organizationId: string) {
    const fleet = await this.fleets.findOne({ where: { organizationId } });
    if (!fleet) throw new NotFoundException('Fleet profile not found for this organization');
    return fleet;
  }

  private assertFleetCapabilities(fleet: FleetProfile, capabilities: ServiceType[]) {
    const allowed = new Set(fleet.serviceCapabilities ?? []);
    const unsupported = capabilities.filter((item) => !allowed.has(item));
    if (unsupported.length)
      throw new BadRequestException(`Fleet does not support: ${unsupported.join(', ')}`);
  }

  private async validateAssets(
    fleetId: string,
    driverId: string | undefined,
    vehicleId: string | undefined,
    serviceType: ServiceType,
  ) {
    if (driverId) {
      const link = await this.fleetDrivers.findOne({ where: { fleetId, driverId } });
      if (!link || link.status !== FleetAssetStatus.ACTIVE)
        throw new BadRequestException('Driver is not active in this fleet');
      if (!link.serviceCapabilities?.includes(serviceType))
        throw new BadRequestException('Driver lacks the requested service capability');
    }
    if (vehicleId) {
      const link = await this.fleetVehicles.findOne({ where: { fleetId, vehicleId } });
      if (!link || link.status !== FleetAssetStatus.ACTIVE)
        throw new BadRequestException('Vehicle is not active in this fleet');
      if (!link.serviceCapabilities?.includes(serviceType))
        throw new BadRequestException('Vehicle lacks the requested service capability');
    }
  }

  private async serviceCounts(driverIds: string[], vehicleIds: string[]) {
    const empty = {
      rides: [] as string[],
      deliveries: [] as string[],
      touristVehicles: [] as string[],
      ambulances: [] as string[],
      carRentals: [] as string[],
    };
    if (!driverIds.length && !vehicleIds.length)
      return {
        counts: { rides: 0, deliveries: 0, touristVehicles: 0, ambulances: 0, carRentals: 0, active: 0 },
        ids: empty,
      };
    const [rides, deliveries, tourist, ambulances, rentals] = await Promise.all([
      this.rides.find({
        where: [
          ...(driverIds.length ? [{ driverId: In(driverIds) }] : []),
          ...(vehicleIds.length ? [{ vehicleId: In(vehicleIds) }] : []),
        ],
      }),
      this.deliveries.find({
        where: [
          ...(driverIds.length ? [{ driverId: In(driverIds) }] : []),
          ...(vehicleIds.length ? [{ vehicleId: In(vehicleIds) }] : []),
        ],
      }),
      this.tourist.find({
        where: [
          ...(driverIds.length ? [{ driverId: In(driverIds) }] : []),
          ...(vehicleIds.length ? [{ vehicleId: In(vehicleIds) }] : []),
        ],
      }),
      this.ambulances.find({
        where: [
          ...(driverIds.length ? [{ driverId: In(driverIds) }] : []),
          ...(vehicleIds.length ? [{ vehicleId: In(vehicleIds) }] : []),
        ],
      }),
      this.rentals.find({ where: vehicleIds.length ? { vehicleId: In(vehicleIds) } : { id: In([]) } }),
    ]);
    const active =
      rides.filter(
        (item) =>
          ![
            BookingStatus.COMPLETED,
            BookingStatus.CANCELLED,
            BookingStatus.REJECTED,
            BookingStatus.EXPIRED,
            BookingStatus.NO_SHOW,
          ].includes(item.status),
      ).length +
      deliveries.filter(
        (item) =>
          ![DeliveryStatus.COMPLETED, DeliveryStatus.CANCELLED, DeliveryStatus.REJECTED].includes(
            item.status,
          ),
      ).length +
      tourist.filter(
        (item) =>
          ![BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.REJECTED].includes(item.status),
      ).length +
      ambulances.filter(
        (item) =>
          ![BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.REJECTED].includes(item.status),
      ).length +
      rentals.filter(
        (item) =>
          ![RentalStatus.COMPLETED, RentalStatus.CANCELLED, RentalStatus.REJECTED].includes(item.status),
      ).length;
    return {
      counts: {
        rides: rides.length,
        deliveries: deliveries.length,
        touristVehicles: tourist.length,
        ambulances: ambulances.length,
        carRentals: rentals.length,
        active,
      },
      ids: {
        rides: rides.map((item) => item.id),
        deliveries: deliveries.map((item) => item.id),
        touristVehicles: tourist.map((item) => item.id),
        ambulances: ambulances.map((item) => item.id),
        carRentals: rentals.map((item) => item.id),
      },
    };
  }

  private async connectionSecrets(connectionId: string) {
    const connection = await this.connections
      .createQueryBuilder('connection')
      .addSelect('connection.credentialsEncrypted')
      .where('connection.id = :connectionId', { connectionId })
      .getOne();
    return decryptSecret(connection?.credentialsEncrypted);
  }

  private async fetchSchoolResources(
    connection: SchoolFleetConnection,
    resourceType?: string,
  ): Promise<SchoolResourceDto[]> {
    if (!connection.baseUrl) return [];
    const secrets = await this.connectionSecrets(connection.id);
    const url = new URL(`${connection.baseUrl.replace(/\/$/, '')}/api/fleet/resources`);
    if (resourceType) url.searchParams.set('resourceType', resourceType);
    const response = await fetch(url, {
      headers: secrets.apiKey ? { Authorization: `Bearer ${stringValue(secrets.apiKey)}` } : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`School resource fetch failed with HTTP ${response.status}`);
    const body = (await response.json()) as { resources?: SchoolResourceDto[] } | SchoolResourceDto[];
    return Array.isArray(body) ? body : (body.resources ?? []);
  }

  private async pushSchoolResources(connection: SchoolFleetConnection, resources: SchoolResourceDto[]) {
    if (!connection.baseUrl) return { delivered: true, mode: 'LOCAL_SANDBOX' };
    const secrets = await this.connectionSecrets(connection.id);
    const response = await fetch(`${connection.baseUrl.replace(/\/$/, '')}/api/fleet/resources/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secrets.apiKey ? { Authorization: `Bearer ${stringValue(secrets.apiKey)}` } : {}),
      },
      body: JSON.stringify({ resources }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`School resource push failed with HTTP ${response.status}`);
    return { delivered: true, mode: 'REMOTE' };
  }

  private async outboundFleetPayload(
    fleet: FleetProfile,
    resourceType?: string,
  ): Promise<SchoolResourceDto[]> {
    const resources: SchoolResourceDto[] = [];
    if (!resourceType || resourceType.toUpperCase() === 'VEHICLE') {
      const links = await this.fleetVehicles.find({ where: { fleetId: fleet.id, schoolManaged: true } });
      const vehicles = links.length
        ? await this.vehicles.find({ where: { id: In(links.map((item) => item.vehicleId)) } })
        : [];
      const vehicleById = new Map(vehicles.map((item) => [item.id, item]));
      for (const link of links) {
        const vehicle = vehicleById.get(link.vehicleId);
        resources.push({
          resourceType: 'VEHICLE',
          externalId: link.externalId ?? link.vehicleId,
          localEntityType: 'Vehicle',
          localEntityId: link.vehicleId,
          version: 1,
          payload: { link, vehicle },
          active: link.status === FleetAssetStatus.ACTIVE,
        });
      }
    }
    if (!resourceType || resourceType.toUpperCase() === 'DRIVER') {
      const links = await this.fleetDrivers.find({ where: { fleetId: fleet.id, schoolManaged: true } });
      const drivers = links.length
        ? await this.drivers.find({ where: { id: In(links.map((item) => item.driverId)) } })
        : [];
      const driverById = new Map(drivers.map((item) => [item.id, item]));
      for (const link of links) {
        const driver = driverById.get(link.driverId);
        resources.push({
          resourceType: 'DRIVER',
          externalId: link.externalId ?? link.driverId,
          localEntityType: 'DriverProfile',
          localEntityId: link.driverId,
          version: 1,
          payload: { link, driver },
          active: link.status === FleetAssetStatus.ACTIVE,
        });
      }
    }
    return resources;
  }

  private async upsertSchoolResources(
    connection: SchoolFleetConnection,
    fleet: FleetProfile,
    resources: SchoolResourceDto[],
  ) {
    let processed = 0;
    let failed = 0;
    for (const item of resources) {
      try {
        const checksum = createHash('sha256').update(JSON.stringify(item.payload)).digest('hex');
        let resource = await this.schoolResources.findOne({
          where: {
            connectionId: connection.id,
            resourceType: item.resourceType,
            externalId: item.externalId,
          },
        });
        if (resource?.checksum === checksum && resource.version >= (item.version ?? 1)) {
          processed += 1;
          continue;
        }
        resource = this.schoolResources.create({
          ...(resource ?? {}),
          connectionId: connection.id,
          fleetId: fleet.id,
          resourceType: item.resourceType.toUpperCase(),
          externalId: item.externalId,
          localEntityType: item.localEntityType,
          localEntityId: item.localEntityId,
          version: item.version ?? (resource?.version ?? 0) + 1,
          payload: item.payload,
          checksum,
          active: item.active ?? true,
          lastSyncedAt: new Date(),
        });
        await this.schoolResources.save(resource);
        if (item.localEntityType === 'Vehicle' && item.localEntityId) {
          let link = await this.fleetVehicles.findOne({
            where: { fleetId: fleet.id, vehicleId: item.localEntityId },
          });
          if (!link) {
            const vehicle = await this.vehicles.findOne({ where: { id: item.localEntityId } });
            if (vehicle) {
              link = this.fleetVehicles.create({
                fleetId: fleet.id,
                vehicleId: vehicle.id,
                status: item.active === false ? FleetAssetStatus.INACTIVE : FleetAssetStatus.ACTIVE,
                ownershipType: 'SCHOOL_MANAGED',
                serviceCapabilities: [ServiceType.SCHOOL_SHUTTLE],
                schoolManaged: true,
                schoolId: connection.schoolId,
                externalSource: 'SCHOOL_APP',
                externalId: item.externalId,
                activatedAt: new Date(),
              });
              await this.fleetVehicles.save(link);
            }
          }
        }
        if (item.localEntityType === 'DriverProfile' && item.localEntityId) {
          let link = await this.fleetDrivers.findOne({
            where: { fleetId: fleet.id, driverId: item.localEntityId },
          });
          if (!link) {
            const driver = await this.drivers.findOne({ where: { id: item.localEntityId } });
            if (driver) {
              link = this.fleetDrivers.create({
                fleetId: fleet.id,
                driverId: driver.id,
                status: item.active === false ? FleetAssetStatus.INACTIVE : FleetAssetStatus.ACTIVE,
                engagementType: 'SCHOOL_MANAGED',
                serviceCapabilities: [ServiceType.SCHOOL_SHUTTLE],
                schoolManaged: true,
                schoolId: connection.schoolId,
                externalSource: 'SCHOOL_APP',
                externalId: item.externalId,
                joinedAt: new Date(),
              });
              await this.fleetDrivers.save(link);
            }
          }
        }
        processed += 1;
      } catch {
        failed += 1;
      }
    }
    return { processed, failed };
  }
}
