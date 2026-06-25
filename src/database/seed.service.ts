import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import {
  AgentProfile,
  AgentRoleDefinition,
  AgentShiftPlan,
  AgentTask,
  AgentTeam,
  AgentTrainingModule,
  CorporatePayAccount,
  DispatchDesk,
  DriverProfile,
  FleetDriver,
  FleetProfile,
  FleetVehicle,
  FeatureFlag,
  MedicalFacility,
  Notification,
  Organization,
  OrganizationMember,
  PlatformSetting,
  PricingRule,
  PromoCode,
  RiderCommute,
  RentalBranch,
  RentalVehicleClass,
  SchoolFleetConnection,
  ServiceZone,
  ServiceConfiguration,
  StoredPaymentMethod,
  TourPackage,
  TrainingModule,
  User,
  UserAddress,
  Vehicle,
  Wallet,
} from './entities';
import {
  AccountStatus,
  DriverAvailabilityStatus,
  DriverVerificationStatus,
  EnergyType,
  FleetAssetStatus,
  IntegrationStatus,
  MembershipStatus,
  NotificationType,
  OrganizationMemberRole,
  OrganizationStatus,
  OrganizationType,
  ServiceType,
  SyncDirection,
  UserRole,
  VehicleStatus,
  VehicleType,
} from '../common/enums';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserAddress) private readonly addresses: Repository<UserAddress>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(ServiceZone) private readonly zones: Repository<ServiceZone>,
    @InjectRepository(PricingRule) private readonly pricing: Repository<PricingRule>,
    @InjectRepository(PromoCode) private readonly promos: Repository<PromoCode>,
    @InjectRepository(TourPackage) private readonly tours: Repository<TourPackage>,
    @InjectRepository(MedicalFacility) private readonly facilities: Repository<MedicalFacility>,
    @InjectRepository(TrainingModule) private readonly training: Repository<TrainingModule>,
    @InjectRepository(RentalBranch) private readonly rentalBranches: Repository<RentalBranch>,
    @InjectRepository(RentalVehicleClass)
    private readonly rentalVehicleClasses: Repository<RentalVehicleClass>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly organizationMembers: Repository<OrganizationMember>,
    @InjectRepository(FleetProfile) private readonly fleetProfiles: Repository<FleetProfile>,
    @InjectRepository(FleetVehicle) private readonly fleetVehicles: Repository<FleetVehicle>,
    @InjectRepository(FleetDriver) private readonly fleetDrivers: Repository<FleetDriver>,
    @InjectRepository(DispatchDesk) private readonly dispatchDesks: Repository<DispatchDesk>,
    @InjectRepository(AgentProfile) private readonly agentProfiles: Repository<AgentProfile>,
    @InjectRepository(AgentRoleDefinition)
    private readonly agentRoles: Repository<AgentRoleDefinition>,
    @InjectRepository(AgentShiftPlan) private readonly agentShifts: Repository<AgentShiftPlan>,
    @InjectRepository(AgentTask) private readonly agentTasks: Repository<AgentTask>,
    @InjectRepository(AgentTeam) private readonly agentTeams: Repository<AgentTeam>,
    @InjectRepository(AgentTrainingModule)
    private readonly agentTraining: Repository<AgentTrainingModule>,
    @InjectRepository(CorporatePayAccount)
    private readonly corporatePayAccounts: Repository<CorporatePayAccount>,
    @InjectRepository(SchoolFleetConnection)
    private readonly schoolConnections: Repository<SchoolFleetConnection>,
    @InjectRepository(PlatformSetting) private readonly platformSettings: Repository<PlatformSetting>,
    @InjectRepository(FeatureFlag) private readonly featureFlags: Repository<FeatureFlag>,
    @InjectRepository(ServiceConfiguration)
    private readonly serviceConfigurations: Repository<ServiceConfiguration>,
    @InjectRepository(RiderCommute) private readonly commutes: Repository<RiderCommute>,
    @InjectRepository(StoredPaymentMethod)
    private readonly storedPaymentMethods: Repository<StoredPaymentMethod>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!['1', 'true', 'yes'].includes((process.env.SEED_DEMO ?? 'true').toLowerCase())) return;
    try {
      await this.seed();
    } catch (error) {
      this.logger.error('Demo seed failed', error instanceof Error ? error.stack : String(error));
    }
  }

  private async seed(): Promise<void> {
    const existing = await this.users.findOne({ where: { email: 'admin@evzone.local' } });
    if (existing) return;

    const passwordHash = await bcrypt.hash('Password123!', 12);
    const makeUser = async (
      email: string,
      phone: string,
      firstName: string,
      lastName: string,
      role: UserRole,
    ) =>
      this.users.save(
        this.users.create({
          email,
          phone,
          passwordHash,
          firstName,
          lastName,
          role,
          status: AccountStatus.ACTIVE,
          isEmailVerified: true,
          isPhoneVerified: true,
        }),
      );

    const admin = await makeUser('admin@evzone.local', '+256700000001', 'EVzone', 'Admin', UserRole.ADMIN);
    const rider = await makeUser('rider@evzone.local', '+256700000002', 'Amina', 'Nabirye', UserRole.RIDER);
    const rideDriver = await makeUser(
      'driver@evzone.local',
      '+256700000003',
      'John',
      'Okello',
      UserRole.DRIVER,
    );
    const deliveryDriver = await makeUser(
      'delivery.driver@evzone.local',
      '+256700000004',
      'Steven',
      'Kato',
      UserRole.DRIVER,
    );
    const ambulanceDriver = await makeUser(
      'ambulance.driver@evzone.local',
      '+256700000005',
      'Sarah',
      'Achieng',
      UserRole.DRIVER,
    );
    const tourDriver = await makeUser(
      'tour.driver@evzone.local',
      '+256700000006',
      'Moses',
      'Tumusiime',
      UserRole.DRIVER,
    );
    const dispatcher = await makeUser(
      'dispatcher@evzone.local',
      '+256700000007',
      'Grace',
      'Nanyonga',
      UserRole.DISPATCHER,
    );
    const tourOperator = await makeUser(
      'tour.operator@evzone.local',
      '+256700000008',
      'Pearl',
      'Tours',
      UserRole.TOUR_OPERATOR,
    );
    const rentalPartner = await makeUser(
      'rental.partner@evzone.local',
      '+256700000009',
      'EVzone',
      'Rentals',
      UserRole.RENTAL_PARTNER,
    );
    const fleetPartner = await makeUser(
      'fleet.partner@evzone.local',
      '+256700000010',
      'EVzone',
      'Fleet Partner',
      UserRole.FLEET_PARTNER,
    );
    const agent = await makeUser('agent@evzone.local', '+256700000011', 'Mary', 'Agent', UserRole.AGENT);
    const schoolDriver = await makeUser(
      'school.driver@evzone.local',
      '+256700000012',
      'Peter',
      'School Driver',
      UserRole.DRIVER,
    );

    for (const user of [
      admin,
      rider,
      rideDriver,
      deliveryDriver,
      ambulanceDriver,
      tourDriver,
      dispatcher,
      tourOperator,
      rentalPartner,
      fleetPartner,
      agent,
      schoolDriver,
    ]) {
      await this.wallets.save(
        this.wallets.create({
          userId: user.id,
          currency: 'UGX',
          availableBalance: user.id === rider.id ? 500000 : 100000,
          pendingBalance: 0,
        }),
      );
    }

    await this.addresses.save([
      this.addresses.create({
        userId: rider.id,
        label: 'Home',
        type: 'HOME',
        addressLine: '12 JJ Apartments, New Street, Kampala',
        city: 'Kampala',
        country: 'Uganda',
        latitude: 0.3476,
        longitude: 32.5825,
        isDefault: true,
      }),
      this.addresses.create({
        userId: rider.id,
        label: 'Office',
        type: 'OFFICE',
        addressLine: 'Acacia Mall, Kampala',
        city: 'Kampala',
        country: 'Uganda',
        latitude: 0.3382,
        longitude: 32.5867,
      }),
    ]);

    const createDriver = async (userId: string, capabilities: ServiceType[], lat: number, lon: number) =>
      this.drivers.save(
        this.drivers.create({
          userId,
          verificationStatus: DriverVerificationStatus.VERIFIED,
          availabilityStatus: DriverAvailabilityStatus.ONLINE,
          level: 'PROFESSIONAL',
          rating: 4.8,
          ratingsCount: 157,
          completedRides: capabilities.includes(ServiceType.RIDE) ? 200 : 0,
          completedDeliveries: capabilities.includes(ServiceType.DELIVERY) ? 126 : 0,
          experienceYears: 4,
          serviceCapabilities: capabilities,
          lastLatitude: lat,
          lastLongitude: lon,
          lastLocationAt: new Date(),
        }),
      );

    const rideDriverProfile = await createDriver(rideDriver.id, [ServiceType.RIDE], 0.315, 32.58);
    const deliveryDriverProfile = await createDriver(
      deliveryDriver.id,
      [ServiceType.DELIVERY],
      0.317,
      32.583,
    );
    const ambulanceDriverProfile = await createDriver(
      ambulanceDriver.id,
      [ServiceType.AMBULANCE],
      0.322,
      32.575,
    );
    const tourDriverProfile = await createDriver(tourDriver.id, [ServiceType.TOURIST_VEHICLE], 0.311, 32.588);
    const schoolDriverProfile = await createDriver(
      schoolDriver.id,
      [ServiceType.SCHOOL_SHUTTLE],
      0.325,
      32.581,
    );

    const rideVehicle = await this.vehicles.save(
      this.vehicles.create({
        ownerUserId: rideDriver.id,
        assignedDriverId: rideDriverProfile.id,
        make: 'Tesla',
        model: 'Model Y',
        year: 2025,
        plateNumber: 'UEV 001R',
        vehicleType: VehicleType.SUV,
        energyType: EnergyType.ELECTRIC,
        status: VehicleStatus.ACTIVE,
        seats: 5,
        cargoCapacityKg: 300,
        color: 'Red',
        serviceCapabilities: [ServiceType.RIDE],
        features: { premiumInterior: true, gpsTracking: true, childSeat: true },
        isActive: true,
      }),
    );
    rideDriverProfile.currentVehicleId = rideVehicle.id;
    await this.drivers.save(rideDriverProfile);

    const deliveryVehicle = await this.vehicles.save(
      this.vehicles.create({
        ownerUserId: deliveryDriver.id,
        assignedDriverId: deliveryDriverProfile.id,
        make: 'Ford',
        model: 'E-Transit',
        year: 2025,
        plateNumber: 'UEV 002D',
        vehicleType: VehicleType.VAN,
        energyType: EnergyType.ELECTRIC,
        status: VehicleStatus.ACTIVE,
        seats: 2,
        cargoCapacityKg: 1400,
        serviceCapabilities: [ServiceType.DELIVERY],
        features: { largeTrunk: true, storageNet: true, gpsTracking: true },
        isActive: true,
      }),
    );
    deliveryDriverProfile.currentVehicleId = deliveryVehicle.id;
    await this.drivers.save(deliveryDriverProfile);

    const ambulanceVehicle = await this.vehicles.save(
      this.vehicles.create({
        ownerUserId: ambulanceDriver.id,
        assignedDriverId: ambulanceDriverProfile.id,
        make: 'Mercedes-Benz',
        model: 'eSprinter Ambulance',
        year: 2025,
        plateNumber: 'UAMB 001',
        vehicleType: VehicleType.AMBULANCE,
        energyType: EnergyType.ELECTRIC,
        status: VehicleStatus.ACTIVE,
        seats: 4,
        cargoCapacityKg: 800,
        serviceCapabilities: [ServiceType.AMBULANCE],
        features: { stretcher: true, oxygenTank: true, firstAidKit: true, wheelchairAccessible: true },
        isActive: true,
      }),
    );
    ambulanceDriverProfile.currentVehicleId = ambulanceVehicle.id;
    await this.drivers.save(ambulanceDriverProfile);

    const tourVehicle = await this.vehicles.save(
      this.vehicles.create({
        ownerUserId: tourOperator.id,
        assignedDriverId: tourDriverProfile.id,
        make: 'Toyota',
        model: 'Land Cruiser EV Conversion',
        year: 2024,
        plateNumber: 'UTOUR 01',
        vehicleType: VehicleType.SUV,
        energyType: EnergyType.ELECTRIC,
        status: VehicleStatus.ACTIVE,
        seats: 7,
        cargoCapacityKg: 500,
        serviceCapabilities: [ServiceType.TOURIST_VEHICLE],
        features: { premiumInterior: true, extraLegroom: true, guideMicrophone: true },
        isActive: true,
      }),
    );
    tourDriverProfile.currentVehicleId = tourVehicle.id;
    await this.drivers.save(tourDriverProfile);

    const rentalVehicle = await this.vehicles.save(
      this.vehicles.create({
        ownerUserId: rentalPartner.id,
        make: 'Tesla',
        model: 'Model 3',
        year: 2025,
        plateNumber: 'URENT 01',
        vehicleType: VehicleType.SEDAN,
        energyType: EnergyType.ELECTRIC,
        status: VehicleStatus.ACTIVE,
        seats: 5,
        cargoCapacityKg: 250,
        serviceCapabilities: [ServiceType.CAR_RENTAL],
        features: { autopilot: true, gpsTracking: true },
        isActive: true,
        dailyRentalRate: 250000,
        includedDailyKm: 200,
        extraKmRate: 1500,
      }),
    );

    const rentalBranch = await this.rentalBranches.save(
      this.rentalBranches.create({
        operatorUserId: rentalPartner.id,
        code: 'KLA-CENTRAL',
        name: 'EVzone Rentals Kampala Central',
        address: 'Kampala Central Division, Kampala, Uganda',
        latitude: 0.3136,
        longitude: 32.5811,
        phone: rentalPartner.phone,
        timezone: 'Africa/Kampala',
        openingHours: {
          mondayToSaturday: '07:00-20:00',
          sunday: '08:00-18:00',
        },
        serviceAreas: ['Kampala', 'Entebbe', 'Wakiso', 'Mukono', 'Jinja'],
        active: true,
      }),
    );

    await this.rentalVehicleClasses.save([
      this.rentalVehicleClasses.create({
        operatorUserId: rentalPartner.id,
        branchId: rentalBranch.id,
        code: 'EV-COMPACT',
        name: 'EV Compact',
        description: 'Efficient electric cars for city trips and short rentals.',
        vehicleTypes: [VehicleType.HATCHBACK, VehicleType.SEDAN],
        minimumSeats: 4,
        maximumPassengers: 4,
        luggageCapacity: 2,
        features: { airConditioning: true, gpsTracking: true, chargingCable: true },
        pricing: { currency: 'UGX', dailyFrom: 180000, depositFrom: 300000 },
        active: true,
      }),
      this.rentalVehicleClasses.create({
        operatorUserId: rentalPartner.id,
        branchId: rentalBranch.id,
        code: 'EV-PREMIUM',
        name: 'EV Premium',
        description: 'Premium electric sedans and crossovers for business and executive travel.',
        vehicleTypes: [VehicleType.SEDAN, VehicleType.CROSSOVER, VehicleType.LUXURY],
        minimumSeats: 4,
        maximumPassengers: 5,
        luggageCapacity: 3,
        features: { premiumInterior: true, gpsTracking: true, chauffeurAvailable: true },
        pricing: { currency: 'UGX', dailyFrom: 300000, depositFrom: 600000 },
        active: true,
      }),
      this.rentalVehicleClasses.create({
        operatorUserId: rentalPartner.id,
        branchId: rentalBranch.id,
        code: 'EV-FAMILY',
        name: 'EV Family & Group',
        description: 'Spacious electric SUVs and minivans for families, groups and airport transfers.',
        vehicleTypes: [VehicleType.SUV, VehicleType.MINIVAN, VehicleType.VAN],
        minimumSeats: 5,
        maximumPassengers: 8,
        luggageCapacity: 6,
        features: { childSeatAvailable: true, largeLuggageSpace: true, gpsTracking: true },
        pricing: { currency: 'UGX', dailyFrom: 350000, depositFrom: 700000 },
        active: true,
      }),
    ]);

    const schoolVehicle = await this.vehicles.save(
      this.vehicles.create({
        ownerUserId: fleetPartner.id,
        assignedDriverId: schoolDriverProfile.id,
        make: 'Yutong',
        model: 'E10 Electric School Bus',
        year: 2025,
        plateNumber: 'USCH 001',
        vehicleType: VehicleType.BUS,
        energyType: EnergyType.ELECTRIC,
        status: VehicleStatus.ACTIVE,
        seats: 32,
        cargoCapacityKg: 500,
        color: 'Yellow',
        serviceCapabilities: [ServiceType.SCHOOL_SHUTTLE],
        features: { gpsTracking: true, childSeat: true, firstAidKit: true, dashboardCam: true },
        isActive: true,
      }),
    );
    schoolDriverProfile.currentVehicleId = schoolVehicle.id;
    await this.drivers.save(schoolDriverProfile);

    const organization = await this.organizations.save(
      this.organizations.create({
        name: 'EVzone Demonstration Fleet',
        legalName: 'EVzone Demonstration Fleet Limited',
        type: OrganizationType.FLEET_PARTNER,
        status: OrganizationStatus.ACTIVE,
        code: 'EVFLEET-DEMO',
        registrationNumber: 'DEMO-FLEET-001',
        taxIdentificationNumber: 'TIN-DEMO-001',
        countryCode: 'UG',
        timezone: 'Africa/Kampala',
        currency: 'UGX',
        primaryOwnerUserId: fleetPartner.id,
        contactEmail: fleetPartner.email,
        contactPhone: fleetPartner.phone,
        serviceCapabilities: Object.values(ServiceType),
        settings: { demo: true, manualBookingEnabled: true, corporatePayEnabled: true },
        approvedByUserId: admin.id,
        approvedAt: new Date(),
      }),
    );

    await this.organizationMembers.save([
      this.organizationMembers.create({
        organizationId: organization.id,
        userId: fleetPartner.id,
        role: OrganizationMemberRole.OWNER,
        status: MembershipStatus.ACTIVE,
        invitedByUserId: admin.id,
        invitedAt: new Date(),
        joinedAt: new Date(),
        permissions: ['*'],
      }),
      this.organizationMembers.create({
        organizationId: organization.id,
        userId: dispatcher.id,
        role: OrganizationMemberRole.DISPATCH_MANAGER,
        status: MembershipStatus.ACTIVE,
        invitedByUserId: fleetPartner.id,
        invitedAt: new Date(),
        joinedAt: new Date(),
        permissions: ['dispatch:*', 'fleet:read'],
      }),
      this.organizationMembers.create({
        organizationId: organization.id,
        userId: agent.id,
        role: OrganizationMemberRole.AGENT,
        status: MembershipStatus.ACTIVE,
        invitedByUserId: fleetPartner.id,
        invitedAt: new Date(),
        joinedAt: new Date(),
        permissions: ['manual-bookings:*', 'customers:create'],
      }),
    ]);

    const fleet = await this.fleetProfiles.save(
      this.fleetProfiles.create({
        organizationId: organization.id,
        code: 'FLEET-DEMO-001',
        displayName: 'EVzone Demonstration Fleet',
        status: OrganizationStatus.ACTIVE,
        serviceCapabilities: Object.values(ServiceType),
        schoolShuttleEnabled: true,
        operationsEmail: 'operations@evzone.local',
        operationsPhone: '+256700000010',
        dispatchRules: { autoAssignment: false, maximumConcurrentJobsPerDriver: 1 },
        payoutConfiguration: { provider: 'CORPORATEPAY', settlementCycle: 'WEEKLY' },
      }),
    );

    const fleetAssets: Array<[Vehicle, DriverProfile, ServiceType[]]> = [
      [rideVehicle, rideDriverProfile, [ServiceType.RIDE]],
      [deliveryVehicle, deliveryDriverProfile, [ServiceType.DELIVERY]],
      [ambulanceVehicle, ambulanceDriverProfile, [ServiceType.AMBULANCE]],
      [tourVehicle, tourDriverProfile, [ServiceType.TOURIST_VEHICLE]],
      [schoolVehicle, schoolDriverProfile, [ServiceType.SCHOOL_SHUTTLE]],
    ];
    for (const [vehicle, driverProfile, capabilities] of fleetAssets) {
      await this.fleetVehicles.save(
        this.fleetVehicles.create({
          fleetId: fleet.id,
          vehicleId: vehicle.id,
          status: FleetAssetStatus.ACTIVE,
          ownershipType: 'OWNED',
          serviceCapabilities: [...capabilities],
          schoolManaged: capabilities.includes(ServiceType.SCHOOL_SHUTTLE),
          schoolId: capabilities.includes(ServiceType.SCHOOL_SHUTTLE) ? 'SCHOOL-DEMO-001' : undefined,
          activatedAt: new Date(),
          metadata: { demo: true },
        }),
      );
      await this.fleetDrivers.save(
        this.fleetDrivers.create({
          fleetId: fleet.id,
          driverId: driverProfile.id,
          status: FleetAssetStatus.ACTIVE,
          engagementType: 'EMPLOYEE',
          serviceCapabilities: [...capabilities],
          schoolManaged: capabilities.includes(ServiceType.SCHOOL_SHUTTLE),
          schoolId: capabilities.includes(ServiceType.SCHOOL_SHUTTLE) ? 'SCHOOL-DEMO-001' : undefined,
          joinedAt: new Date(),
          metadata: { demo: true },
        }),
      );
    }
    await this.fleetVehicles.save(
      this.fleetVehicles.create({
        fleetId: fleet.id,
        vehicleId: rentalVehicle.id,
        status: FleetAssetStatus.ACTIVE,
        ownershipType: 'PARTNER',
        serviceCapabilities: [ServiceType.CAR_RENTAL],
        activatedAt: new Date(),
        metadata: { demo: true },
      }),
    );

    const desk = await this.dispatchDesks.save(
      this.dispatchDesks.create({
        organizationId: organization.id,
        code: 'DISPATCH-DEMO',
        name: 'Central Operations Desk',
        timezone: 'Africa/Kampala',
        active: true,
        serviceCapabilities: Object.values(ServiceType),
        settings: { acceptsPhoneBookings: true, acceptsWalkIns: true },
      }),
    );
    const agentRoleDefinitions = [
      {
        name: 'dispatch',
        description: 'Manual booking and live dispatch operations',
        color: '#03cd8c',
        permissions: [
          'dashboard:read',
          'dispatch:*',
          'live-ops:*',
          'profiles:read',
          'search:read',
          'tasks:*',
        ],
      },
      {
        name: 'support_t2',
        description: 'Escalated customer support and case resolution',
        color: '#f77f00',
        permissions: [
          'dashboard:read',
          'support:*',
          'profiles:read',
          'safety:read',
          'search:read',
          'tasks:*',
        ],
      },
      {
        name: 'supervisor',
        description: 'Full Agent Portal supervision and configuration',
        color: '#a6a6a6',
        permissions: ['*'],
      },
    ];
    for (const definition of agentRoleDefinitions) {
      await this.agentRoles.save(
        this.agentRoles.create({
          organizationId: organization.id,
          ...definition,
          isSystem: true,
          active: true,
          metadata: { seeded: true },
        }),
      );
    }

    const operationsTeam = await this.agentTeams.save(
      this.agentTeams.create({
        organizationId: organization.id,
        name: 'Central Operations',
        description: 'Dispatch, support, safety and onboarding operations for the demonstration tenant.',
        supervisorUserId: admin.id,
        queueTypes: ['DISPATCH', 'SUPPORT', 'SAFETY', 'ONBOARDING'],
        serviceCapabilities: Object.values(ServiceType),
        memberUserIds: [dispatcher.id, agent.id],
        active: true,
        metadata: { seeded: true, slaMinutes: 15 },
      }),
    );

    await this.agentProfiles.save([
      this.agentProfiles.create({
        userId: dispatcher.id,
        organizationId: organization.id,
        deskId: desk.id,
        employeeCode: 'DSP-0001',
        status: MembershipStatus.ACTIVE,
        portalRole: 'dispatch',
        teamId: operationsTeam.id,
        title: 'Senior Dispatcher',
        department: 'Operations',
        permissions: [
          'dashboard:read',
          'dispatch:*',
          'live-ops:*',
          'profiles:read',
          'search:read',
          'tasks:*',
        ],
        trainingGateCompletedAt: new Date(),
        canCreateManualBookings: true,
        canAssignDrivers: true,
        canOverridePricing: true,
        canIssueRefunds: false,
        serviceCapabilities: Object.values(ServiceType),
      }),
      this.agentProfiles.create({
        userId: agent.id,
        organizationId: organization.id,
        deskId: desk.id,
        employeeCode: 'AGT-0001',
        status: MembershipStatus.ACTIVE,
        portalRole: 'support_t2',
        teamId: operationsTeam.id,
        title: 'Customer Operations Agent',
        department: 'Customer Experience',
        permissions: [
          'dashboard:read',
          'support:*',
          'profiles:read',
          'safety:read',
          'search:read',
          'tasks:*',
        ],
        trainingGateCompletedAt: new Date(),
        canCreateManualBookings: true,
        canAssignDrivers: false,
        canOverridePricing: false,
        canIssueRefunds: false,
        serviceCapabilities: Object.values(ServiceType),
      }),
    ]);

    const agentLearningModules = [
      {
        code: 'AGENT_PORTAL_FOUNDATIONS',
        title: 'EVzone Agent Portal Foundations',
        description:
          'Navigation, queue ownership, secure customer handling and cross-service operating standards.',
        sequence: 1,
        roleScopes: ['support_t1', 'support_t2', 'dispatch', 'onboarding', 'safety', 'qa', 'supervisor'],
      },
      {
        code: 'AGENT_DISPATCH_SAFETY',
        title: 'Dispatch and Safety Operations',
        description: 'Manual bookings, escalation paths, emergency response and auditable incident handling.',
        sequence: 2,
        roleScopes: ['dispatch', 'safety', 'supervisor'],
      },
      {
        code: 'AGENT_SUPPORT_QUALITY',
        title: 'Support Quality and SLA Management',
        description: 'Ticket prioritisation, communication quality, QA scoring and coaching practices.',
        sequence: 3,
        roleScopes: ['support_t1', 'support_t2', 'qa', 'supervisor'],
      },
    ];
    for (const item of agentLearningModules) {
      await this.agentTraining.save(
        this.agentTraining.create({
          ...item,
          mediaUrl: `/training/agent/${item.code.toLowerCase()}`,
          passingScore: 80,
          required: true,
          active: true,
          content: { durationMinutes: 15, format: 'VIDEO_AND_READING' },
          quiz: {
            questions: [
              {
                id: 'q1',
                prompt: 'Which action best protects an EVzone customer and the audit trail?',
                options: [
                  'Share credentials',
                  'Record actions in the assigned case',
                  'Use an unapproved channel',
                ],
                correctAnswer: 'Record actions in the assigned case',
              },
            ],
          },
        }),
      );
    }

    await this.agentTasks.save([
      this.agentTasks.create({
        organizationId: organization.id,
        assigneeUserId: dispatcher.id,
        createdByUserId: admin.id,
        title: 'Review unassigned manual bookings',
        description: 'Check the dispatch board and assign eligible drivers and vehicles.',
        category: 'DISPATCH',
        status: 'OPEN',
        priority: 'HIGH',
        dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        tags: ['dispatch', 'demo'],
      }),
      this.agentTasks.create({
        organizationId: organization.id,
        assigneeUserId: agent.id,
        createdByUserId: admin.id,
        title: 'Follow up open customer cases',
        description: 'Review SLA risk and update customers with the next action.',
        category: 'SUPPORT',
        status: 'OPEN',
        priority: 'NORMAL',
        dueAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        tags: ['support', 'demo'],
      }),
    ]);

    const shiftStart = new Date();
    shiftStart.setMinutes(0, 0, 0);
    const shiftEnd = new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000);
    await this.agentShifts.save([
      this.agentShifts.create({
        organizationId: organization.id,
        userId: dispatcher.id,
        teamId: operationsTeam.id,
        timezone: 'Africa/Kampala',
        startsAt: shiftStart,
        endsAt: shiftEnd,
        status: 'SCHEDULED',
      }),
      this.agentShifts.create({
        organizationId: organization.id,
        userId: agent.id,
        teamId: operationsTeam.id,
        timezone: 'Africa/Kampala',
        startsAt: shiftStart,
        endsAt: shiftEnd,
        status: 'SCHEDULED',
      }),
    ]);

    await this.corporatePayAccounts.save(
      this.corporatePayAccounts.create({
        externalAccountId: 'CP-DEMO-FLEET-001',
        organizationId: organization.id,
        name: 'EVzone Demonstration Fleet CorporatePay',
        status: 'ACTIVE',
        currency: 'UGX',
        transactionLimit: 5_000_000,
        monthlyLimit: 100_000_000,
        approvalRules: { autoApproveBelow: 1_000_000, requiredApprovers: 1 },
        metadata: { sandbox: true },
      }),
    );

    await this.schoolConnections.save(
      this.schoolConnections.create({
        fleetId: fleet.id,
        schoolId: 'SCHOOL-DEMO-001',
        schoolName: 'EVzone Demonstration School',
        externalTenantId: 'school-demo',
        status: IntegrationStatus.CONNECTED,
        syncDirection: SyncDirection.BIDIRECTIONAL,
        webhookUrl: 'http://localhost:3000/api/v1/fleet-partners/school/webhooks/demo',
        lastSyncedAt: new Date(),
        config: { mode: 'LOCAL_SANDBOX', resources: ['VEHICLE', 'DRIVER', 'ROUTE', 'STUDENT'] },
      }),
    );

    await this.platformSettings.save([
      this.platformSettings.create({
        key: 'platform.brand',
        category: 'GENERAL',
        value: { name: 'EVzone Ride', primary: '#03cd8c', accent: '#f77f00' },
        protected: false,
        updatedByUserId: admin.id,
      }),
      this.platformSettings.create({
        key: 'integrations.corporatePay.mode',
        category: 'INTEGRATIONS',
        value: 'sandbox',
        protected: true,
        updatedByUserId: admin.id,
      }),
    ]);

    await this.featureFlags.save([
      this.featureFlags.create({
        scope: 'GLOBAL',
        key: 'shared_rides',
        enabled: true,
        description: 'Enable ride sharing',
      }),
      this.featureFlags.create({
        scope: 'GLOBAL',
        key: 'corporate_pay',
        enabled: true,
        description: 'Enable CorporatePay integration',
      }),
      this.featureFlags.create({
        scope: 'DRIVER',
        key: 'surge_notifications',
        enabled: true,
        description: 'Show surge notifications to drivers',
      }),
      this.featureFlags.create({
        scope: 'FLEET',
        key: 'school_fleet_sync',
        enabled: true,
        description: 'Enable school-shuttle fleet synchronization',
      }),
    ]);

    await this.serviceConfigurations.save([
      this.serviceConfigurations.create({
        key: 'dispatch.default',
        name: 'Default dispatch configuration',
        enabled: true,
        configuration: { offerTtlSeconds: 120, matchingRadiusKm: 25, maximumConcurrentJobsPerDriver: 1 },
        updatedByUserId: admin.id,
      }),
      this.serviceConfigurations.create({
        key: 'operations.watchdog',
        name: 'Operations watchdog thresholds',
        enabled: true,
        configuration: {
          driverHeartbeatTimeoutMs: 300000,
          tripRequestTimeoutMs: 600000,
          activeServiceStuckThresholdMs: 1800000,
        },
        updatedByUserId: admin.id,
      }),
    ]);

    await this.commutes.save(
      this.commutes.create({
        userId: rider.id,
        name: 'Home to Office',
        serviceType: ServiceType.RIDE,
        pickup: { address: '12 JJ Apartments, New Street, Kampala', latitude: 0.3476, longitude: 32.5825 },
        dropoff: { address: 'Acacia Mall, Kampala', latitude: 0.3382, longitude: 32.5867 },
        schedule: { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], time: '08:00', timezone: 'Africa/Kampala' },
        active: true,
        preferences: { category: 'STANDARD' },
      }),
    );

    await this.storedPaymentMethods.save(
      this.storedPaymentMethods.create({
        userId: rider.id,
        type: 'WALLET',
        label: 'EVzone Wallet',
        provider: 'EVZONE',
        maskedValue: 'EVzone Pay',
        isDefault: true,
        enabled: true,
      }),
    );

    const zone = await this.zones.save(
      this.zones.create({
        name: 'Greater Kampala',
        city: 'Kampala',
        countryCode: 'UG',
        timezone: 'Africa/Kampala',
        currency: 'UGX',
        active: true,
      }),
    );

    const rules: Array<Partial<PricingRule>> = [
      {
        serviceType: ServiceType.RIDE,
        baseFare: 2500,
        perKm: 1200,
        perMinute: 150,
        minimumFare: 5000,
        bookingFee: 1000,
      },
      {
        serviceType: ServiceType.DELIVERY,
        baseFare: 5000,
        perKm: 1500,
        perMinute: 100,
        minimumFare: 8000,
        bookingFee: 1000,
      },
      {
        serviceType: ServiceType.TOURIST_VEHICLE,
        baseFare: 50000,
        perKm: 2500,
        perMinute: 500,
        minimumFare: 100000,
        bookingFee: 5000,
      },
      {
        serviceType: ServiceType.AMBULANCE,
        baseFare: 30000,
        perKm: 3000,
        perMinute: 300,
        minimumFare: 50000,
        bookingFee: 0,
      },
      {
        serviceType: ServiceType.CAR_RENTAL,
        baseFare: 150000,
        perKm: 0,
        perMinute: 0,
        minimumFare: 150000,
        bookingFee: 10000,
      },
    ];
    for (const rule of rules) {
      await this.pricing.save(
        this.pricing.create({
          zoneId: zone.id,
          cancellationFee: 3000,
          waitingPerMinute: 300,
          defaultMultiplier: 1,
          active: true,
          ...rule,
        }),
      );
    }

    await this.promos.save(
      this.promos.create({
        code: 'WELCOME10',
        discountType: 'PERCENT',
        value: 10,
        maximumDiscount: 20000,
        minimumSpend: 5000,
        perUserLimit: 1,
        active: true,
      }),
    );

    await this.tours.save(
      this.tours.create({
        operatorUserId: tourOperator.id,
        title: 'Kampala and Entebbe EV City Tour',
        description:
          'A full-day chauffeured electric vehicle tour of Kampala landmarks and Entebbe waterfront.',
        city: 'Kampala',
        countryCode: 'UG',
        durationDays: 1,
        basePrice: 450000,
        currency: 'UGX',
        itinerary: [
          { sequence: 1, place: 'Uganda Museum' },
          { sequence: 2, place: 'Kasubi Tombs' },
          { sequence: 3, place: 'Entebbe Botanical Gardens' },
        ],
        includedServices: ['Professional driver', 'Bottled water', 'Charging', 'Live tracking'],
        active: true,
      }),
    );

    await this.facilities.save([
      this.facilities.create({
        name: 'Mulago National Referral Hospital',
        address: 'Upper Mulago Hill Road, Kampala',
        latitude: 0.3416,
        longitude: 32.5768,
        phone: '+256414554001',
        services: ['Emergency', 'Trauma', 'Critical Care'],
        active: true,
      }),
      this.facilities.create({
        name: 'International Hospital Kampala',
        address: 'Namuwongo, Kampala',
        latitude: 0.3029,
        longitude: 32.6119,
        phone: '+256312200400',
        services: ['Emergency', 'Ambulance', 'General Medicine'],
        active: true,
      }),
    ]);

    const modules = [
      [
        'GETTING_STARTED',
        'Getting Started with EVzone Driver',
        'Platform basics, account readiness and professional conduct.',
      ],
      ['NAVIGATION', 'Navigate the EVzone Driver App', 'Map tools, route controls and location accuracy.'],
      [
        'EARNINGS',
        'Boost Your Earnings',
        'Practical guidance for demand zones, service quality and efficiency.',
      ],
      ['SAFETY', 'Essential Safety Practices', 'Emergency tools, fatigue limits and passenger safety.'],
    ];
    for (let i = 0; i < modules.length; i += 1) {
      const [code, title, description] = modules[i];
      await this.training.save(
        this.training.create({
          code,
          title,
          description,
          sequence: i + 1,
          quiz: {
            question: 'Which action best supports safe EVzone service?',
            options: ['Ignore alerts', 'Follow safety guidance', 'Share credentials'],
            correctIndex: 1,
          },
          active: true,
        }),
      );
    }

    await this.notifications.save(
      this.notifications.create({
        userId: rider.id,
        type: NotificationType.PROMOTION,
        title: 'Welcome to EVzone Ride',
        body: 'Use WELCOME10 on your first eligible booking.',
        data: { promoCode: 'WELCOME10' },
      }),
    );

    this.logger.log('Demo data seeded. Password for all demo users: Password123!');
  }
}
