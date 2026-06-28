import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  DocumentStatus,
  DocumentType,
  DriverAvailabilityStatus,
  DriverVerificationStatus,
  EnergyType,
  ServiceType,
  UserRole,
  VehicleStatus,
  VehicleType,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { DriverJobsService } from '../driver-jobs/driver-jobs.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverDocumentDto, DriverLocationDto } from '../drivers/drivers.dto';
import { DriversService } from '../drivers/drivers.service';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { CancelRideDto, CompleteRideDto, VerifyRideOtpDto } from '../rides/rides.dto';
import { RidesService } from '../rides/rides.service';
import { CreateVehicleDto, UpdateVehicleDto, VehicleDocumentDto } from '../vehicles/vehicles.dto';
import { VehiclesService } from '../vehicles/vehicles.service';
import { EmergencyContact, VehicleDocument } from '../database/entities';
import {
  CompatDriverPreferencesDto,
  CompatDriverPresenceDto,
  CompatRejectJobDto,
  CompatUpdateVehicleDto,
} from './compatibility.dto';

@ApiTags('Driver Compatibility API')
@ApiBearerAuth()
@Controller('drivers/me')
@Roles(UserRole.DRIVER, UserRole.ADMIN)
export class DriverCompatibilityController {
  constructor(
    private readonly drivers: DriversService,
    private readonly rides: RidesService,
    private readonly driverJobs: DriverJobsService,
    private readonly vehicles: VehiclesService,
    private readonly financial: FinancialOperationsService,
    @InjectRepository(EmergencyContact)
    private readonly emergencyContactRepo: Repository<EmergencyContact>,
  ) {}

  @Post('presence/online')
  async online(@CurrentUser() user: AuthUser, @Body() dto: CompatDriverPresenceDto) {
    if (dto.location) {
      await this.drivers.updateLocation(user.id, dto.location as DriverLocationDto).catch(() => undefined);
    }
    const driver = await this.drivers.setAvailability(user.id, {
      status: DriverAvailabilityStatus.ONLINE,
      vehicleId: dto.vehicleId,
    });
    return {
      status: driver.availabilityStatus === DriverAvailabilityStatus.ONLINE ? 'online' : 'offline',
      requiresConfirmation: false,
      redirectPath: '/driver/dashboard/online',
    };
  }

  @Post('presence/offline')
  async offline(@CurrentUser() user: AuthUser) {
    await this.drivers.setAvailability(user.id, { status: DriverAvailabilityStatus.OFFLINE });
    return { status: 'offline', requiresConfirmation: false };
  }

  @Post('location/heartbeat')
  heartbeat(@CurrentUser() user: AuthUser, @Body() dto: DriverLocationDto) {
    return this.drivers.updateLocation(user.id, dto);
  }

  @Get('bootstrap')
  async bootstrap(@CurrentUser() user: AuthUser) {
    const [profile, vehicles, documents, emergencyContacts] = await Promise.all([
      this.drivers.me(user.id),
      this.vehicles.listMine(user.id),
      this.drivers.listDocuments(user.id),
      this.emergencyContactRepo.find({ where: { userId: user.id } }),
    ]);
    const driver = profile.driver;
    const hasEmergencyContact = emergencyContacts.length > 0;

    // Verify the required driver document types are present, VERIFIED, and not expired.
    const now = new Date();
    const requiredDriverTypes = [
      DocumentType.NATIONAL_ID,
      DocumentType.DRIVING_LICENSE_FRONT,
      DocumentType.GOOD_CONDUCT,
    ];
    const hasRequiredDriverDocuments = requiredDriverTypes.every((type) =>
      documents.some(
        (d) =>
          d.type === type && d.status === DocumentStatus.VERIFIED && (!d.expiryDate || d.expiryDate > now),
      ),
    );

    // Verify the active/current vehicle has the required vehicle documents.
    const activeVehicle = driver.currentVehicleId
      ? vehicles.find((v) => v.id === driver.currentVehicleId) || vehicles[0]
      : vehicles[0];
    const activeVehicleDocuments = activeVehicle ? await this.vehicles.listDocuments(activeVehicle.id) : [];
    const requiredVehicleTypes = [DocumentType.VEHICLE_INSURANCE, DocumentType.VEHICLE_INSPECTION];
    const hasRequiredVehicleDocuments = activeVehicle
      ? requiredVehicleTypes.every((type) =>
          activeVehicleDocuments.some(
            (d) =>
              d.type === type &&
              d.status === DocumentStatus.VERIFIED &&
              (!d.expiryDate || d.expiryDate > now),
          ),
        )
      : false;

    const vehicleIsActive = Boolean(
      activeVehicle && activeVehicle.status === VehicleStatus.ACTIVE && activeVehicle.isActive,
    );
    const coreReady =
      driver.verificationStatus === DriverVerificationStatus.VERIFIED &&
      vehicleIsActive &&
      hasEmergencyContact;
    const onboarding = {
      userId: user.id,
      driverId: driver.id,
      isAuthenticated: true,
      hasSelectedService: Boolean(driver.serviceCapabilities?.length),
      hasSelectedServiceCategories: Boolean(driver.serviceCapabilities?.length),
      hasProfile: true,
      hasOperationArea: true,
      hasActiveVehicle: vehicleIsActive,
      hasRequiredDriverDocuments,
      hasRequiredVehicleDocuments,
      hasEmergencyContact,
      hasCompletedTutorials: coreReady,
      onboardingCompleted: coreReady,
      nextRequiredStep: null,
      redirectTo: '/driver/dashboard/offline',
      redirectPath: '/driver/dashboard/offline',
      checkpoints: {
        roleSelected: Boolean(driver.serviceCapabilities?.length),
        documentsVerified: hasRequiredDriverDocuments,
        identityVerified: driver.verificationStatus === DriverVerificationStatus.VERIFIED,
        vehicleReady: vehicleIsActive && hasRequiredVehicleDocuments,
        emergencyContactReady: hasEmergencyContact,
        trainingCompleted: coreReady,
        onboardingComplete: coreReady,
      },
    };

    const profilePrefs = (driver.preferences?.profile ?? {}) as Record<string, unknown>;
    return {
      profile: {
        id: driver.id,
        fullName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
        email: user.email || '',
        phone: user.phone || '',
        city: (profilePrefs.city as string) || '',
        country: (profilePrefs.country as string) || (user as any).countryCode || 'UG',
        dateOfBirth: (profilePrefs.dateOfBirth as string) || null,
        streetAddress: (profilePrefs.streetAddress as string) || '',
        district: (profilePrefs.district as string) || '',
        postalCode: (profilePrefs.postalCode as string) || '',
        landmark: (profilePrefs.landmark as string) || '',
        nationalIdNumber: '',
        profilePhoto: (user as any).avatarUrl || null,
        serviceMode: driver.serviceCapabilities?.[0] || null,
        status: driver.availabilityStatus.toLowerCase(),
        onboardingStatus: driver.verificationStatus,
      },
      preferences: {
        areaIds: (driver.preferences?.areaIds as string[])?.length
          ? (driver.preferences?.areaIds as string[])
          : ['DEFAULT'],
        serviceIds: driver.serviceCapabilities || [],
        requirementIds: [],
      },
      onboardingStatus: onboarding,
      vehicles: vehicles.map((v) => this.mapVehicle(v)),
      documents: documents.map((d) => ({
        id: d.id,
        userId: user.id,
        userType: 'DRIVER',
        documentType: d.type,
        fileUrl: d.fileUrl,
        status: d.status,
        expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
        uploadedAt: d.createdAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
      })),
      presence: { status: driver.availabilityStatus.toLowerCase() },
    };
  }

  @Get('preferences')
  async preferences(@CurrentUser() user: AuthUser) {
    const driver = await this.drivers.getByUserId(user.id);
    return {
      areaIds: [],
      serviceIds: driver.serviceCapabilities || [],
      requirementIds: [],
      ...(driver.preferences || {}),
    };
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: CompatDriverPreferencesDto) {
    return this.drivers.updatePreferences(user.id, dto.preferences);
  }

  @Patch()
  async updateDriverProfile(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      phone?: string;
      city?: string;
      country?: string;
      dateOfBirth?: string;
      streetAddress?: string;
      district?: string;
      postalCode?: string;
      landmark?: string;
    },
  ) {
    const profile = await this.drivers.updateProfile(user.id, body);
    return {
      id: user.id,
      userId: user.id,
      ...profile,
    };
  }

  @Get('vehicles')
  async vehicleList(@CurrentUser() user: AuthUser) {
    const vehicles = await this.vehicles.listMine(user.id);
    return vehicles.map((v) => this.mapVehicle(v));
  }

  @Post('vehicles')
  async createVehicle(@CurrentUser() user: AuthUser, @Body() raw: CompatUpdateVehicleDto) {
    const patch = this.mapFrontendVehiclePatch(raw as UpdateVehicleDto & Record<string, unknown>);
    // The frontend does not send all required creation fields; provide sensible defaults.
    const dto: CreateVehicleDto = {
      make: patch.make || 'Unknown',
      model: patch.model || 'Unknown',
      year: patch.year ?? new Date().getFullYear(),
      plateNumber: patch.plateNumber || 'UNKNOWN',
      vehicleType: patch.vehicleType ?? VehicleType.SEDAN,
      energyType: patch.energyType ?? EnergyType.INTERNAL_COMBUSTION,
      seats: patch.seats ?? 4,
      serviceCapabilities: patch.serviceCapabilities ?? [],
      ...(patch.cargoCapacityKg !== undefined && { cargoCapacityKg: patch.cargoCapacityKg }),
      ...(patch.color !== undefined && { color: patch.color }),
      ...(patch.imageUrl !== undefined && { imageUrl: patch.imageUrl }),
      ...(patch.features !== undefined && { features: patch.features }),
      ...(patch.dailyRentalRate !== undefined && { dailyRentalRate: patch.dailyRentalRate }),
      ...(patch.includedDailyKm !== undefined && { includedDailyKm: patch.includedDailyKm }),
      ...(patch.extraKmRate !== undefined && { extraKmRate: patch.extraKmRate }),
      ...(patch.isActive !== undefined && { isActive: patch.isActive }),
    } as CreateVehicleDto;
    const vehicle = await this.vehicles.create(user.id, dto);
    return this.mapVehicle(vehicle);
  }

  @Patch('vehicles/:vehicleId')
  async updateVehicle(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() raw: CompatUpdateVehicleDto,
  ) {
    const payload = this.mapFrontendVehiclePatch(raw as UpdateVehicleDto & Record<string, unknown>);
    const vehicle = await this.vehicles.update(user.id, vehicleId, payload);
    return this.mapVehicle(vehicle);
  }

  @Patch('active-vehicle')
  async activateVehicle(@CurrentUser() user: AuthUser, @Body() dto: CompatDriverPresenceDto) {
    if (!dto.vehicleId) {
      const vehicles = await this.vehicles.listMine(user.id);
      return vehicles.map((v) => this.mapVehicle(v));
    }
    const vehicle = await this.vehicles.activate(user.id, dto.vehicleId);
    return this.mapVehicle(vehicle);
  }

  @Patch('documents/:documentId')
  async updateDriverDocument(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Body() dto: DriverDocumentDto,
  ) {
    const updated = await this.drivers.updateDocument(user.id, documentId, dto);
    return {
      id: updated.id,
      userId: user.id,
      userType: 'DRIVER',
      documentType: updated.type,
      fileUrl: updated.fileUrl,
      status: updated.status,
      expiryDate: updated.expiryDate ? updated.expiryDate.toISOString() : null,
      uploadedAt: updated.createdAt.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    };
  }

  @Post('vehicles/:vehicleId/documents')
  async uploadVehicleDocument(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: VehicleDocumentDto,
  ) {
    const document = await this.vehicles.addDocument(user.id, vehicleId, dto);
    return {
      id: document.id,
      vehicleId: document.vehicleId,
      documentType: document.type,
      fileUrl: document.fileUrl,
      status: document.status,
      expiryDate: document.expiryDate ? document.expiryDate.toISOString() : null,
      createdAt: document.createdAt.toISOString(),
    };
  }

  @Patch('vehicles/:vehicleId/documents/:documentId')
  async patchVehicleDocument(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string,
    @Body() dto: VehicleDocumentDto,
  ) {
    const document = await this.vehicles.updateDocument(user.id, vehicleId, documentId, dto);
    return {
      id: document.id,
      vehicleId: document.vehicleId,
      documentType: document.type,
      fileUrl: document.fileUrl,
      status: document.status,
      expiryDate: document.expiryDate ? document.expiryDate.toISOString() : null,
      createdAt: document.createdAt.toISOString(),
    };
  }

  @Get('jobs')
  async jobs(@CurrentUser() user: AuthUser) {
    const { items } = await this.driverJobs.listOffers(user.id, undefined);
    return items.map((job: any) => this.mapJob(job));
  }

  @Post('jobs/:jobId/accept')
  async accept(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    const result = await this.driverJobs.accept(
      { id: user.id, role: user.role, email: user.email, phone: user.phone } as AuthUser,
      jobId,
      {} as any,
    );
    const job = this.mapJob(result.job);
    const trip = result.assignment ? this.mapTripFromRideDetail(result.assignment) : undefined;
    return { job, trip };
  }

  @Post('jobs/:jobId/reject')
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: CompatRejectJobDto,
  ) {
    await this.driverJobs.decline(user.id, jobId, { reason: dto.reason } as any);
    return { declined: true, offerId: jobId, reason: dto.reason };
  }

  @Get('trips')
  async trips(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    const list = await this.rides.list(user, 'all', Number(cursor || 1), 20);
    return {
      items: list.items.map((ride: any) => this.mapTripFromRide(ride)),
      nextCursor: list.meta.pageCount > list.meta.page ? String(list.meta.page + 1) : null,
    };
  }

  @Get('trips/active')
  async activeTrip(@CurrentUser() user: AuthUser) {
    const list = await this.rides.list(user, 'active', 1, 1);
    const ride = list.items[0];
    if (!ride) return null;
    const detail = await this.rides.detailForUser(user.id, ride.id, user.role);
    return this.mapTripFromRideDetail(detail);
  }

  @Get('trips/:tripId')
  trip(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.rides.detailForUser(user.id, tripId, user.role).then((d) => this.mapTripFromRideDetail(d));
  }

  @Post('trips/:tripId/arrive')
  arrive(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.rides.arrive(user.id, tripId).then((d) => this.mapTripActionResult(d));
  }

  @Post('trips/:tripId/verify-rider')
  verify(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string, @Body() dto: VerifyRideOtpDto) {
    return this.rides.verifyOtp(user.id, tripId, dto.code).then((d) => this.mapTripActionResult(d));
  }

  @Post('trips/:tripId/start')
  start(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.rides.start(user.id, tripId).then((d) => this.mapTripActionResult(d));
  }

  @Post('trips/:tripId/complete')
  complete(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string, @Body() dto: CompleteRideDto) {
    return this.rides.complete(user.id, tripId, dto).then((d) => this.mapTripActionResult(d));
  }

  @Post('trips/:tripId/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string, @Body() dto: CancelRideDto) {
    return this.rides.cancel(user, tripId, dto).then((d) => this.mapTripActionResult(d));
  }

  @Get('earnings/summary')
  earnings(@CurrentUser() user: AuthUser, @Query('period') period = 'week') {
    return this.drivers.dashboard(user.id).then((d: any) => ({
      period,
      total: d?.totalEarnings ?? 0,
      currency: 'UGX',
      count: d?.completedTrips ?? 0,
    }));
  }

  @Get('wallet')
  wallet(@CurrentUser() user: AuthUser) {
    return { availableBalance: 0, pendingBalance: 0, balance: 0, currency: 'UGX', lastUpdatedAt: Date.now() };
  }

  @Get('earnings/events')
  events() {
    return [];
  }

  @Get('notifications')
  notifications() {
    return [];
  }

  @Get('emergency-contacts')
  async emergencyContacts(@CurrentUser() user: AuthUser) {
    const items = await this.emergencyContactRepo.find({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      phone: item.phone,
      relationship: item.relationship,
      isPrimary: item.isPrimary,
    }));
  }

  @Post('emergency-contacts')
  async createEmergencyContact(@CurrentUser() user: AuthUser, @Body() body: { name: string; phone: string; relationship?: string; isPrimary?: boolean }) {
    const item = await this.emergencyContactRepo.save(
      this.emergencyContactRepo.create({
        userId: user.id,
        name: body.name,
        phone: body.phone,
        relationship: body.relationship,
        isPrimary: body.isPrimary ?? false,
      }),
    );
    return {
      id: item.id,
      name: item.name,
      phone: item.phone,
      relationship: item.relationship,
      isPrimary: item.isPrimary,
    };
  }

  @Patch('emergency-contacts/:id')
  async updateEmergencyContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { name?: string; phone?: string; relationship?: string; isPrimary?: boolean },
  ) {
    const item = await this.emergencyContactRepo.findOne({ where: { id, userId: user.id } });
    if (!item) throw new NotFoundException('Emergency contact not found');
    if (body.name !== undefined) item.name = body.name;
    if (body.phone !== undefined) item.phone = body.phone;
    if (body.relationship !== undefined) item.relationship = body.relationship;
    if (body.isPrimary !== undefined) item.isPrimary = body.isPrimary;
    const updated = await this.emergencyContactRepo.save(item);
    return {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      relationship: updated.relationship,
      isPrimary: updated.isPrimary,
    };
  }

  @Delete('emergency-contacts/:id')
  async deleteEmergencyContact(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const item = await this.emergencyContactRepo.findOne({ where: { id, userId: user.id } });
    if (!item) throw new NotFoundException('Emergency contact not found');
    await this.emergencyContactRepo.remove(item);
    return { deleted: true };
  }

  @Get('documents/status')
  async documentStatus(@CurrentUser() user: AuthUser) {
    const docs = await this.drivers.listDocuments(user.id);
    const completed = docs.map((d) => d.type);
    return { required: [], completed, missing: [], hasBlockingIssues: false };
  }

  @Get('onboarding/status')
  async onboardingStatus(@CurrentUser() user: AuthUser) {
    const bootstrap = await this.bootstrap(user);
    return bootstrap.onboardingStatus;
  }

  @Get('onboarding/checkpoints')
  async onboardingCheckpoints(@CurrentUser() user: AuthUser) {
    const bootstrap = await this.bootstrap(user);
    return bootstrap.onboardingStatus.checkpoints;
  }

  private mapVehicle(v: any) {
    return {
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      plate: v.plateNumber,
      type: v.vehicleType,
      status: v.status === 'ACTIVE' ? 'active' : v.status.toLowerCase(),
      accessories: v.features || {},
      imageKey: v.imageUrl || '',
      imageUrl: v.imageUrl || '',
      batterySize: '',
      color: v.color || '',
      range: '',
      isActive: v.status === 'ACTIVE' || v.isActive === true,
      documents: this.mapVehicleDocuments(v.documents),
    };
  }

  private mapVehicleDocuments(documents?: VehicleDocument[] | null): Record<string, unknown> | null {
    if (!Array.isArray(documents) || documents.length === 0) {
      return null;
    }
    return documents.reduce<Record<string, unknown>>((acc, document) => {
      const key = this.toVehicleDocumentKey(document.type);
      acc[key] = {
        fileUrl: document.fileUrl,
        expiryDate: document.expiryDate ? document.expiryDate.toISOString() : null,
        issueDate: document.issueDate ? document.issueDate.toISOString() : null,
        status: document.status,
        type: document.type,
      };
      return acc;
    }, {});
  }

  private toVehicleDocumentKey(type: DocumentType): string {
    switch (type) {
      case DocumentType.VEHICLE_INSURANCE:
        return 'insurance';
      case DocumentType.VEHICLE_INSPECTION:
        return 'inspection';
      case DocumentType.VEHICLE_LOGBOOK:
        return 'logbook';
      case DocumentType.ROAD_LICENSE:
        return 'registration';
      default:
        return String(type).toLowerCase();
    }
  }

  private mapJob(job: any) {
    const pickup = job.pickup || {};
    const destination = job.destination || job.dropoff || {};
    return {
      id: job.id ?? job.offerId ?? job.matchingJobId,
      type: (job.serviceType || 'RIDE').toLowerCase(),
      status: (job.status || 'pending').toLowerCase(),
      pickup: typeof pickup === 'string' ? pickup : pickup.address || 'Pickup',
      dropoff: typeof destination === 'string' ? destination : destination.address || 'Dropoff',
      requestedAt: job.offeredAt ? new Date(job.offeredAt).getTime() : Date.now(),
      tripId: job.serviceId || job.serviceType,
      routeId: null,
      orderId: null,
      route: job.route || {
        distanceKm: job.distanceToPickupMeters ? job.distanceToPickupMeters / 1000 : 0,
        durationMinutes: 0,
      },
      estimatedFare: job.estimatedFare ?? 0,
      routeSummary: '',
      requiresPickupOtp: false,
      requiresDropoffQr: false,
      riderName: job.metadata?.riderName || null,
      riderPhone: job.metadata?.riderPhone || null,
      pickupLocation: pickup.latitude != null ? { lat: pickup.latitude, lng: pickup.longitude } : null,
      dropoffLocation:
        destination.latitude != null ? { lat: destination.latitude, lng: destination.longitude } : null,
      nextStopId: null,
      stops: [],
    };
  }

  private mapTripFromRide(ride: any) {
    return {
      id: ride.id,
      type: 'ride',
      status: this.mapRideStatus(ride.status),
      pickup: ride.pickupAddress || 'Pickup',
      dropoff: ride.dropoffAddress || 'Dropoff',
      requestedAt: new Date(ride.createdAt).getTime(),
      updatedAt: new Date(ride.updatedAt).getTime(),
      startedAt: ride.startedAt ? new Date(ride.startedAt).getTime() : undefined,
      completedAt: ride.completedAt ? new Date(ride.completedAt).getTime() : undefined,
      fare: ride.estimatedFare ?? 0,
      riderName: null,
      riderPhone: null,
      pickupLocation: null,
      dropoffLocation: null,
      otpCode: null,
      route: { distanceKm: ride.estimatedDistanceKm, durationMinutes: ride.estimatedDurationMinutes },
    };
  }

  private mapTripFromRideDetail(detail: any) {
    const ride = detail?.ride || detail;
    const pickup = detail?.stops?.find((s: any) => s.type === 'PICKUP') || ride?.pickup || {};
    const destination = detail?.stops?.find((s: any) => s.type === 'DROPOFF') || ride?.destination || {};
    const driverUser = detail?.driver?.user || detail?.driver || {};
    return {
      id: ride.id,
      type: 'ride',
      status: this.mapRideStatus(ride.status),
      pickup: typeof pickup === 'string' ? pickup : pickup.address || 'Pickup',
      dropoff: typeof destination === 'string' ? destination : destination.address || 'Dropoff',
      requestedAt: new Date(ride.createdAt).getTime(),
      updatedAt: new Date(ride.updatedAt).getTime(),
      startedAt: ride.startedAt ? new Date(ride.startedAt).getTime() : undefined,
      completedAt: ride.completedAt ? new Date(ride.completedAt).getTime() : undefined,
      fare: ride.estimatedFare ?? 0,
      riderName: detail?.rider
        ? `${detail.rider.firstName ?? ''} ${detail.rider.lastName ?? ''}`.trim()
        : null,
      riderPhone: detail?.rider?.phone || null,
      pickupLocation:
        pickup.latitude != null ? { lat: Number(pickup.latitude), lng: Number(pickup.longitude) } : null,
      dropoffLocation:
        destination.latitude != null
          ? { lat: Number(destination.latitude), lng: Number(destination.longitude) }
          : null,
      otpCode: null,
      route: { distanceKm: ride.estimatedDistanceKm, durationMinutes: ride.estimatedDurationMinutes },
      driver: {
        name: `${driverUser.firstName ?? ''} ${driverUser.lastName ?? ''}`.trim(),
        phone: driverUser.phone,
        vehicle: detail?.vehicle ? `${detail.vehicle.make} ${detail.vehicle.model}` : '',
        plate: detail?.vehicle?.plateNumber,
      },
    };
  }

  private mapFrontendVehiclePatch(raw: UpdateVehicleDto & Record<string, unknown>): UpdateVehicleDto {
    const normalize = (value: unknown) => (typeof value === 'string' ? value.toUpperCase() : value);
    const result: UpdateVehicleDto = {};
    if (raw.make !== undefined) result.make = raw.make;
    if (raw.model !== undefined) result.model = raw.model;
    if (raw.year !== undefined) result.year = raw.year;
    if (raw.plateNumber !== undefined || raw.plate !== undefined) {
      result.plateNumber = ((raw.plateNumber ?? raw.plate) as string).toUpperCase();
    }
    if (raw.vehicleType !== undefined || raw.type !== undefined) {
      const rawType = normalize(raw.vehicleType ?? raw.type) as string;
      // The driver app uses simplified category labels that do not match the
      // backend VehicleType enum exactly (e.g. "CAR" is not a valid enum value).
      const typeMap: Record<string, VehicleType> = {
        CAR: VehicleType.SEDAN,
        MOTORCYCLE: VehicleType.MOTORCYCLE,
        VAN: VehicleType.VAN,
      };
      result.vehicleType = typeMap[rawType] ?? (rawType as VehicleType);
    }
    if (raw.energyType !== undefined) result.energyType = normalize(raw.energyType) as any;
    if (raw.seats !== undefined) result.seats = raw.seats;
    if (raw.cargoCapacityKg !== undefined) result.cargoCapacityKg = raw.cargoCapacityKg;
    if (raw.color !== undefined) result.color = raw.color;
    if (raw.imageUrl !== undefined) result.imageUrl = raw.imageUrl;
    if (raw.serviceCapabilities !== undefined)
      result.serviceCapabilities = raw.serviceCapabilities as ServiceType[];
    if (raw.features !== undefined) result.features = raw.features;
    if (raw.accessories != null) result.features = raw.accessories as Record<string, unknown>;
    if (raw.dailyRentalRate !== undefined) result.dailyRentalRate = raw.dailyRentalRate;
    if (raw.includedDailyKm !== undefined) result.includedDailyKm = raw.includedDailyKm;
    if (raw.extraKmRate !== undefined) result.extraKmRate = raw.extraKmRate;
    if (raw.isActive !== undefined) result.isActive = Boolean(raw.isActive);
    if (raw.status !== undefined) {
      const upperStatus = normalize(raw.status) as string;
      if (['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(upperStatus)) {
        (result as any).status = upperStatus;
      }
    }
    return result;
  }

  private mapTripActionResult(detail: any) {
    const ride = detail?.ride || detail;
    return {
      id: ride?.id,
      status: this.mapRideStatus(ride?.status),
      updatedAt: new Date(ride?.updatedAt || Date.now()).getTime(),
      startedAt: ride?.startedAt ? new Date(ride.startedAt).getTime() : undefined,
      completedAt: ride?.completedAt ? new Date(ride.completedAt).getTime() : undefined,
    };
  }

  private mapRideStatus(status?: string): string {
    if (!status) return 'navigating';
    const s = status.toUpperCase();
    if (s === 'DRIVER_EN_ROUTE') return 'en_route';
    if (s === 'ARRIVED' || s === 'WAITING' || s === 'VERIFIED') return 'arrived';
    if (s === 'IN_PROGRESS') return 'in_progress';
    if (s === 'COMPLETED') return 'completed';
    if (s === 'CANCELLED') return 'cancelled';
    return 'pending';
  }
}
