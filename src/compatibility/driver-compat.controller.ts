import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DocumentStatus, DriverAvailabilityStatus, DriverVerificationStatus, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { DriverJobsService } from '../driver-jobs/driver-jobs.service';
import { DriverLocationDto } from '../drivers/drivers.dto';
import { DriversService } from '../drivers/drivers.service';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { CancelRideDto, CompleteRideDto, VerifyRideOtpDto } from '../rides/rides.dto';
import { RidesService } from '../rides/rides.service';
import { CreateVehicleDto, UpdateVehicleDto } from '../vehicles/vehicles.dto';
import { VehiclesService } from '../vehicles/vehicles.service';
import { CompatDriverPreferencesDto, CompatDriverPresenceDto, CompatRejectJobDto } from './compatibility.dto';

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
    const [profile, vehicles, documents] = await Promise.all([
      this.drivers.me(user.id),
      this.vehicles.listMine(user.id),
      this.drivers.listDocuments(user.id),
    ]);
    const driver = profile.driver;
    const onboarding = {
      userId: user.id,
      driverId: driver.id,
      isAuthenticated: true,
      hasSelectedService: Boolean(driver.serviceCapabilities?.length),
      hasSelectedServiceCategories: Boolean(driver.serviceCapabilities?.length),
      hasProfile: true,
      hasOperationArea: true,
      hasActiveVehicle: Boolean(driver.currentVehicleId),
      hasRequiredDriverDocuments: documents.some((d) => d.status === DocumentStatus.VERIFIED),
      hasRequiredVehicleDocuments: true,
      hasCompletedTutorials: driver.verificationStatus === DriverVerificationStatus.VERIFIED && Boolean(driver.currentVehicleId),
      onboardingCompleted: driver.verificationStatus === DriverVerificationStatus.VERIFIED && Boolean(driver.currentVehicleId),
      nextRequiredStep: null,
      redirectTo: '/driver/dashboard/offline',
      redirectPath: '/driver/dashboard/offline',
      checkpoints: {
        roleSelected: Boolean(driver.serviceCapabilities?.length),
        documentsVerified: documents.some((d) => d.status === DocumentStatus.VERIFIED),
        identityVerified: driver.verificationStatus === DriverVerificationStatus.VERIFIED,
        vehicleReady: Boolean(driver.currentVehicleId),
        emergencyContactReady: driver.verificationStatus === DriverVerificationStatus.VERIFIED && Boolean(driver.currentVehicleId),
        trainingCompleted: driver.verificationStatus === DriverVerificationStatus.VERIFIED && Boolean(driver.currentVehicleId),
        onboardingComplete: driver.verificationStatus === DriverVerificationStatus.VERIFIED && Boolean(driver.currentVehicleId),
      },
    };

    return {
      profile: {
        id: driver.id,
        fullName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
        email: user.email || '',
        phone: user.phone || '',
        city: '',
        country: (user as any).countryCode || 'UG',
        dateOfBirth: null,
        streetAddress: '',
        district: '',
        postalCode: '',
        landmark: '',
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

  @Get('vehicles')
  async vehicleList(@CurrentUser() user: AuthUser) {
    const vehicles = await this.vehicles.listMine(user.id);
    return vehicles.map((v) => this.mapVehicle(v));
  }

  @Post('vehicles')
  async createVehicle(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    const vehicle = await this.vehicles.create(user.id, dto);
    return this.mapVehicle(vehicle);
  }

  @Patch('vehicles/:vehicleId')
  async updateVehicle(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    const vehicle = await this.vehicles.update(user.id, vehicleId, dto);
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

  @Get('jobs')
  async jobs(@CurrentUser() user: AuthUser) {
    const { items } = await this.driverJobs.listOffers(user.id, undefined);
    return items.map((job: any) => this.mapJob(job));
  }

  @Post('jobs/:jobId/accept')
  async accept(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    const result = await this.driverJobs.accept({ id: user.id, role: user.role, email: user.email, phone: user.phone } as AuthUser, jobId, {} as any);
    const job = this.mapJob(result.job);
    const trip = result.assignment ? this.mapTripFromRideDetail(result.assignment) : undefined;
    return { job, trip };
  }

  @Post('jobs/:jobId/reject')
  async reject(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: CompatRejectJobDto) {
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
  emergencyContacts() {
    return [];
  }

  @Post('emergency-contacts')
  createEmergencyContact(@Body() body: any) {
    return { id: 'new', ...body };
  }

  @Patch('emergency-contacts/:id')
  updateEmergencyContact(@Param('id') id: string, @Body() body: any) {
    return { id, ...body };
  }

  @Delete('emergency-contacts/:id')
  deleteEmergencyContact() {
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
      documents: v.documents || null,
    };
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
      route: job.route || { distanceKm: job.distanceToPickupMeters ? job.distanceToPickupMeters / 1000 : 0, durationMinutes: 0 },
      estimatedFare: job.estimatedFare ?? 0,
      routeSummary: '',
      requiresPickupOtp: false,
      requiresDropoffQr: false,
      riderName: job.metadata?.riderName || null,
      riderPhone: job.metadata?.riderPhone || null,
      pickupLocation: pickup.latitude != null ? { lat: pickup.latitude, lng: pickup.longitude } : null,
      dropoffLocation: destination.latitude != null ? { lat: destination.latitude, lng: destination.longitude } : null,
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
      riderName: detail?.rider ? `${detail.rider.firstName ?? ''} ${detail.rider.lastName ?? ''}`.trim() : null,
      riderPhone: detail?.rider?.phone || null,
      pickupLocation: pickup.latitude != null ? { lat: Number(pickup.latitude), lng: Number(pickup.longitude) } : null,
      dropoffLocation: destination.latitude != null ? { lat: Number(destination.latitude), lng: Number(destination.longitude) } : null,
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
