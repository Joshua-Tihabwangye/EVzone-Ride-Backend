import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import {
  AccountStatus,
  BookingStatus,
  DeliveryStatus,
  DriverAvailabilityStatus,
  DriverVerificationStatus,
  EmergencyStatus,
  OrganizationStatus,
  PaymentStatus,
  RentalStatus,
  ServiceType,
  UserRole,
  VehicleStatus,
  VehicleType,
} from '../common/enums';
import { randomToken } from '../common/utils/security';
import {
  AmbulanceRequest,
  ApprovalRequest,
  AuditLog,
  CashoutRequest,
  DeliveryOrder,
  DispatchAssignment,
  DriverProfile,
  EmergencyIncident,
  FeatureFlag,
  ManualBooking,
  Organization,
  Payment,
  Payout,
  PlatformSetting,
  PricingRule,
  PromoCode,
  RentalBooking,
  Ride,
  RiskCase,
  ServiceConfiguration,
  ServiceZone,
  TouristBooking,
  TrainingModule,
  User,
  Vehicle,
  Wallet,
} from '../database/entities';

const ROLE_CATEGORY = 'ADMIN_PORTAL_ROLE';
const VEHICLE_CATEGORY = 'ADMIN_VEHICLE_CATEGORY';
const RIDE_PRICING_CATEGORY = 'ADMIN_RIDE_PRICING';
const DELIVERY_PRICING_CATEGORY = 'ADMIN_DELIVERY_PRICING';
const RENTAL_PRICING_CATEGORY = 'ADMIN_RENTAL_PRICING';
const AMBULANCE_PRICING_CATEGORY = 'ADMIN_AMBULANCE_PRICING';
const PROMO_METADATA_CATEGORY = 'ADMIN_PROMO_METADATA';
const ZONE_METADATA_CATEGORY = 'ADMIN_ZONE_METADATA';
const COMPANY_PAYOUT_CATEGORY = 'ADMIN_COMPANY_PAYOUT';
const EXPERIMENT_CATEGORY = 'ADMIN_EXPERIMENT';
const CONTENT_CATEGORY = 'ADMIN_CONTENT';

const DEFAULT_ADMIN_SETTINGS = {
  notifications: { email: true, push: true, sms: false, weeklyDigest: true },
  language: 'en',
  timezone: 'Africa/Kampala',
  regions: { eastAfrica: true, westAfrica: false, global: false },
  limitAssignedOnly: false,
};

type JsonRecord = Record<string, unknown>;

@Injectable()
export class AdminPortalService {
  private defaultsReady = false;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(DeliveryOrder) private readonly deliveries: Repository<DeliveryOrder>,
    @InjectRepository(TouristBooking) private readonly tours: Repository<TouristBooking>,
    @InjectRepository(AmbulanceRequest) private readonly ambulances: Repository<AmbulanceRequest>,
    @InjectRepository(RentalBooking) private readonly rentals: Repository<RentalBooking>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(PlatformSetting) private readonly settings: Repository<PlatformSetting>,
    @InjectRepository(ServiceZone) private readonly zones: Repository<ServiceZone>,
    @InjectRepository(PricingRule) private readonly pricingRules: Repository<PricingRule>,
    @InjectRepository(ServiceConfiguration)
    private readonly services: Repository<ServiceConfiguration>,
    @InjectRepository(TrainingModule) private readonly training: Repository<TrainingModule>,
    @InjectRepository(FeatureFlag) private readonly flags: Repository<FeatureFlag>,
    @InjectRepository(PromoCode) private readonly promos: Repository<PromoCode>,
    @InjectRepository(RiskCase) private readonly risks: Repository<RiskCase>,
    @InjectRepository(ApprovalRequest) private readonly approvals: Repository<ApprovalRequest>,
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(CashoutRequest) private readonly cashouts: Repository<CashoutRequest>,
    @InjectRepository(DispatchAssignment)
    private readonly dispatchAssignments: Repository<DispatchAssignment>,
    @InjectRepository(ManualBooking) private readonly manualBookings: Repository<ManualBooking>,
    @InjectRepository(EmergencyIncident) private readonly incidents: Repository<EmergencyIncident>,
    private readonly events: EventEmitter2,
  ) {}

  async ensurePortalDefaults(): Promise<void> {
    if (this.defaultsReady) return;

    const roleCount = await this.settings.count({ where: { category: ROLE_CATEGORY } });
    if (roleCount === 0) {
      const defaults = [
        {
          name: 'Super Admin',
          description: 'Full EVzone administration access',
          permissions: ['*'],
        },
        {
          name: 'Operations Admin',
          description: 'Dispatch, fleet and service operations',
          permissions: ['operations.*', 'dispatch.*', 'users.read', 'services.read'],
        },
        {
          name: 'Finance Admin',
          description: 'Payments, pricing, payouts and reporting',
          permissions: ['finance.*', 'pricing.*', 'companies.read'],
        },
        {
          name: 'Compliance Admin',
          description: 'Approvals, risk, KYC and audit management',
          permissions: ['approvals.*', 'risk.*', 'audit.read', 'users.read'],
        },
        {
          name: 'Support Admin',
          description: 'Customer and driver support access',
          permissions: ['support.*', 'users.read', 'rides.read'],
        },
      ];
      for (const role of defaults) {
        await this.createSetting(ROLE_CATEGORY, `admin.role.${randomUUID()}`, role, true);
      }
    }

    const serviceDefaults: Array<[string, string, string]> = [
      ['ride', 'Ride Hailing', 'On-demand, scheduled, shared and intercity rides'],
      ['delivery', 'Deliveries', 'Parcel, document, food and multi-stop logistics'],
      ['car_rental', 'Car Rental', 'Self-drive and chauffeur vehicle rental'],
      ['ambulance', 'Ambulance', 'Emergency and scheduled medical transport'],
      ['tourist_vehicle', 'Tourist Vehicles', 'Tours, guides and tourist transport'],
      ['school_shuttle', 'School Shuttles', 'School fleet synchronization and transport'],
    ];
    for (const [key, name, description] of serviceDefaults) {
      const existing = await this.services.findOne({ where: { key } });
      if (!existing) {
        await this.services.save(
          this.services.create({ key, name, enabled: true, configuration: { description } }),
        );
      }
    }

    const categoryCount = await this.settings.count({ where: { category: VEHICLE_CATEGORY } });
    if (categoryCount === 0) {
      const categories = [
        { name: 'Standard Car', type: 'ride', description: 'Affordable everyday rides', status: 'active' },
        { name: 'Premium Car', type: 'ride', description: 'Premium and executive rides', status: 'active' },
        {
          name: 'Motorcycle',
          type: 'delivery',
          description: 'Small and express deliveries',
          status: 'active',
        },
        {
          name: 'Cargo Van',
          type: 'delivery',
          description: 'Large parcel and cargo delivery',
          status: 'active',
        },
        { name: 'Rental Sedan', type: 'rental', description: 'Standard rental vehicle', status: 'active' },
        {
          name: 'Basic Ambulance',
          type: 'ambulance',
          description: 'Basic life support transport',
          status: 'active',
        },
      ];
      for (const category of categories) {
        await this.createSetting(VEHICLE_CATEGORY, `admin.vehicle-category.${randomUUID()}`, category, true);
      }
    }

    await this.ensureDefaultTariffs();
    this.defaultsReady = true;
  }

  async listRiders() {
    const users = await this.users.find({
      where: [{ role: UserRole.RIDER }, { role: UserRole.CUSTOMER }],
      order: { createdAt: 'DESC' },
    });
    const tripCounts = await this.countByOwner(
      this.rides,
      'riderId',
      users.map((user) => user.id),
    );
    return users.map((user) => this.mapRider(user, tripCounts.get(user.id) ?? 0));
  }

  async getRider(id: string) {
    const user = await this.findUser(id);
    const totalTrips = await this.rides.count({ where: { riderId: user.id } });
    return this.mapRider(user, totalTrips);
  }

  async createRider(input: JsonRecord) {
    const user = await this.createUser(input, UserRole.RIDER, ['rider']);
    return { userId: user.id };
  }

  async patchRider(id: string, input: JsonRecord) {
    const user = await this.findUser(id);
    await this.applyUserPatch(user, input, ['rider']);
    const totalTrips = await this.rides.count({ where: { riderId: user.id } });
    this.notify('admin.user.updated', this.mapRider(user, totalTrips));
    return this.mapRider(user, totalTrips);
  }

  async listDrivers() {
    const profiles = await this.drivers.find({ order: { createdAt: 'DESC' } });
    if (profiles.length === 0) return [];
    const users = await this.users.find({ where: { id: In(profiles.map((item) => item.userId)) } });
    const vehicles = await this.vehicles.find({
      where: [
        { assignedDriverId: In(profiles.map((item) => item.id)) },
        { ownerUserId: In(profiles.map((item) => item.userId)) },
      ],
      order: { isActive: 'DESC', createdAt: 'DESC' },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));
    return profiles
      .map((profile) => {
        const user = usersById.get(profile.userId);
        if (!user) return null;
        const vehicle = vehicles.find(
          (item) =>
            item.id === profile.currentVehicleId ||
            item.assignedDriverId === profile.id ||
            item.ownerUserId === user.id,
        );
        return this.mapDriver(profile, user, vehicle);
      })
      .filter((item) => item !== null);
  }

  async getDriver(id: string) {
    const profile = await this.drivers.findOne({ where: [{ id }, { userId: id }] });
    if (!profile) throw new NotFoundException('Driver not found');
    const user = await this.findUser(profile.userId);
    const vehicle = await this.findDriverVehicle(profile, user.id);
    return this.mapDriver(profile, user, vehicle);
  }

  async createDriver(input: JsonRecord) {
    const user = await this.createUser(input, UserRole.DRIVER, ['driver']);
    const profile = await this.drivers.save(
      this.drivers.create({
        userId: user.id,
        verificationStatus: DriverVerificationStatus.PENDING,
        availabilityStatus: DriverAvailabilityStatus.OFFLINE,
        serviceCapabilities: [ServiceType.RIDE, ServiceType.DELIVERY],
      }),
    );
    const licensePlate = this.string(input.licensePlate);
    const model = this.string(input.model);
    if (licensePlate || model) {
      const vehicle = await this.vehicles.save(
        this.vehicles.create({
          ownerUserId: user.id,
          assignedDriverId: profile.id,
          make: this.string(input.make) ?? 'EVzone',
          model: model ?? 'Vehicle',
          year: this.number(input.year, new Date().getFullYear()),
          plateNumber: licensePlate ?? `EVZ-${randomUUID().slice(0, 8).toUpperCase()}`,
          vehicleType: this.vehicleType(input.vehicleType),
          status: VehicleStatus.PENDING_VERIFICATION,
          isActive: false,
        }),
      );
      profile.currentVehicleId = vehicle.id;
      await this.drivers.save(profile);
    }
    return { driverId: profile.id };
  }

  async patchDriver(id: string, input: JsonRecord) {
    const profile = await this.drivers.findOne({ where: [{ id }, { userId: id }] });
    if (!profile) throw new NotFoundException('Driver not found');
    const user = await this.findUser(profile.userId);
    await this.applyUserPatch(user, input, ['driver']);
    if (input.rating !== undefined) profile.rating = this.number(input.rating, profile.rating);
    if (input.status !== undefined && this.string(input.status)?.toLowerCase() === 'suspended') {
      profile.verificationStatus = DriverVerificationStatus.SUSPENDED;
      profile.availabilityStatus = DriverAvailabilityStatus.OFFLINE;
    }
    await this.drivers.save(profile);
    let vehicle = await this.findDriverVehicle(profile, user.id);
    const licensePlate = this.string(input.licensePlate);
    const model = this.string(input.model);
    if (licensePlate || model || input.vehicleType !== undefined) {
      if (!vehicle) {
        vehicle = this.vehicles.create({
          ownerUserId: user.id,
          assignedDriverId: profile.id,
          make: this.string(input.make) ?? 'EVzone',
          model: model ?? 'Vehicle',
          year: new Date().getFullYear(),
          plateNumber: licensePlate ?? `EVZ-${randomUUID().slice(0, 8).toUpperCase()}`,
          vehicleType: this.vehicleType(input.vehicleType),
          status: VehicleStatus.PENDING_VERIFICATION,
        });
      } else {
        if (licensePlate) vehicle.plateNumber = licensePlate;
        if (model) vehicle.model = model;
        if (input.vehicleType !== undefined) vehicle.vehicleType = this.vehicleType(input.vehicleType);
      }
      vehicle = await this.vehicles.save(vehicle);
      profile.currentVehicleId = vehicle.id;
      await this.drivers.save(profile);
    }
    const response = this.mapDriver(profile, user, vehicle);
    this.notify('admin.user.updated', response);
    return response;
  }

  async listUsers() {
    const users = await this.users.find({ order: { createdAt: 'DESC' } });
    return users.map((user) => this.mapAdminUser(user));
  }

  async getUser(id: string) {
    return this.mapAdminUser(await this.findUser(id));
  }

  async createPlatformUser(input: JsonRecord) {
    const roles = this.stringArray(input.roles);
    const user = await this.createUser(input, this.primaryRole(roles), roles.length ? roles : ['admin']);
    return this.mapAdminUser(user);
  }

  async patchUser(id: string, input: JsonRecord) {
    const user = await this.findUser(id);
    await this.applyUserPatch(user, input, this.stringArray(input.roles));
    const response = this.mapAdminUser(user);
    this.notify('admin.user.updated', response);
    return response;
  }

  async getMyProfile(userId: string) {
    const user = await this.findUser(userId);
    const metadata = this.metadata(user);
    return {
      id: user.id,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email ?? null,
      phone: user.phone ?? null,
      department: this.string(metadata.department) ?? 'Administration',
      permissions: this.record(metadata.permissions),
    };
  }

  async patchMyProfile(userId: string, input: JsonRecord) {
    const user = await this.findUser(userId);
    if (this.string(input.firstName)) user.firstName = this.string(input.firstName) as string;
    if (this.string(input.lastName)) user.lastName = this.string(input.lastName) as string;
    const metadata = this.metadata(user);
    if (input.department !== undefined) metadata.department = this.string(input.department) ?? '';
    if (input.permissions !== undefined) metadata.permissions = this.record(input.permissions);
    user.metadata = metadata;
    await this.users.save(user);
    return this.getMyProfile(user.id);
  }

  async getMySettings(userId: string) {
    const user = await this.findUser(userId);
    const metadata = this.metadata(user);
    return this.mergeAdminSettings(metadata.adminPortalSettings);
  }

  async patchMySettings(userId: string, input: JsonRecord) {
    const user = await this.findUser(userId);
    const metadata = this.metadata(user);
    const current = this.mergeAdminSettings(metadata.adminPortalSettings);
    const notifications = this.record(input.notifications);
    const next = {
      ...current,
      ...(this.string(input.language) ? { language: this.string(input.language) } : {}),
      ...(this.string(input.timezone) ? { timezone: this.string(input.timezone) } : {}),
      notifications: { ...current.notifications, ...notifications },
    };
    metadata.adminPortalSettings = next;
    user.locale = next.language;
    user.metadata = metadata;
    await this.users.save(user);
    return next;
  }

  async patchMyRegions(userId: string, input: JsonRecord) {
    const user = await this.findUser(userId);
    const fullName = this.string(input.name);
    if (fullName) {
      const names = this.splitName(fullName);
      user.firstName = names.firstName;
      user.lastName = names.lastName;
    }
    if (this.string(input.phone)) user.phone = this.string(input.phone);
    const metadata = this.metadata(user);
    const current = this.mergeAdminSettings(metadata.adminPortalSettings);
    const next = {
      ...current,
      regions: { ...current.regions, ...this.record(input.regions) },
      limitAssignedOnly:
        typeof input.limitAssignedOnly === 'boolean' ? input.limitAssignedOnly : current.limitAssignedOnly,
    };
    metadata.adminPortalSettings = next;
    user.metadata = metadata;
    await this.users.save(user);
    return next;
  }

  async listRoles() {
    await this.ensurePortalDefaults();
    const rows = await this.settings.find({
      where: { category: ROLE_CATEGORY },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.mapRole(row));
  }

  async getRole(id: string) {
    return this.mapRole(await this.findSettingById(id, ROLE_CATEGORY, 'Admin role'));
  }

  async createRole(input: JsonRecord) {
    const name = this.requiredString(input.name, 'Role name');
    const row = await this.createSetting(
      ROLE_CATEGORY,
      `admin.role.${randomUUID()}`,
      {
        name,
        description: this.string(input.description) ?? '',
        permissions: this.stringArray(input.permissions),
      },
      false,
    );
    this.notify('admin.role.updated', this.mapRole(row));
    return { roleId: row.id };
  }

  async patchRole(id: string, input: JsonRecord) {
    const row = await this.findSettingById(id, ROLE_CATEGORY, 'Admin role');
    row.value = { ...this.record(row.value), ...input };
    await this.settings.save(row);
    const response = this.mapRole(row);
    this.notify('admin.role.updated', response);
    return response;
  }

  async listPricingZones() {
    const zones = await this.zones.find({ order: { createdAt: 'DESC' } });
    return Promise.all(zones.map((zone) => this.mapZone(zone)));
  }

  async getPricingZone(id: string) {
    const zone = await this.zones.findOne({ where: { id } });
    if (!zone) throw new NotFoundException('Pricing zone not found');
    return this.mapZone(zone);
  }

  async createPricingZone(input: JsonRecord) {
    const boundaries = this.record(input.boundaries);
    const zone = await this.zones.save(
      this.zones.create({
        name: this.requiredString(input.name, 'Zone name'),
        city: this.string(input.city),
        countryCode: this.string(input.country) ?? 'UG',
        currency: this.string(input.currency) ?? 'UGX',
        timezone: this.string(input.timezone) ?? 'Africa/Kampala',
        polygon: Object.keys(boundaries).length ? boundaries : { type: 'Polygon', coordinates: [] },
        active: this.string(input.status)?.toLowerCase() !== 'inactive',
      }),
    );
    await this.upsertNamedSetting(ZONE_METADATA_CATEGORY, `admin.zone.${zone.id}`, {
      services: input.services ?? [],
      pricingRules: input.pricingRules ?? [],
    });
    return this.mapZone(zone);
  }

  async patchPricingZone(id: string, input: JsonRecord) {
    const zone = await this.zones.findOne({ where: { id } });
    if (!zone) throw new NotFoundException('Pricing zone not found');
    if (this.string(input.name)) zone.name = this.string(input.name) as string;
    if (input.city !== undefined) zone.city = this.string(input.city);
    if (this.string(input.country)) zone.countryCode = this.string(input.country) as string;
    if (input.boundaries !== undefined) zone.polygon = this.record(input.boundaries);
    if (input.status !== undefined) zone.active = this.string(input.status)?.toLowerCase() !== 'inactive';
    await this.zones.save(zone);
    if (input.services !== undefined || input.pricingRules !== undefined) {
      const current = await this.getNamedSetting(`admin.zone.${zone.id}`);
      await this.upsertNamedSetting(ZONE_METADATA_CATEGORY, `admin.zone.${zone.id}`, {
        ...this.record(current?.value),
        ...(input.services !== undefined ? { services: input.services } : {}),
        ...(input.pricingRules !== undefined ? { pricingRules: input.pricingRules } : {}),
      });
    }
    const response = await this.mapZone(zone);
    this.notify('admin.pricing.updated', response);
    return response;
  }

  async listServices() {
    await this.ensurePortalDefaults();
    const rows = await this.services.find({ order: { key: 'ASC' } });
    return rows.map((item) => this.mapService(item));
  }

  async patchService(id: string, input: JsonRecord, userId: string) {
    const item = await this.services.findOne({ where: [{ id }, { key: id }] });
    if (!item) throw new NotFoundException('Service not found');
    if (this.string(input.name)) item.name = this.string(input.name) as string;
    if (typeof input.enabled === 'boolean') item.enabled = input.enabled;
    item.configuration = {
      ...(item.configuration ?? {}),
      ...(input.description !== undefined ? { description: this.string(input.description) ?? '' } : {}),
    };
    item.updatedByUserId = userId;
    await this.services.save(item);
    const response = this.mapService(item);
    this.notify('service.updated', response);
    this.notify('admin.service.updated', response);
    return response;
  }

  async listTrainingModules() {
    const rows = await this.training.find({ order: { sequence: 'ASC', createdAt: 'ASC' } });
    return rows.map((item) => this.mapTraining(item));
  }

  async createTrainingModule(input: JsonRecord) {
    const status = this.trainingStatus(input.status);
    const item = await this.training.save(
      this.training.create({
        code: `ADMIN-${randomUUID()}`,
        title: this.requiredString(input.title, 'Training title'),
        description: this.string(input.content) ?? '',
        sequence: await this.training.count(),
        active: status === 'published',
        quiz: {
          adminCategory: this.string(input.category) ?? 'general',
          adminStatus: status,
          adminVersion: 1,
        },
      }),
    );
    const response = this.mapTraining(item);
    this.notify('admin.training.updated', response);
    return response;
  }

  async patchTrainingModule(id: string, input: JsonRecord) {
    const item = await this.training.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Training module not found');
    if (this.string(input.title)) item.title = this.string(input.title) as string;
    if (input.content !== undefined) item.description = this.string(input.content) ?? '';
    const metadata = this.record(item.quiz);
    if (input.category !== undefined) metadata.adminCategory = this.string(input.category) ?? 'general';
    if (input.status !== undefined) {
      const status = this.trainingStatus(input.status);
      metadata.adminStatus = status;
      item.active = status === 'published';
    }
    metadata.adminVersion = this.number(metadata.adminVersion, 1) + 1;
    item.quiz = metadata;
    await this.training.save(item);
    const response = this.mapTraining(item);
    this.notify('admin.training.updated', response);
    return response;
  }

  async deleteTrainingModule(id: string) {
    const item = await this.training.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Training module not found');
    await this.training.delete(item.id);
    this.notify('admin.training.updated', { id, deleted: true });
    return { deleted: true };
  }

  async listFlags(scope?: string) {
    const rows = await this.flags.find({
      where: scope ? { scope } : undefined,
      order: { scope: 'ASC', key: 'ASC' },
    });
    return rows.map((item) => this.mapFlag(item));
  }

  async patchFlag(key: string, input: JsonRecord, userId: string) {
    const scope = this.string(input.scope) ?? 'GLOBAL';
    let item =
      (await this.flags.findOne({ where: { key, scope } })) ?? (await this.flags.findOne({ where: { key } }));
    item ??= this.flags.create({ key, scope, enabled: false });
    if (typeof input.enabled === 'boolean') item.enabled = input.enabled;
    if (this.string(input.scope)) item.scope = this.string(input.scope) as string;
    if (input.description !== undefined) item.description = this.string(input.description);
    item.updatedByUserId = userId;
    await this.flags.save(item);
    const response = this.mapFlag(item);
    this.notify('flag.changed', response);
    this.notify('admin.flag.updated', response);
    return response;
  }

  async financeAnalytics(period = 'month') {
    const start = this.periodStart(period);
    const paymentQuery = this.payments
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .addSelect('COUNT(payment.id)', 'count')
      .where('payment.status = :status', { status: PaymentStatus.PAID });
    if (start) paymentQuery.andWhere('payment.createdAt >= :start', { start });
    const paid = await paymentQuery.getRawOne<{ total: string; count: string }>();

    const payoutQuery = this.payouts
      .createQueryBuilder('payout')
      .select('COALESCE(SUM(payout.amount), 0)', 'total')
      .where('payout.status = :status', { status: PaymentStatus.PENDING });
    if (start) payoutQuery.andWhere('payout.createdAt >= :start', { start });
    const pendingPayouts = await payoutQuery.getRawOne<{ total: string }>();
    const pendingCashouts = await this.cashouts
      .createQueryBuilder('cashout')
      .select('COALESCE(SUM(cashout.amount), 0)', 'total')
      .where('cashout.status = :status', { status: 'PENDING' })
      .getRawOne<{ total: string }>();
    return {
      grossEarnings: Number(paid?.total ?? 0),
      earningsCount: Number(paid?.count ?? 0),
      payoutsPending: Number(pendingPayouts?.total ?? 0) + Number(pendingCashouts?.total ?? 0),
      currency: 'UGX',
    };
  }

  async operationsAnalytics(period = 'month') {
    const start = this.periodStart(period);
    const count = async <T extends object>(repo: Repository<T>, status?: string[]) => {
      const query = repo.createQueryBuilder('item');
      if (start) query.where('item.createdAt >= :start', { start });
      if (status?.length) {
        if (start) query.andWhere('item.status IN (:...statuses)', { statuses: status });
        else query.where('item.status IN (:...statuses)', { statuses: status });
      }
      return query.getCount();
    };
    const [rideTotal, deliveryTotal, tourTotal, ambulanceTotal, rentalTotal] = await Promise.all([
      count(this.rides),
      count(this.deliveries),
      count(this.tours),
      count(this.ambulances),
      count(this.rentals),
    ]);
    const [rideCompleted, deliveryCompleted, tourCompleted, ambulanceCompleted, rentalCompleted] =
      await Promise.all([
        count(this.rides, [BookingStatus.COMPLETED]),
        count(this.deliveries, [DeliveryStatus.COMPLETED, DeliveryStatus.DELIVERED]),
        count(this.tours, [BookingStatus.COMPLETED]),
        count(this.ambulances, [BookingStatus.COMPLETED]),
        count(this.rentals, [RentalStatus.COMPLETED]),
      ]);
    const total = rideTotal + deliveryTotal + tourTotal + ambulanceTotal + rentalTotal;
    const completed =
      rideCompleted + deliveryCompleted + tourCompleted + ambulanceCompleted + rentalCompleted;
    const [dispatchTotal, dispatchPending, driversOnline, driversTotal] = await Promise.all([
      count(this.dispatchAssignments),
      count(this.dispatchAssignments, ['PENDING', 'OFFERED']),
      this.drivers.count({ where: { availabilityStatus: DriverAvailabilityStatus.ONLINE } }),
      this.drivers.count(),
    ]);
    return {
      trips: { total, completed, active: Math.max(0, total - completed) },
      dispatches: { total: dispatchTotal, pending: dispatchPending },
      drivers: { online: driversOnline, total: driversTotal },
    };
  }

  async analyticsTimeseries(period = 'month') {
    const start = this.periodStart(period) ?? new Date(Date.now() - 30 * 86400000);
    const payments = await this.payments
      .createQueryBuilder('payment')
      .where('payment.createdAt >= :start', { start })
      .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
      .orderBy('payment.createdAt', 'ASC')
      .getMany();
    const buckets = new Map<string, { date: string; revenue: number; transactions: number }>();
    for (const payment of payments) {
      const date = payment.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(date) ?? { date, revenue: 0, transactions: 0 };
      bucket.revenue += payment.amount;
      bucket.transactions += 1;
      buckets.set(date, bucket);
    }
    return [...buckets.values()];
  }

  async listPromos() {
    const rows = await this.promos.find({ order: { createdAt: 'DESC' } });
    return Promise.all(rows.map((item) => this.mapPromo(item)));
  }

  async createPromo(input: JsonRecord) {
    const code = this.requiredString(input.code, 'Promo code').toUpperCase();
    if (await this.promos.findOne({ where: { code } }))
      throw new ConflictException('Promo code already exists');
    const item = await this.promos.save(
      this.promos.create({
        code,
        discountType: this.string(input.discountType)?.toLowerCase() === 'flat' ? 'FIXED' : 'PERCENT',
        value: this.number(input.discountValue, 0),
        active: this.string(input.status)?.toLowerCase() !== 'inactive',
      }),
    );
    if (input.description !== undefined) {
      await this.upsertNamedSetting(PROMO_METADATA_CATEGORY, `admin.promo.${item.id}`, {
        description: this.string(input.description) ?? '',
      });
    }
    const response = await this.mapPromo(item);
    this.notify('admin.promo.updated', response);
    return { promoId: item.id };
  }

  async patchPromo(id: string, input: JsonRecord) {
    const item = await this.promos.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Promotion not found');
    if (this.string(input.code)) item.code = (this.string(input.code) as string).toUpperCase();
    if (input.discountType !== undefined) {
      item.discountType = this.string(input.discountType)?.toLowerCase() === 'flat' ? 'FIXED' : 'PERCENT';
    }
    if (input.discountValue !== undefined) item.value = this.number(input.discountValue, item.value);
    if (input.status !== undefined) item.active = this.string(input.status)?.toLowerCase() !== 'inactive';
    await this.promos.save(item);
    if (input.description !== undefined) {
      await this.upsertNamedSetting(PROMO_METADATA_CATEGORY, `admin.promo.${item.id}`, {
        description: this.string(input.description) ?? '',
      });
    }
    const response = await this.mapPromo(item);
    this.notify('admin.promo.updated', response);
    return response;
  }

  async listRiskCases(status?: string, severity?: string) {
    const query = this.risks.createQueryBuilder('risk').orderBy('risk.createdAt', 'DESC');
    if (status) query.where('LOWER(risk.status) = :status', { status: status.toLowerCase() });
    if (severity) {
      if (status) query.andWhere('LOWER(risk.severity) = :severity', { severity: severity.toLowerCase() });
      else query.where('LOWER(risk.severity) = :severity', { severity: severity.toLowerCase() });
    }
    return (await query.getMany()).map((item) => this.mapRisk(item));
  }

  async getRiskCase(id: string) {
    const item = await this.risks.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Risk case not found');
    return this.mapRisk(item);
  }

  async patchRiskCase(id: string, input: JsonRecord, userId: string) {
    const item = await this.risks.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Risk case not found');
    if (input.notes !== undefined) item.notes = this.string(input.notes);
    if (input.severity !== undefined)
      item.severity = (this.string(input.severity) ?? item.severity).toUpperCase();
    if (input.status !== undefined) {
      const status = this.string(input.status)?.toUpperCase();
      item.status = status === 'UNDER_REVIEW' ? 'INVESTIGATING' : (status ?? item.status);
      if (['RESOLVED', 'DISMISSED'].includes(item.status)) {
        item.resolvedAt = new Date();
        item.resolvedByUserId = userId;
      }
    }
    await this.risks.save(item);
    const response = this.mapRisk(item);
    this.notify('risk.case.updated', response);
    this.notify('admin.risk.updated', response);
    return response;
  }

  async listRiderServices(query: { serviceType?: string; status?: string; riderId?: string }) {
    const [rentals, tours, ambulances] = await Promise.all([
      !query.serviceType || query.serviceType === 'rental'
        ? this.rentals.find({ order: { createdAt: 'DESC' } })
        : [],
      !query.serviceType || query.serviceType === 'tour'
        ? this.tours.find({ order: { createdAt: 'DESC' } })
        : [],
      !query.serviceType || query.serviceType === 'ambulance'
        ? this.ambulances.find({ order: { createdAt: 'DESC' } })
        : [],
    ]);
    const mapped = [
      ...rentals.map((item) => ({
        id: item.id,
        riderId: item.renterId,
        driverId: item.driverId,
        serviceType: 'rental' as const,
        status: String(item.status).toLowerCase(),
        payload: item,
        createdAt: item.createdAt.getTime(),
        updatedAt: item.updatedAt.getTime(),
      })),
      ...tours.map((item) => ({
        id: item.id,
        riderId: item.customerId,
        driverId: item.driverId,
        serviceType: 'tour' as const,
        status: String(item.status).toLowerCase(),
        payload: item,
        createdAt: item.createdAt.getTime(),
        updatedAt: item.updatedAt.getTime(),
      })),
      ...ambulances.map((item) => ({
        id: item.id,
        riderId: item.requesterId,
        driverId: item.driverId,
        serviceType: 'ambulance' as const,
        status: String(item.status).toLowerCase(),
        payload: item,
        createdAt: item.createdAt.getTime(),
        updatedAt: item.updatedAt.getTime(),
      })),
    ];
    return mapped
      .filter((item) => !query.riderId || item.riderId === query.riderId)
      .filter((item) => !query.status || item.status === query.status.toLowerCase())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getRiderService(id: string) {
    const items = await this.listRiderServices({});
    const item = items.find((entry) => entry.id === id);
    if (!item) throw new NotFoundException('Rider service request not found');
    return item;
  }

  async listAuditEvents() {
    const rows = await this.audits.find({ order: { createdAt: 'DESC' }, take: 1000 });
    return rows.map((item) => ({
      id: item.id,
      actorId: item.actorUserId ?? 'system',
      action: item.action,
      resource: item.entityType,
      resourceId: item.entityId ?? '',
      createdAt: item.createdAt.getTime(),
      metadata: { ...(item.metadata ?? {}), route: item.route, ipAddress: item.ipAddress },
    }));
  }

  async systemOverview() {
    const [users, riders, drivers, companies, trips, approvals, riskCases, safetyIncidents] =
      await Promise.all([
        this.users.count(),
        this.users.count({ where: [{ role: UserRole.RIDER }, { role: UserRole.CUSTOMER }] }),
        this.drivers.count(),
        this.organizations.count(),
        this.rides.count(),
        this.approvals.count({ where: { status: 'PENDING' } }),
        this.risks.count({ where: { status: In(['OPEN', 'INVESTIGATING', 'ESCALATED']) } }),
        this.incidents.count({ where: { status: EmergencyStatus.OPEN } }),
      ]);
    return {
      totals: { users, riders, drivers, companies, trips },
      queues: { approvals, riskCases, safetyIncidents },
    };
  }

  async listApprovals(status?: string, entityType?: string) {
    const query = this.approvals.createQueryBuilder('approval').orderBy('approval.createdAt', 'DESC');
    if (status) query.where('LOWER(approval.status) = :status', { status: status.toLowerCase() });
    if (entityType) {
      if (status) query.andWhere('approval.entityType = :entityType', { entityType });
      else query.where('approval.entityType = :entityType', { entityType });
    }
    return (await query.getMany()).map((item) => this.mapApproval(item));
  }

  async getApproval(id: string) {
    const item = await this.approvals.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Approval request not found');
    return this.mapApproval(item);
  }

  async patchApproval(id: string, input: JsonRecord, userId: string) {
    const item = await this.approvals.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Approval request not found');
    const decision = (this.string(input.decision) ?? this.string(input.status) ?? '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(decision)) {
      throw new BadRequestException('Approval decision must be approved or rejected');
    }
    if (item.status !== 'PENDING' && item.status !== decision) {
      throw new ConflictException('Approval request already decided');
    }
    item.status = decision;
    item.notes = this.string(input.notes) ?? item.notes;
    item.reviewedByUserId = userId;
    item.reviewedAt = new Date();
    await this.approvals.save(item);
    const response = this.mapApproval(item);
    this.notify('approval.reviewed', response);
    this.notify('approval.updated', response);
    return response;
  }

  async listCompanies() {
    const rows = await this.organizations.find({ order: { createdAt: 'DESC' } });
    return rows.map((item) => this.mapCompany(item));
  }

  async getCompany(id: string) {
    const item = await this.organizations.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Company not found');
    return this.mapCompany(item);
  }

  async patchCompany(id: string, input: JsonRecord) {
    const item = await this.organizations.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Company not found');
    if (this.string(input.companyName)) item.name = this.string(input.companyName) as string;
    if (input.contactEmail !== undefined) item.contactEmail = this.string(input.contactEmail);
    if (input.contactPhone !== undefined) item.contactPhone = this.string(input.contactPhone);
    if (input.registrationNumber !== undefined)
      item.registrationNumber = this.string(input.registrationNumber);
    if (input.taxId !== undefined) item.taxIdentificationNumber = this.string(input.taxId);
    if (input.status !== undefined) item.status = this.organizationStatus(input.status);
    if (input.verticals !== undefined)
      item.serviceCapabilities = this.verticalServices(this.record(input.verticals));
    await this.organizations.save(item);
    const response = this.mapCompany(item);
    this.notify('admin.company.updated', response);
    return response;
  }

  async getCompanyPayoutSettings(id: string) {
    await this.getCompany(id);
    const row = await this.getNamedSetting(`admin.company-payout.${id}`);
    return {
      companyId: id,
      schedule: 'weekly',
      minimumAmount: 0,
      currency: 'UGX',
      destination: null,
      enabled: true,
      ...this.record(row?.value),
    };
  }

  async patchCompanyPayoutSettings(id: string, input: JsonRecord) {
    await this.getCompany(id);
    await this.upsertNamedSetting(COMPANY_PAYOUT_CATEGORY, `admin.company-payout.${id}`, input);
    return this.getCompanyPayoutSettings(id);
  }

  async listCompanyPayouts(id: string) {
    const company = await this.organizations.findOne({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    const driverProfiles = await this.drivers.find();
    const userIds = driverProfiles.map((profile) => profile.userId);
    const members = userIds.length ? await this.users.find({ where: { id: In(userIds) } }) : [];
    const memberIds = new Set(members.map((member) => member.id));
    const rows = await this.payouts.find({ order: { createdAt: 'DESC' }, take: 500 });
    return rows.filter((row) => memberIds.has(row.driverId));
  }

  async listVehicleCategories(type?: string) {
    await this.ensurePortalDefaults();
    const rows = await this.settings.find({
      where: { category: VEHICLE_CATEGORY },
      order: { createdAt: 'ASC' },
    });
    return rows
      .map((row) => this.mapCatalog(row))
      .filter((item) => !type || this.string(item.type)?.toLowerCase() === type.toLowerCase());
  }

  createVehicleCategory(input: JsonRecord) {
    return this.createCatalog(VEHICLE_CATEGORY, 'admin.vehicle-category', input);
  }

  patchVehicleCategory(id: string, input: JsonRecord) {
    return this.patchCatalog(id, VEHICLE_CATEGORY, input);
  }

  deleteVehicleCategory(id: string) {
    return this.deleteCatalog(id, VEHICLE_CATEGORY);
  }

  listPricing(kind: string) {
    return this.listCatalog(this.pricingCategory(kind));
  }

  createPricing(kind: string, input: JsonRecord) {
    return this.createCatalog(this.pricingCategory(kind), `admin.pricing.${kind}`, input);
  }

  patchPricing(kind: string, id: string, input: JsonRecord) {
    return this.patchCatalog(id, this.pricingCategory(kind), input);
  }

  deletePricing(kind: string, id: string) {
    return this.deleteCatalog(id, this.pricingCategory(kind));
  }

  async previewFare(serviceType: string, input: JsonRecord) {
    await this.ensurePortalDefaults();
    const kind = serviceType.toLowerCase();
    const rows = await this.listCatalog(this.pricingCategory(kind));
    const requestedCategoryId = this.string(input.vehicleCategoryId);
    const requestedAmbulanceType = this.string(input.ambulanceType)?.toLowerCase();
    const tariff =
      rows.find((item) => requestedCategoryId && item.vehicleCategoryId === requestedCategoryId) ??
      rows.find(
        (item) =>
          requestedAmbulanceType && this.string(item.ambulanceType)?.toLowerCase() === requestedAmbulanceType,
      ) ??
      rows.find((item) => this.string(item.status)?.toLowerCase() !== 'inactive') ??
      rows[0] ??
      {};
    const distanceKm = Math.max(0, this.number(input.distanceKm ?? input.distance, 0));
    const durationMinutes = Math.max(0, this.number(input.durationMinutes ?? input.duration, 0));
    const baseFare = this.number(tariff.baseFare, 0);
    let distanceCharge = 0;
    let durationCharge = 0;
    let surcharge = 0;
    let subtotal = baseFare;
    let formula = 'base fare';
    let minimumFare = this.number(tariff.minimumFare, 0);

    if (kind === 'ride') {
      distanceCharge = distanceKm * this.number(tariff.ratePerKm, 0);
      durationCharge = durationMinutes * this.number(tariff.perMinuteRate, 0);
      const multiplier = Math.max(1, this.number(input.surgeMultiplier ?? tariff.surgeMultiplier, 1));
      subtotal = (baseFare + distanceCharge + durationCharge) * multiplier;
      surcharge = subtotal - (baseFare + distanceCharge + durationCharge);
      formula = '(baseFare + distance × ratePerKm + duration × perMinuteRate) × surgeMultiplier';
    } else if (kind === 'delivery') {
      distanceCharge = distanceKm * this.number(tariff.ratePerKm, 0);
      surcharge = Math.max(0, this.number(input.weightKg, 0)) * this.number(tariff.weightSurcharge, 0);
      subtotal = baseFare + distanceCharge + surcharge;
      formula = 'baseFare + distance × ratePerKm + weight × weightSurcharge';
    } else if (kind === 'rental') {
      const months = Math.max(0, this.number(input.months, 0));
      const weeks = Math.max(0, this.number(input.weeks, 0));
      const days = Math.max(0, this.number(input.days, 0));
      const hours = Math.max(0, this.number(input.hours, 0));
      subtotal =
        months * this.number(tariff.monthlyRate, 0) +
        weeks * this.number(tariff.weeklyRate, 0) +
        days * this.number(tariff.dailyRate, 0) +
        hours * this.number(tariff.hourlyRate, 0);
      minimumFare = 0;
      formula = 'months × monthlyRate + weeks × weeklyRate + days × dailyRate + hours × hourlyRate';
    } else if (kind === 'ambulance') {
      distanceCharge = distanceKm * this.number(tariff.ratePerKm, 0);
      surcharge =
        (input.isEmergency === true ? this.number(tariff.emergencySurcharge, 0) : 0) +
        (input.isNight === true ? this.number(tariff.nightSurcharge, 0) : 0);
      subtotal = baseFare + distanceCharge + surcharge;
      formula = 'baseFare + distance × ratePerKm + emergency/night surcharges';
    } else {
      throw new BadRequestException('Unsupported service type');
    }

    const total = Math.max(minimumFare, subtotal);
    return {
      baseFare: this.money(baseFare),
      distanceCharge: this.money(distanceCharge),
      durationCharge: this.money(durationCharge),
      surcharge: this.money(surcharge),
      subtotal: this.money(subtotal),
      total: this.money(total),
      minimumFare: this.money(minimumFare),
      currency: this.string(tariff.currency) ?? 'UGX',
      formula,
    };
  }

  async listExperiments() {
    const rows = await this.settings.find({
      where: { category: EXPERIMENT_CATEGORY },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.mapCatalog(row));
  }

  createExperiment(input: JsonRecord) {
    return this.createCatalog(EXPERIMENT_CATEGORY, 'admin.experiment', {
      status: 'draft',
      variants: [],
      metrics: {},
      ...input,
    });
  }

  patchExperiment(id: string, input: JsonRecord) {
    return this.patchCatalog(id, EXPERIMENT_CATEGORY, input);
  }

  async listContent(kind: string) {
    const rows = await this.settings.find({
      where: { category: CONTENT_CATEGORY },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((row) => this.mapCatalog(row)).filter((item) => item.kind === kind);
  }

  createContent(kind: string, input: JsonRecord) {
    return this.createCatalog(CONTENT_CATEGORY, `admin.content.${kind}`, { kind, ...input });
  }

  patchContent(id: string, input: JsonRecord) {
    return this.patchCatalog(id, CONTENT_CATEGORY, input);
  }

  private async ensureDefaultTariffs() {
    const categories = await this.settings.find({
      where: { category: VEHICLE_CATEGORY },
      order: { createdAt: 'ASC' },
    });
    const find = (type: string) =>
      categories.find((row) => this.string(this.record(row.value).type) === type);
    const defaults: Array<[string, string, JsonRecord]> = [
      [
        RIDE_PRICING_CATEGORY,
        'ride',
        {
          vehicleCategoryId: find('ride')?.id ?? '',
          ratePerKm: 1500,
          baseFare: 3000,
          minimumFare: 5000,
          perMinuteRate: 200,
          surgeMultiplier: 1,
          currency: 'UGX',
          status: 'active',
        },
      ],
      [
        DELIVERY_PRICING_CATEGORY,
        'delivery',
        {
          vehicleCategoryId: find('delivery')?.id ?? '',
          ratePerKm: 1200,
          baseFare: 2500,
          minimumFare: 4000,
          weightSurcharge: 500,
          currency: 'UGX',
          status: 'active',
        },
      ],
      [
        RENTAL_PRICING_CATEGORY,
        'rental',
        {
          vehicleCategoryId: find('rental')?.id ?? '',
          hourlyRate: 20000,
          dailyRate: 120000,
          weeklyRate: 700000,
          monthlyRate: 2400000,
          currency: 'UGX',
          status: 'active',
        },
      ],
      [
        AMBULANCE_PRICING_CATEGORY,
        'ambulance',
        {
          ambulanceType: 'basic',
          baseFare: 50000,
          ratePerKm: 3000,
          emergencySurcharge: 25000,
          nightSurcharge: 15000,
          currency: 'UGX',
          status: 'active',
        },
      ],
    ];
    for (const [category, keyPart, value] of defaults) {
      if ((await this.settings.count({ where: { category } })) === 0) {
        await this.createSetting(category, `admin.pricing.${keyPart}.${randomUUID()}`, value, true);
      }
    }
  }

  private async createUser(input: JsonRecord, role: UserRole, roles: string[]): Promise<User> {
    const email = this.string(input.email)?.toLowerCase();
    const phone = this.string(input.phone);
    if (!email && !phone) throw new BadRequestException('Email or phone is required');
    if (email && (await this.users.findOne({ where: { email } })))
      throw new ConflictException('Email already exists');
    if (phone && (await this.users.findOne({ where: { phone } })))
      throw new ConflictException('Phone already exists');
    const fullName = this.string(input.fullName) ?? 'EVzone User';
    const names = this.splitName(fullName);
    const password = this.string(input.password) ?? randomToken(24);
    const metadata: JsonRecord = {
      city: this.string(input.city),
      country: this.string(input.country) ?? 'UG',
      roles: roles.length ? roles : [role.toLowerCase()],
      invited: input.invite === true,
      adminPortalSettings: DEFAULT_ADMIN_SETTINGS,
    };
    const user = await this.users.save(
      this.users.create({
        email,
        phone,
        firstName: names.firstName,
        lastName: names.lastName,
        passwordHash: await bcrypt.hash(password, 12),
        role,
        status: input.invite === true ? AccountStatus.PENDING : AccountStatus.ACTIVE,
        countryCode: this.string(input.country) ?? 'UG',
        currency: this.string(input.preferredCurrency) ?? 'UGX',
        metadata,
      }),
    );
    await this.wallets.save(
      this.wallets.create({ userId: user.id, currency: user.currency, availableBalance: 0 }),
    );
    this.notify('admin.user.updated', { id: user.id, created: true });
    return user;
  }

  private async applyUserPatch(user: User, input: JsonRecord, roles: string[]) {
    const fullName = this.string(input.fullName);
    if (fullName) {
      const names = this.splitName(fullName);
      user.firstName = names.firstName;
      user.lastName = names.lastName;
    }
    if (this.string(input.firstName)) user.firstName = this.string(input.firstName) as string;
    if (this.string(input.lastName)) user.lastName = this.string(input.lastName) as string;
    if (input.email !== undefined) user.email = this.string(input.email)?.toLowerCase();
    if (input.phone !== undefined) user.phone = this.string(input.phone);
    if (input.status !== undefined) user.status = this.accountStatus(input.status);
    const metadata = this.metadata(user);
    if (input.city !== undefined) metadata.city = this.string(input.city);
    if (input.country !== undefined) metadata.country = this.string(input.country);
    if (input.regions !== undefined) metadata.regions = input.regions;
    if (input.twoFA !== undefined) metadata.twoFA = input.twoFA === true;
    if (input.avatarColor !== undefined) metadata.avatarColor = this.string(input.avatarColor);
    if (roles.length) {
      metadata.roles = roles;
      user.role = this.primaryRole(roles);
    }
    user.metadata = metadata;
    await this.users.save(user);
  }

  private mapRider(user: User, totalTrips: number) {
    const metadata = this.metadata(user);
    return {
      id: user.id,
      userId: user.id,
      riderId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      phone: user.phone,
      city: this.string(metadata.city) ?? '',
      country: this.string(metadata.country) ?? user.countryCode,
      preferredCurrency: user.currency,
      preferences: this.record(metadata.preferences),
      rating: this.number(metadata.rating, 5),
      totalTrips,
      status: this.userStatus(user.status),
      roles: this.userRoles(user),
    };
  }

  private mapDriver(profile: DriverProfile, user: User, vehicle?: Vehicle | null) {
    const metadata = this.metadata(user);
    return {
      driverId: profile.id,
      userId: user.id,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? '',
      city: this.string(metadata.city) ?? '',
      status: this.userStatus(user.status),
      vehicleType:
        vehicle?.vehicleType === VehicleType.MOTORCYCLE || vehicle?.vehicleType === VehicleType.SCOOTER
          ? 'Bike'
          : 'Car',
      totalTrips: profile.completedRides + profile.completedDeliveries,
      licensePlate: vehicle?.plateNumber,
      model: vehicle ? `${vehicle.make} ${vehicle.model}`.trim() : undefined,
      rating: profile.rating,
      roles: this.userRoles(user),
    };
  }

  private mapAdminUser(user: User) {
    const metadata = this.metadata(user);
    const settings = this.mergeAdminSettings(metadata.adminPortalSettings);
    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email ?? '',
      roles: this.userRoles(user),
      regions:
        Object.entries(settings.regions)
          .filter(([, enabled]) => enabled)
          .map(([key]) => key)
          .join(', ') || 'None',
      status: user.status === AccountStatus.ACTIVE ? 'Active' : 'Suspended',
      lastLogin: user.lastLoginAt?.getTime() ?? 0,
      twoFA: metadata.twoFA === true,
      avatarColor: this.string(metadata.avatarColor),
    };
  }

  private mapRole(row: PlatformSetting) {
    const value = this.record(row.value);
    return {
      id: row.id,
      name: this.string(value.name) ?? 'Admin Role',
      description: this.string(value.description),
      permissions: this.stringArray(value.permissions),
      createdAt: row.createdAt.getTime(),
    };
  }

  private async mapZone(zone: ServiceZone) {
    const metadata = await this.getNamedSetting(`admin.zone.${zone.id}`);
    const value = this.record(metadata?.value);
    return {
      id: zone.id,
      name: zone.name,
      city: zone.city,
      country: zone.countryCode,
      status: zone.active ? 'active' : 'inactive',
      boundaries: Object.keys(this.record(zone.polygon)).length
        ? zone.polygon
        : { type: 'Polygon', coordinates: [] },
      services: Array.isArray(value.services) ? value.services : [],
      pricingRules: value.pricingRules ?? [],
      createdAt: zone.createdAt.getTime(),
      updatedAt: zone.updatedAt.getTime(),
    };
  }

  private mapService(item: ServiceConfiguration) {
    return {
      id: item.id,
      key: item.key,
      name: item.name,
      enabled: item.enabled,
      description: this.string(item.configuration?.description),
      createdAt: item.createdAt.getTime(),
      updatedAt: item.updatedAt.getTime(),
    };
  }

  private mapTraining(item: TrainingModule) {
    const metadata = this.record(item.quiz);
    return {
      id: item.id,
      title: item.title,
      category: this.string(metadata.adminCategory) ?? 'general',
      status: this.trainingStatus(metadata.adminStatus ?? (item.active ? 'published' : 'draft')),
      content: item.description,
      version: this.number(metadata.adminVersion, 1),
      createdAt: item.createdAt.getTime(),
      updatedAt: item.updatedAt.getTime(),
    };
  }

  private mapFlag(item: FeatureFlag) {
    return {
      id: item.id,
      key: item.key,
      enabled: item.enabled,
      scope: item.scope,
      description: item.description,
      createdAt: item.createdAt.getTime(),
      updatedAt: item.updatedAt.getTime(),
    };
  }

  private async mapPromo(item: PromoCode) {
    const metadata = await this.getNamedSetting(`admin.promo.${item.id}`);
    return {
      id: item.id,
      code: item.code,
      description: this.string(this.record(metadata?.value).description),
      discountType: item.discountType === 'FIXED' ? 'flat' : 'percent',
      discountValue: item.value,
      status: item.active ? 'active' : 'inactive',
      createdAt: item.createdAt.getTime(),
      updatedAt: item.updatedAt.getTime(),
    };
  }

  private mapRisk(item: RiskCase) {
    const status = item.status === 'INVESTIGATING' ? 'under_review' : item.status.toLowerCase();
    const normalizedStatus = ['resolved', 'open', 'under_review'].includes(status) ? status : 'open';
    const severity = item.severity.charAt(0).toUpperCase() + item.severity.slice(1).toLowerCase();
    return {
      id: item.id,
      subjectId: item.subjectId,
      subjectType: item.subjectType,
      type: item.type,
      severity,
      notes: item.notes,
      createdAt: item.createdAt.getTime(),
      status: normalizedStatus,
    };
  }

  private mapApproval(item: ApprovalRequest) {
    return {
      id: item.id,
      entityId: item.entityId,
      entityType: item.entityType,
      status: item.status.toLowerCase(),
      requestedBy: item.requestedByUserId,
      reviewedBy: item.reviewedByUserId ?? null,
      notes: item.notes ?? null,
      createdAt: item.createdAt.getTime(),
      reviewedAt: item.reviewedAt?.getTime() ?? null,
    };
  }

  private mapCompany(item: Organization) {
    const capabilities = new Set(item.serviceCapabilities ?? []);
    return {
      id: item.id,
      companyName: item.name,
      contactEmail: item.contactEmail ?? '',
      contactPhone: item.contactPhone ?? '',
      registrationNumber: item.registrationNumber ?? '',
      taxId: item.taxIdentificationNumber ?? '',
      status: this.companyStatus(item.status),
      verticals: {
        ride: capabilities.has(ServiceType.RIDE),
        delivery: capabilities.has(ServiceType.DELIVERY),
        rental: capabilities.has(ServiceType.CAR_RENTAL),
        school: capabilities.has(ServiceType.SCHOOL_SHUTTLE),
        ems: capabilities.has(ServiceType.AMBULANCE),
        tours: capabilities.has(ServiceType.TOURIST_VEHICLE),
      },
      createdAt: item.createdAt.getTime(),
      updatedAt: item.updatedAt.getTime(),
    };
  }

  private async listCatalog(category: string): Promise<JsonRecord[]> {
    const rows = await this.settings.find({ where: { category }, order: { createdAt: 'ASC' } });
    const categories =
      category === RIDE_PRICING_CATEGORY ||
      category === DELIVERY_PRICING_CATEGORY ||
      category === RENTAL_PRICING_CATEGORY
        ? await this.listVehicleCategories()
        : [];
    const categoriesById = new Map(categories.map((item) => [String(item.id), item]));
    return rows.map((row) => {
      const value = this.mapCatalog(row);
      const vehicleCategoryId = this.string(value.vehicleCategoryId);
      return vehicleCategoryId ? { ...value, vehicleCategory: categoriesById.get(vehicleCategoryId) } : value;
    });
  }

  private mapCatalog(row: PlatformSetting): JsonRecord {
    return {
      id: row.id,
      ...this.record(row.value),
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  private async createCatalog(category: string, keyPrefix: string, input: JsonRecord) {
    const row = await this.createSetting(category, `${keyPrefix}.${randomUUID()}`, input, false);
    const response = this.mapCatalog(row);
    this.notify('admin.catalog.updated', { category, data: response });
    return response;
  }

  private async patchCatalog(id: string, category: string, input: JsonRecord) {
    const row = await this.findSettingById(id, category, 'Configuration item');
    row.value = { ...this.record(row.value), ...input };
    await this.settings.save(row);
    const response = this.mapCatalog(row);
    this.notify('admin.catalog.updated', { category, data: response });
    return response;
  }

  private async deleteCatalog(id: string, category: string) {
    const row = await this.findSettingById(id, category, 'Configuration item');
    await this.settings.delete(row.id);
    this.notify('admin.catalog.updated', { category, id, deleted: true });
    return { deleted: true };
  }

  private pricingCategory(kind: string) {
    const map: Record<string, string> = {
      ride: RIDE_PRICING_CATEGORY,
      rides: RIDE_PRICING_CATEGORY,
      delivery: DELIVERY_PRICING_CATEGORY,
      deliveries: DELIVERY_PRICING_CATEGORY,
      rental: RENTAL_PRICING_CATEGORY,
      rentals: RENTAL_PRICING_CATEGORY,
      ambulance: AMBULANCE_PRICING_CATEGORY,
      ambulances: AMBULANCE_PRICING_CATEGORY,
    };
    const category = map[kind.toLowerCase()];
    if (!category) throw new BadRequestException('Unsupported pricing type');
    return category;
  }

  private async createSetting(category: string, key: string, value: unknown, protectedValue: boolean) {
    return this.settings.save(this.settings.create({ key, category, value, protected: protectedValue }));
  }

  private async upsertNamedSetting(category: string, key: string, value: unknown) {
    let row = await this.settings.findOne({ where: { key } });
    row ??= this.settings.create({ key, category, value, protected: true });
    row.category = category;
    row.value = value;
    return this.settings.save(row);
  }

  private getNamedSetting(key: string) {
    return this.settings.findOne({ where: { key } });
  }

  private async findSettingById(id: string, category: string, label: string) {
    const row = await this.settings.findOne({ where: { id, category } });
    if (!row) throw new NotFoundException(`${label} not found`);
    return row;
  }

  private async findUser(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async findDriverVehicle(profile: DriverProfile, userId: string) {
    if (profile.currentVehicleId) {
      const current = await this.vehicles.findOne({ where: { id: profile.currentVehicleId } });
      if (current) return current;
    }
    return this.vehicles.findOne({
      where: [{ assignedDriverId: profile.id }, { ownerUserId: userId }],
      order: { isActive: 'DESC', createdAt: 'DESC' },
    });
  }

  private async countByOwner<T extends object>(repo: Repository<T>, field: string, ids: string[]) {
    const result = new Map<string, number>();
    if (ids.length === 0) return result;
    const rows = await repo
      .createQueryBuilder('item')
      .select(`item.${field}`, 'owner')
      .addSelect('COUNT(item.id)', 'count')
      .where(`item.${field} IN (:...ids)`, { ids })
      .groupBy(`item.${field}`)
      .getRawMany<{ owner: string; count: string }>();
    rows.forEach((row) => result.set(row.owner, Number(row.count)));
    return result;
  }

  private metadata(user: User): JsonRecord {
    return { ...(user.metadata ?? {}) };
  }

  private mergeAdminSettings(value: unknown) {
    const input = this.record(value);
    return {
      ...DEFAULT_ADMIN_SETTINGS,
      ...input,
      notifications: {
        ...DEFAULT_ADMIN_SETTINGS.notifications,
        ...this.record(input.notifications),
      },
      regions: { ...DEFAULT_ADMIN_SETTINGS.regions, ...this.record(input.regions) },
    };
  }

  private splitName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts.shift() ?? 'EVzone',
      lastName: parts.join(' ') || 'User',
    };
  }

  private userRoles(user: User) {
    const roles = this.stringArray(this.metadata(user).roles);
    return roles.length ? roles : [user.role.toLowerCase()];
  }

  private primaryRole(roles: string[]) {
    const normalized = roles.map((role) => role.toLowerCase());
    if (normalized.some((role) => role.includes('admin'))) return UserRole.ADMIN;
    if (normalized.some((role) => role.includes('dispatcher'))) return UserRole.DISPATCHER;
    if (normalized.some((role) => role.includes('support'))) return UserRole.SUPPORT;
    if (normalized.some((role) => role.includes('driver'))) return UserRole.DRIVER;
    if (normalized.some((role) => role.includes('fleet'))) return UserRole.FLEET_PARTNER;
    if (normalized.some((role) => role.includes('agent'))) return UserRole.AGENT;
    if (normalized.some((role) => role.includes('rider'))) return UserRole.RIDER;
    return UserRole.ADMIN;
  }

  private accountStatus(value: unknown) {
    const normalized = (this.string(value) ?? '').toUpperCase();
    if (normalized === 'DELETED') return AccountStatus.DELETED;
    if (normalized === 'SUSPENDED') return AccountStatus.SUSPENDED;
    if (normalized === 'PENDING') return AccountStatus.PENDING;
    return AccountStatus.ACTIVE;
  }

  private userStatus(status: AccountStatus): 'active' | 'deleted' | 'suspended' {
    if (status === AccountStatus.DELETED) return 'deleted';
    if (status === AccountStatus.SUSPENDED || status === AccountStatus.PENDING) return 'suspended';
    return 'active';
  }

  private vehicleType(value: unknown) {
    return this.string(value)?.toLowerCase() === 'bike' ? VehicleType.MOTORCYCLE : VehicleType.SEDAN;
  }

  private organizationStatus(value: unknown) {
    const normalized = (this.string(value) ?? '').toLowerCase();
    if (normalized === 'active') return OrganizationStatus.ACTIVE;
    if (normalized === 'suspended') return OrganizationStatus.SUSPENDED;
    return OrganizationStatus.CLOSED;
  }

  private companyStatus(status: OrganizationStatus): 'active' | 'suspended' | 'inactive' {
    if (status === OrganizationStatus.ACTIVE) return 'active';
    if (status === OrganizationStatus.SUSPENDED) return 'suspended';
    return 'inactive';
  }

  private verticalServices(verticals: JsonRecord) {
    const result: ServiceType[] = [];
    if (verticals.ride === true) result.push(ServiceType.RIDE);
    if (verticals.delivery === true) result.push(ServiceType.DELIVERY);
    if (verticals.rental === true) result.push(ServiceType.CAR_RENTAL);
    if (verticals.school === true) result.push(ServiceType.SCHOOL_SHUTTLE);
    if (verticals.ems === true) result.push(ServiceType.AMBULANCE);
    if (verticals.tours === true) result.push(ServiceType.TOURIST_VEHICLE);
    return result;
  }

  private trainingStatus(value: unknown): 'draft' | 'published' | 'archived' {
    const normalized = (this.string(value) ?? 'draft').toLowerCase();
    if (normalized === 'published' || normalized === 'archived') return normalized;
    return 'draft';
  }

  private periodStart(period: string): Date | null {
    const now = new Date();
    switch (period.toLowerCase()) {
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week':
        return new Date(now.getTime() - 7 * 86400000);
      case 'year':
        return new Date(now.getFullYear(), 0, 1);
      case 'month':
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  private requiredString(value: unknown, label: string) {
    const result = this.string(value);
    if (!result) throw new BadRequestException(`${label} is required`);
    return result;
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  }

  private record(value: unknown): JsonRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as JsonRecord) }
      : {};
  }

  private number(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private notify(event: string, data: unknown) {
    this.events.emit('admin.portal.event', { event, data });
  }
}
