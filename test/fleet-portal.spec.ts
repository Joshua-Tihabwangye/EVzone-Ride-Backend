import 'reflect-metadata';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AccountStatus,
  DocumentStatus,
  DocumentType,
  DriverVerificationStatus,
  EnergyType,
  FleetAssetStatus,
  FleetAssignmentStatus,
  MembershipStatus,
  OrganizationMemberRole,
  OrganizationStatus,
  OrganizationType,
  ServiceType,
  TrainingProgressStatus,
  UserRole,
  VehicleStatus,
  VehicleType,
} from '../src/common/enums';
import { AuthUser } from '../src/common/interfaces';
import {
  DriverProfile,
  EarningsLedger,
  ENTITIES,
  FleetAssignment,
  FleetDriver,
  FleetPortalResource,
  FleetProfile,
  FleetVehicle,
  Organization,
  OrganizationMember,
  TrainingModule,
  TrainingProgress,
  User,
  Vehicle,
  VehicleDocument,
} from '../src/database/entities';
import { FleetPortalService, PortalEvent } from '../src/fleet-portal/fleet-portal.service';
import { FleetPortalController } from '../src/fleet-portal/fleet-portal.controller';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionGuard } from '../src/permissions/permission.guard';
import { Reflector } from '@nestjs/core';

const financialOperationsMock = { requestCashout: jest.fn() };
const auditServiceMock = { record: jest.fn().mockResolvedValue({}) };
const businessMetricsMock = {
  recordFleetPayoutRequested: jest.fn(),
  recordFleetComplianceScored: jest.fn(),
};

describe('Fleet Partner portal contract', () => {
  let db: DataSource;
  let service: FleetPortalService;
  let user: User;
  let authUser: AuthUser;
  let organization: Organization;
  let fleet: FleetProfile;
  const emitted: PortalEvent[] = [];

  beforeAll(async () => {
    db = new DataSource({
      type: 'sqljs',
      entities: [...ENTITIES],
      synchronize: true,
      dropSchema: true,
      logging: false,
    });
    await db.initialize();

    const events = new EventEmitter2();
    events.on('fleet.portal.event', (event: PortalEvent) => emitted.push(event));
    service = new FleetPortalService(
      db,
      events,
      financialOperationsMock as never,
      auditServiceMock as never,
      businessMetricsMock as never,
    );

    user = await db.getRepository(User).save(
      db.getRepository(User).create({
        email: 'fleet.contract@evzone.local',
        phone: '+256700111222',
        passwordHash: 'not-used-in-service-tests',
        firstName: 'Fleet',
        lastName: 'Owner',
        role: UserRole.FLEET_PARTNER,
        status: AccountStatus.ACTIVE,
        currency: 'UGX',
        countryCode: 'UG',
      }),
    );
    organization = await db.getRepository(Organization).save(
      db.getRepository(Organization).create({
        name: 'Contract Test Fleet',
        legalName: 'Contract Test Fleet Limited',
        type: OrganizationType.FLEET_PARTNER,
        status: OrganizationStatus.ACTIVE,
        code: 'FLEET-CONTRACT-TEST',
        externalId: 'oidc-contract-organization',
        primaryOwnerUserId: user.id,
        currency: 'UGX',
        countryCode: 'UG',
        serviceCapabilities: Object.values(ServiceType),
      }),
    );
    await db.getRepository(OrganizationMember).save(
      db.getRepository(OrganizationMember).create({
        organizationId: organization.id,
        userId: user.id,
        role: OrganizationMemberRole.OWNER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      }),
    );
    fleet = await db.getRepository(FleetProfile).save(
      db.getRepository(FleetProfile).create({
        organizationId: organization.id,
        code: 'FLT-CONTRACT',
        displayName: 'Contract Test Fleet',
        status: OrganizationStatus.ACTIVE,
        serviceCapabilities: Object.values(ServiceType),
        schoolShuttleEnabled: true,
      }),
    );
    authUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }, 60_000);

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('returns the frontend profile shape and supports profile updates', async () => {
    const profile = await service.profile(authUser);
    expect(profile.fleetAccountId).toBe(fleet.id);
    expect(profile.fleetId).toBe(fleet.id);
    expect(profile.companyName).toBe('Contract Test Fleet');

    const updated = await service.updateProfile(authUser, {
      companyName: 'EVzone Contract Fleet',
      contactEmail: 'operations@contract.test',
      monthlySpendLimit: 5_000_000,
    });
    expect(updated.companyName).toBe('EVzone Contract Fleet');
    expect(updated.contactEmail).toBe('operations@contract.test');
    expect(updated.monthlySpendLimit).toBe(5_000_000);
  });

  it('resolves internal, OIDC external and fleet identifiers for multi-organization context', async () => {
    expect((await service.profile(authUser, organization.id)).fleetId).toBe(fleet.id);
    expect((await service.profile(authUser, 'oidc-contract-organization')).fleetId).toBe(fleet.id);
    expect((await service.profile(authUser, fleet.id)).organizationId).toBe(organization.id);

    const available = await service.organizationsForUser(authUser);
    expect(available).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: organization.id,
          externalId: 'oidc-contract-organization',
          fleetId: fleet.id,
          role: OrganizationMemberRole.OWNER,
        }),
      ]),
    );
  });

  it('supports branch CRUD and deep portal settings updates', async () => {
    const created = await service.createBranch(authUser, {
      name: 'Kampala Central',
      address: 'Plot 1 Kampala Road',
      city: 'Kampala',
      operatingHours: '06:00-23:00',
    });
    expect(created.fleetId).toBe(fleet.id);

    const updated = await service.updateBranch(authUser, created.id, { managerName: 'Amina' });
    expect(updated.managerName).toBe('Amina');
    expect(await service.listBranches(authUser)).toHaveLength(1);

    const settings = await service.updatePortalSettings(authUser, {
      notifications: { sms: false },
    });
    expect(settings.notifications).toEqual({ email: true, sms: false, portal: true });
  });

  it('creates drivers, vehicles and an assignable dispatch with app-compatible shapes', async () => {
    const driver = await service.createDriver(authUser, {
      displayName: 'Jane Driver',
      email: 'jane.driver.contract@evzone.local',
      phone: '+256700222333',
      status: 'ACTIVE',
      serviceCapabilities: [ServiceType.RIDE, ServiceType.DELIVERY],
      metadata: { city: 'Kampala' },
    });
    expect(driver.displayName).toBe('Jane Driver');
    expect(driver.status).toBe('ACTIVE');

    const vehicle = await service.createVehicle(authUser, {
      make: 'BYD',
      model: 'Atto 3',
      yearOfManufacture: 2026,
      licensePlate: 'UAA 123E',
      vehicleName: 'Contract EV',
      vehicleStatus: 'ACTIVE',
      bodyType: 'SUV',
      powertrain: 'BEV',
      serviceCapabilities: [ServiceType.RIDE, ServiceType.DELIVERY],
    });
    expect(vehicle.licensePlate).toBe('UAA 123E');
    expect(vehicle.vehicleStatus).toBe('ACTIVE');

    const defaultActiveVehicle = await service.createVehicle(authUser, {
      make: 'Kia',
      model: 'Niro EV',
      yearOfManufacture: 2025,
      licensePlate: 'UAB 456E',
      bodyType: 'CROSSOVER',
      powertrain: 'BEV',
    });
    expect(defaultActiveVehicle.vehicleStatus).toBe('ACTIVE');
    expect(defaultActiveVehicle.isActive).toBe(true);

    const dispatch = await service.createDispatch(authUser, {
      pickup: { address: 'Kampala Road' },
      dropoff: { address: 'Entebbe Airport' },
      driverId: driver.id,
      vehicleId: vehicle.id,
      type: 'ride',
      notes: 'Manual fleet dispatch',
    });
    expect(dispatch.driverId).toBe(driver.id);
    expect(dispatch.vehicleId).toBe(vehicle.id);
    expect(dispatch.status).toBe('ASSIGNED');
    expect((dispatch.pickup as { address: string }).address).toBe('Kampala Road');
  }, 30_000);

  it('supports rental, tour and school-shuttle resources using frontend status conventions', async () => {
    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
    const rental = await service.createServiceOrder(authUser, 'RENTAL', {
      customerName: 'Rental Customer',
      scheduledAt,
      status: 'PENDING',
    });
    const tour = await service.createServiceOrder(authUser, 'TOUR', {
      customerName: 'Tour Customer',
      scheduledAt,
      status: 'ACTIVE',
    });
    const shuttle = await service.createServiceOrder(authUser, 'SCHOOL_SHUTTLE', {
      customerName: 'Green Valley School',
      scheduledAt,
      status: 'PENDING',
    });

    expect(rental.service).toBe('rental');
    expect(rental.status).toBe('pending');
    expect(tour.service).toBe('tour');
    expect(tour.status).toBe('active');
    expect(shuttle.service).toBe('school_shuttle');

    const route = await service.createLooseResource(authUser, 'SCHOOL_ROUTE', {
      name: 'Route A',
      pickup: 'Ntinda',
      dropoff: 'Kololo',
    });
    expect((route as Record<string, unknown>).name).toBe('Route A');
    expect(await service.listLooseResources(authUser, 'SCHOOL_ROUTE')).toHaveLength(1);
  });

  it('accepts the app incident payload and returns lowercase severity/status', async () => {
    const incident = await service.createIncident(authUser, {
      category: 'Vehicle safety',
      severity: 'HIGH',
      status: 'OPEN',
      description: 'Tyre pressure warning',
      reporterId: user.id,
    });
    expect(incident?.severity).toBe('high');
    expect(incident?.status).toBe('open');
    expect(incident?.reporterId).toBe(user.id);
  });

  it('enforces tenant isolation for explicit organization selection', async () => {
    const outsider = await db.getRepository(Organization).save(
      db.getRepository(Organization).create({
        name: 'Other Fleet',
        type: OrganizationType.FLEET_PARTNER,
        status: OrganizationStatus.ACTIVE,
        code: 'OTHER-FLEET-CONTRACT',
        primaryOwnerUserId: user.id,
      }),
    );
    await db.getRepository(FleetProfile).save(
      db.getRepository(FleetProfile).create({
        organizationId: outsider.id,
        code: 'FLT-OTHER-CONTRACT',
        displayName: 'Other Fleet',
        status: OrganizationStatus.ACTIVE,
      }),
    );
    await expect(service.profile(authUser, outsider.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('publishes canonical realtime events for mutations', () => {
    expect(emitted.some((event) => event.event === 'dispatch.created')).toBe(true);
    expect(emitted.some((event) => event.event === 'fleet.alert')).toBe(true);
    expect(emitted.every((event) => event.fleetId === fleet.id)).toBe(true);
  });

  it('persists generic resources in the fleet tenant only', async () => {
    const count = await db.getRepository(FleetPortalResource).count({ where: { fleetId: fleet.id } });
    expect(count).toBeGreaterThanOrEqual(5);
  });

  describe('fleet readiness (Phase 3.6)', () => {
    beforeEach(() => {
      financialOperationsMock.requestCashout.mockReset().mockResolvedValue(undefined);
      auditServiceMock.record.mockReset().mockResolvedValue({});
      businessMetricsMock.recordFleetPayoutRequested.mockClear();
      businessMetricsMock.recordFleetComplianceScored.mockClear();
    });

    it('allows fleet managers to request a driver payout', async () => {
      const driverUser = await db.getRepository(User).save(
        db.getRepository(User).create({
          email: 'driver.payout@evzone.local',
          phone: '+256700444555',
          passwordHash: 'hash',
          firstName: 'Driver',
          lastName: 'Payout',
          role: UserRole.DRIVER,
          status: AccountStatus.ACTIVE,
        }),
      );
      const driver = await db.getRepository(DriverProfile).save(
        db.getRepository(DriverProfile).create({
          userId: driverUser.id,
          verificationStatus: DriverVerificationStatus.VERIFIED,
        }),
      );
      await db.getRepository(FleetDriver).save(
        db.getRepository(FleetDriver).create({
          fleetId: fleet.id,
          driverId: driver.id,
          status: FleetAssetStatus.ACTIVE,
        }),
      );

      financialOperationsMock.requestCashout.mockResolvedValue({
        id: 'cashout-1',
        amount: 5000,
        currency: 'UGX',
        status: 'PENDING',
        reference: 'CO-FLEET-1',
        createdAt: new Date(),
      });

      const result = await service.requestPayout(authUser, {
        driverId: driver.id,
        amount: 5000,
        method: { phone: '0700222333' },
        reason: 'Weekly earnings',
      });

      expect(financialOperationsMock.requestCashout).toHaveBeenCalled();
      expect(result.status).toBe('PENDING');
      expect(result.amount).toBe(5000);
      expect(businessMetricsMock.recordFleetPayoutRequested).toHaveBeenCalled();
    });

    it('rejects payout requests for drivers outside the fleet', async () => {
      await expect(
        service.requestPayout(authUser, {
          driverId: 'unknown-driver',
          amount: 5000,
          method: { phone: '0700000000' },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('computes a fleet compliance score', async () => {
      const driverUser = await db.getRepository(User).save(
        db.getRepository(User).create({
          email: 'driver.compliance@evzone.local',
          passwordHash: 'hash',
          firstName: 'Driver',
          lastName: 'Compliance',
          role: UserRole.DRIVER,
          status: AccountStatus.ACTIVE,
        }),
      );
      const driver = await db.getRepository(DriverProfile).save(
        db.getRepository(DriverProfile).create({
          userId: driverUser.id,
          verificationStatus: DriverVerificationStatus.VERIFIED,
        }),
      );
      await db.getRepository(FleetDriver).save(
        db.getRepository(FleetDriver).create({
          fleetId: fleet.id,
          driverId: driver.id,
          status: FleetAssetStatus.ACTIVE,
        }),
      );

      const vehicle = await db.getRepository(Vehicle).save(
        db.getRepository(Vehicle).create({
          ownerUserId: user.id,
          make: 'Toyota',
          model: 'Hiace',
          year: 2020,
          plateNumber: 'UAB 123X',
          status: VehicleStatus.ACTIVE,
          vehicleType: VehicleType.VAN,
          energyType: EnergyType.INTERNAL_COMBUSTION,
        }),
      );
      await db.getRepository(FleetVehicle).save(
        db.getRepository(FleetVehicle).create({
          fleetId: fleet.id,
          vehicleId: vehicle.id,
          status: FleetAssetStatus.ACTIVE,
        }),
      );
      await db.getRepository(VehicleDocument).save(
        db.getRepository(VehicleDocument).create({
          vehicleId: vehicle.id,
          type: DocumentType.VEHICLE_INSURANCE,
          status: DocumentStatus.VERIFIED,
          fileUrl: 'http://example.com/insurance.pdf',
        }),
      );

      const module = await db.getRepository(TrainingModule).save(
        db.getRepository(TrainingModule).create({
          code: 'SAFETY-101',
          title: 'Safety',
          description: 'Safety training',
        }),
      );
      await db.getRepository(TrainingProgress).save(
        db.getRepository(TrainingProgress).create({
          driverId: driver.id,
          moduleId: module.id,
          status: TrainingProgressStatus.COMPLETED,
        }),
      );

      const score = await service.fleetComplianceScore(authUser);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(score.breakdown.activeDrivers).toBeGreaterThanOrEqual(1);
      expect(score.breakdown.activeVehicles).toBeGreaterThanOrEqual(1);
      expect(businessMetricsMock.recordFleetComplianceScored).toHaveBeenCalled();
    });

    it('aggregates fleet performance metrics', async () => {
      const driverUser = await db.getRepository(User).save(
        db.getRepository(User).create({
          email: 'driver.performance@evzone.local',
          passwordHash: 'hash',
          firstName: 'Driver',
          lastName: 'Performance',
          role: UserRole.DRIVER,
          status: AccountStatus.ACTIVE,
        }),
      );
      const driver = await db.getRepository(DriverProfile).save(
        db.getRepository(DriverProfile).create({
          userId: driverUser.id,
          verificationStatus: DriverVerificationStatus.VERIFIED,
        }),
      );
      await db.getRepository(FleetDriver).save(
        db.getRepository(FleetDriver).create({
          fleetId: fleet.id,
          driverId: driver.id,
          status: FleetAssetStatus.ACTIVE,
        }),
      );
      await db.getRepository(FleetAssignment).save(
        db.getRepository(FleetAssignment).create({
          fleetId: fleet.id,
          serviceType: ServiceType.RIDE,
          serviceId: 'ride-fleet-1',
          driverId: driver.id,
          status: FleetAssignmentStatus.COMPLETED,
          startsAt: new Date(),
          assignedByUserId: user.id,
        }),
      );
      await db.getRepository(EarningsLedger).save(
        db.getRepository(EarningsLedger).create({
          userId: driverUser.id,
          driverId: driver.id,
          journalId: 'journal-fleet-1',
          grossAmount: 12000,
          platformFee: 2000,
          netAmount: 10000,
          currency: 'UGX',
        }),
      );

      const metrics = await service.fleetPerformanceMetrics(authUser);
      expect(metrics.totals.completed).toBe(1);
      expect(metrics.earnings.net).toBe(10000);
    });

    it('rejects non-fleet roles for fleet portal controller endpoints', () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);
      const handler = FleetPortalController.prototype.complianceScore;

      const context = {
        getHandler: () => handler,
        getClass: () => FleetPortalController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: UserRole.CUSTOMER } }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(false);
    });

    it('enforces fleet payout permission through PermissionGuard', () => {
      const reflector = new Reflector();
      const guard = new PermissionGuard(reflector);
      const handler = FleetPortalController.prototype.requestPayout;

      const context = {
        getHandler: () => handler,
        getClass: () => FleetPortalController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              role: UserRole.FLEET_PARTNER,
              activeOrganizationId: organization.id,
              permissions: ['fleet:read'],
            },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow();
    });
  });
});
