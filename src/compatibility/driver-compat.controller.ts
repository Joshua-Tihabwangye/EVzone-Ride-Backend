/* eslint-disable */
// @ts-nocheck
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  VehicleType,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { DriverJobsService } from '../driver-jobs/driver-jobs.service';
import { DriverLocationDto } from '../drivers/drivers.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DriversService } from '../drivers/drivers.service';
import { UsersService } from '../users/users.service';
import {
  DriverDocument,
  DriverProfile,
  DriverSocialLink,
  EmergencyContact,
  VehicleDocument,
} from '../database/entities';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { CancelRideDto, CompleteRideDto, VerifyRideOtpDto } from '../rides/rides.dto';
import { RidesService } from '../rides/rides.service';
import { CreateVehicleDto, UpdateVehicleDto, VehicleDocumentDto } from '../vehicles/vehicles.dto';
import { VehiclesService } from '../vehicles/vehicles.service';
import {
  CompatDriverPreferencesDto,
  CompatDriverPresenceDto,
  CompatDriverProfilePatchDto,
  CompatDriverServiceCapabilitiesDto,
  CompatRejectJobDto,
  CompatSocialLinkDto,
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
    private readonly users: UsersService,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(DriverDocument) private readonly driverDocuments: Repository<DriverDocument>,
    @InjectRepository(VehicleDocument) private readonly vehicleDocuments: Repository<VehicleDocument>,
    @InjectRepository(EmergencyContact) private readonly emergencyContactsRepo: Repository<EmergencyContact>,
    @InjectRepository(DriverSocialLink) private readonly socialLinksRepo: Repository<DriverSocialLink>,
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

  @Get()
  async profile(@CurrentUser() user: AuthUser) {
    const { driver } = await this.drivers.me(user.id);
    return {
      id: driver.id,
      fullName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
      email: user.email || '',
      phone: user.phone || '',
      city: (driver.preferences?.city as string) || '',
      country: (driver.preferences?.country as string) || (user as any).countryCode || 'UG',
      dateOfBirth: (driver.preferences?.dateOfBirth as string) || null,
      streetAddress: (driver.preferences?.streetAddress as string) || '',
      district: (driver.preferences?.district as string) || '',
      postalCode: (driver.preferences?.postalCode as string) || '',
      landmark: (driver.preferences?.landmark as string) || '',
      nationalIdNumber: (driver.preferences?.nationalIdNumber as string) || '',
      profilePhoto: (user as any).avatarUrl || null,
      serviceMode: driver.serviceCapabilities?.[0] || null,
      status: driver.availabilityStatus.toLowerCase(),
      onboardingStatus: driver.verificationStatus,
    };
  }

  @Patch()
  async patchProfile(@CurrentUser() user: AuthUser, @Body() dto: CompatDriverProfilePatchDto) {
    const nameParts = dto.fullName?.trim().split(/\s+/) || [];
    await this.users.updateProfile(user.id, {
      firstName: nameParts[0] || user.firstName,
      lastName: nameParts.slice(1).join(' ') || user.lastName,
      phone: dto.phone,
      avatarUrl: dto.profilePhoto,
    });
    let driver = await this.driverProfiles.findOne({ where: { userId: user.id } });
    if (!driver) {
      driver = this.driverProfiles.create({
        userId: user.id,
        serviceCapabilities: [ServiceType.RIDE],
        verificationStatus: DriverVerificationStatus.PENDING,
        availabilityStatus: DriverAvailabilityStatus.OFFLINE,
      });
    }
    if (
      dto.city ||
      dto.country ||
      dto.streetAddress ||
      dto.district ||
      dto.landmark ||
      dto.postalCode ||
      dto.dateOfBirth ||
      dto.nationalIdNumber
    ) {
      driver.preferences = {
        ...(driver.preferences || {}),
        city: dto.city,
        country: dto.country,
        streetAddress: dto.streetAddress,
        district: dto.district,
        landmark: dto.landmark,
        postalCode: dto.postalCode,
        dateOfBirth: dto.dateOfBirth,
        nationalIdNumber: dto.nationalIdNumber,
      };
    }
    if (typeof dto.trainingCompleted === 'boolean') {
      driver.trainingCompleted = dto.trainingCompleted;
    }
    await this.driverProfiles.save(driver);
    return this.profile(user);
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

    // Eagerly load vehicle documents so the mobile app can rehydrate uploaded
    // insurance, inspection and ownership docs after a refresh.
    const vehicleIds = (vehicles as any[]).map((v: any) => v.id);
    const vehicleDocuments = vehicleIds.length
      ? await this.vehicleDocuments.find({ where: { vehicleId: In(vehicleIds) } })
      : [];
    const documentsByVehicle = vehicleDocuments.reduce<Record<string, VehicleDocument[]>>((acc, doc) => {
      acc[doc.vehicleId] = acc[doc.vehicleId] ?? [];
      acc[doc.vehicleId].push(doc);
      return acc;
    }, {});

    const onboarding = await this.buildOnboardingStatus(user, driver, vehicles, documents);

    return {
      profile: {
        id: driver.id,
        fullName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
        email: user.email || '',
        phone: user.phone || '',
        city: (driver.preferences?.city as string) || '',
        country: (driver.preferences?.country as string) || (user as any).countryCode || 'UG',
        dateOfBirth: (driver.preferences?.dateOfBirth as string) || null,
        streetAddress: (driver.preferences?.streetAddress as string) || '',
        district: (driver.preferences?.district as string) || '',
        postalCode: (driver.preferences?.postalCode as string) || '',
        landmark: (driver.preferences?.landmark as string) || '',
        nationalIdNumber: (driver.preferences?.nationalIdNumber as string) || '',
        profilePhoto: (user as any).avatarUrl || null,
        serviceMode: driver.serviceCapabilities?.[0] || null,
        status: driver.availabilityStatus.toLowerCase(),
        onboardingStatus: driver.verificationStatus,
      },
      preferences: {
        areaIds: (driver.preferences?.areaIds as string[])?.length
          ? (driver.preferences?.areaIds as string[])
          : [],
        serviceIds: driver.serviceCapabilities || [],
        requirementIds: [],
      },
      onboardingStatus: onboarding,
      vehicles: (vehicles as any[]).map((v: any) =>
        this.mapVehicle({ ...v, documents: documentsByVehicle[v.id] }),
      ),
      documents: (documents as DriverDocument[]).map((d: DriverDocument) =>
        this.mapDriverDocument(user.id, d),
      ),
      presence: { status: driver.availabilityStatus.toLowerCase() },
    };
  }

  @Post('onboarding/complete')
  async completeOnboarding(@CurrentUser() user: AuthUser) {
    const [profile, vehicles, documents] = await Promise.all([
      this.drivers.me(user.id),
      this.vehicles.listMine(user.id),
      this.drivers.listDocuments(user.id),
    ]);
    const driver = profile.driver;

    const onboarding = await this.buildOnboardingStatus(user, driver, vehicles, documents);

    if (!onboarding.onboardingCompleted) {
      throw new BadRequestException({
        message: 'Onboarding requirements are not complete',
        code: 'ONBOARDING_INCOMPLETE',
        nextRequiredStep: onboarding.nextRequiredStep,
        redirectPath: onboarding.redirectPath,
      });
    }

    if (driver.verificationStatus !== DriverVerificationStatus.VERIFIED) {
      driver.verificationStatus = DriverVerificationStatus.VERIFIED;
      await this.driverProfiles.save(driver);
    }

    return {
      onboardingCompleted: true,
      verificationStatus: driver.verificationStatus,
      redirectPath: '/driver/dashboard/offline',
    };
  }

  private async buildOnboardingStatus(
    user: AuthUser,
    driver: DriverProfile,
    vehicles: any[],
    documents: DriverDocument[],
  ) {
    const activeVehicle =
      vehicles.find((vehicle) => vehicle.id === driver.currentVehicleId) ??
      vehicles.find((vehicle) => vehicle.isActive) ??
      null;
    const vehicleDocuments = activeVehicle
      ? await this.vehicleDocuments.find({ where: { vehicleId: activeVehicle.id } })
      : [];
    const emergencyContacts = await this.emergencyContactsRepo.count({ where: { userId: user.id } });
    const hasDocument = (type: DocumentType) =>
      documents.some((document) => document.type === type && document.status !== DocumentStatus.REJECTED);
    const hasVehicleDocument = (type: DocumentType) =>
      vehicleDocuments.some(
        (document) => document.type === type && document.status !== DocumentStatus.REJECTED,
      );
    const hasSelectedServiceCategories = Boolean(driver.serviceCapabilities?.length);
    const hasRequiredDriverDocuments =
      hasDocument(DocumentType.NATIONAL_ID) &&
      hasDocument(DocumentType.DRIVING_LICENSE_FRONT) &&
      hasDocument(DocumentType.GOOD_CONDUCT);
    const hasRequiredVehicleDocuments =
      Boolean(activeVehicle) &&
      hasVehicleDocument(DocumentType.VEHICLE_INSURANCE) &&
      hasVehicleDocument(DocumentType.VEHICLE_INSPECTION) &&
      hasVehicleDocument(DocumentType.VEHICLE_LOGBOOK) &&
      hasVehicleDocument(DocumentType.ROAD_LICENSE);
    const identityVerified =
      driver.verificationStatus === DriverVerificationStatus.VERIFIED ||
      Boolean((user as any).avatarUrl) ||
      hasDocument(DocumentType.NATIONAL_ID);
    const hasActiveVehicle = Boolean(activeVehicle);
    const hasCompletedTutorials = driver.trainingCompleted === true;
    const emergencyContactReady = emergencyContacts > 0;
    const onboardingCompleted =
      hasSelectedServiceCategories &&
      hasRequiredDriverDocuments &&
      hasRequiredVehicleDocuments &&
      identityVerified &&
      hasActiveVehicle &&
      emergencyContactReady &&
      hasCompletedTutorials;
    const nextRequiredStep = !hasSelectedServiceCategories
      ? 'SERVICE_CATEGORIES'
      : !identityVerified || !hasRequiredDriverDocuments
        ? 'DOCUMENTS'
        : !hasActiveVehicle || !hasRequiredVehicleDocuments
          ? 'VEHICLE'
          : !emergencyContactReady
            ? 'EMERGENCY_CONTACT'
            : !hasCompletedTutorials
              ? 'TRAINING'
              : null;
    const redirectPath = onboardingCompleted
      ? '/driver/dashboard/offline'
      : nextRequiredStep === 'SERVICE_CATEGORIES'
        ? '/driver/register'
        : nextRequiredStep === 'TRAINING'
          ? '/driver/training/intro'
          : '/driver/onboarding/profile';
    return {
      userId: user.id,
      driverId: driver.id,
      isAuthenticated: true,
      hasSelectedService: hasSelectedServiceCategories,
      hasSelectedServiceCategories,
      hasProfile: true,
      hasOperationArea:
        Array.isArray(driver.preferences?.areaIds) && (driver.preferences?.areaIds as unknown[]).length > 0,
      hasActiveVehicle,
      hasRequiredDriverDocuments,
      hasRequiredVehicleDocuments,
      hasCompletedTutorials,
      onboardingCompleted,
      nextRequiredStep,
      redirectTo: redirectPath,
      redirectPath,
      checkpoints: {
        roleSelected: hasSelectedServiceCategories,
        documentsVerified: hasRequiredDriverDocuments,
        identityVerified,
        vehicleReady: hasActiveVehicle && hasRequiredVehicleDocuments,
        emergencyContactReady,
        trainingCompleted: hasCompletedTutorials,
        onboardingComplete: onboardingCompleted,
      },
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

  @Patch('service-capabilities')
  async updateServiceCapabilities(
    @CurrentUser() user: AuthUser,
    @Body() dto: CompatDriverServiceCapabilitiesDto,
  ) {
    const driver = await this.drivers.getByUserId(user.id);
    driver.serviceCapabilities = dto.serviceCapabilities;
    return this.driverProfiles.save(driver);
  }

  @Get('delivery/active')
  async activeDelivery() {
    return null;
  }

  @Get('service-requests')
  async listServiceRequests() {
    // Stub: the driver app bootstrap expects this list endpoint to exist.
    // Once a driver-facing service-request repository exists, replace this with a real query.
    return [];
  }

  @Get('service-requests/active')
  async activeServiceRequest() {
    return null;
  }

  @Get('social-links')
  async socialLinks(@CurrentUser() user: AuthUser) {
    const driver = await this.drivers.getByUserId(user.id);
    return this.socialLinksRepo.find({
      where: { driverId: driver.id },
      order: { createdAt: 'ASC' },
    });
  }

  @Post('social-links')
  async createSocialLink(@CurrentUser() user: AuthUser, @Body() dto: CompatSocialLinkDto) {
    const driver = await this.drivers.getByUserId(user.id);
    return this.socialLinksRepo.save(
      this.socialLinksRepo.create({ driverId: driver.id, platform: dto.platform, url: dto.url }),
    );
  }

  @Patch('social-links/:linkId')
  async updateSocialLink(
    @CurrentUser() user: AuthUser,
    @Param('linkId') linkId: string,
    @Body() dto: CompatSocialLinkDto,
  ) {
    const driver = await this.drivers.getByUserId(user.id);
    const link = await this.socialLinksRepo.findOne({ where: { id: linkId, driverId: driver.id } });
    if (!link) throw new NotFoundException('Social link not found');
    link.platform = dto.platform;
    link.url = dto.url;
    return this.socialLinksRepo.save(link);
  }

  @Delete('social-links/:linkId')
  async deleteSocialLink(@CurrentUser() user: AuthUser, @Param('linkId') linkId: string) {
    const driver = await this.drivers.getByUserId(user.id);
    const result = await this.socialLinksRepo.softDelete({ id: linkId, driverId: driver.id });
    if (result.affected === 0) throw new NotFoundException('Social link not found');
    return { success: true };
  }

  @Get('vehicles')
  async vehicleList(@CurrentUser() user: AuthUser) {
    const vehicles = await this.vehicles.listMine(user.id);
    return vehicles.map((v) => this.mapVehicle(v));
  }

  @Post('vehicles')
  async createVehicle(@CurrentUser() user: AuthUser, @Body() dto: any) {
    const plate = (dto.plateNumber ?? dto.plate ?? '').toString().trim().toUpperCase();
    // If the driver already has a vehicle with this plate (e.g. retry after a
    // partial save, or seeded data), update it instead of failing on the unique
    // index.
    if (plate) {
      const existing = await this.vehicles.listMine(user.id);
      const matched = existing.find((v) => v.plateNumber.toUpperCase() === plate);
      if (matched) {
        const vehicle = await this.vehicles.update(
          user.id,
          matched.id,
          this.toVehicleDto(dto) as UpdateVehicleDto,
        );
        return this.mapVehicle(vehicle);
      }
    }
    const vehicle = await this.vehicles.create(user.id, this.toVehicleDto(dto, true) as CreateVehicleDto);
    return this.mapVehicle(vehicle);
  }

  @Patch('vehicles/:vehicleId')
  async updateVehicle(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: any,
  ) {
    const vehicle = await this.vehicles.update(
      user.id,
      vehicleId,
      this.toVehicleDto(dto) as UpdateVehicleDto,
    );
    return this.mapVehicle(vehicle);
  }

  @Delete('vehicles/:vehicleId')
  deleteVehicle(@CurrentUser() user: AuthUser, @Param('vehicleId') vehicleId: string) {
    return this.vehicles.remove(user.id, vehicleId);
  }

  @Post('vehicles/:vehicleId/documents')
  async uploadVehicleDocument(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: any,
  ) {
    if (!dto.fileUrl) {
      throw new BadRequestException('fileUrl is required. Upload the file first through /files/upload.');
    }

    const document = await this.vehicles.addDocument(user.id, vehicleId, {
      type: this.toDocumentType(dto.documentType ?? dto.type),
      fileUrl: dto.fileUrl,
      expiryDate: dto.expiryDate,
      issueDate: dto.issueDate,
      metadata: {
        fileKey: dto.fileKey ?? null,
        originalFileName: dto.originalFileName ?? null,
        mimeType: dto.mimeType ?? null,
        sizeBytes: dto.sizeBytes ?? null,
        source: 'driver-onboarding',
      },
    });
    return this.mapVehicleDocument(document);
  }

  @Patch('vehicles/:vehicleId/documents/:documentId')
  async patchVehicleDocument(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string,
    @Body() dto: any,
  ) {
    await this.vehicles.get(user.id, vehicleId);
    const document = await this.vehicleDocuments.findOne({ where: { id: documentId, vehicleId } });
    if (!document) throw new NotFoundException('Vehicle document not found');
    Object.assign(document, {
      type: dto.documentType || dto.type ? this.toDocumentType(dto.documentType ?? dto.type) : document.type,
      fileUrl: dto.fileUrl ?? document.fileUrl,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : document.expiryDate,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : document.issueDate,
      status: dto.status ?? document.status,
    });
    return this.mapVehicleDocument(await this.vehicleDocuments.save(document));
  }

  @Patch('active-vehicle')
  async activateVehicle(@CurrentUser() user: AuthUser, @Body() dto: CompatDriverPresenceDto) {
    if (!dto.vehicleId) {
      const vehicles = await this.vehicles.listMine(user.id);
      return (vehicles as any[]).map((v: any) => this.mapVehicle(v));
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
  emergencyContacts(@CurrentUser() user: AuthUser) {
    return this.emergencyContactsRepo.find({
      where: { userId: user.id },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }

  @Post('emergency-contacts')
  async createEmergencyContact(@CurrentUser() user: AuthUser, @Body() body: any) {
    const count = await this.emergencyContactsRepo.count({ where: { userId: user.id } });
    const isPrimary = body.isPrimary === true || count === 0;
    if (isPrimary) await this.emergencyContactsRepo.update({ userId: user.id }, { isPrimary: false });
    return this.emergencyContactsRepo.save(
      this.emergencyContactsRepo.create({ userId: user.id, ...body, isPrimary }),
    );
  }

  @Patch('emergency-contacts/:id')
  async updateEmergencyContact(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) {
    const contact = await this.emergencyContactsRepo.findOne({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException('Emergency contact not found');
    if (body.isPrimary === true)
      await this.emergencyContactsRepo.update({ userId: user.id }, { isPrimary: false });
    Object.assign(contact, body);
    return this.emergencyContactsRepo.save(contact);
  }

  @Delete('emergency-contacts/:id')
  async deleteEmergencyContact(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const contact = await this.emergencyContactsRepo.findOne({ where: { id, userId: user.id } });
    if (!contact) throw new NotFoundException('Emergency contact not found');
    await this.emergencyContactsRepo.softRemove(contact);
    return { deleted: true };
  }

  @Get('documents')
  async driverDocumentsList(@CurrentUser() user: AuthUser) {
    return (await this.drivers.listDocuments(user.id)).map((document) =>
      this.mapDriverDocument(user.id, document),
    );
  }

  @Post('documents')
  async createDriverDocument(@CurrentUser() user: AuthUser, @Body() dto: any) {
    const document = await this.drivers.uploadDocument(user.id, {
      type: this.toDocumentType(dto.documentType ?? dto.type),
      fileUrl: dto.fileUrl,
      expiryDate: dto.expiryDate,
      issueDate: dto.issueDate,
      metadata: {
        fileKey: dto.fileKey,
        originalFileName: dto.originalFileName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        side: dto.side,
      },
    });
    return this.mapDriverDocument(user.id, document);
  }

  @Patch('documents/:documentId')
  async patchDriverDocument(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
    @Body() dto: any,
  ) {
    const driver = await this.drivers.getByUserId(user.id);
    const document = await this.driverDocuments.findOne({ where: { id: documentId, driverId: driver.id } });
    if (!document) throw new NotFoundException('Driver document not found');
    Object.assign(document, {
      type: dto.documentType || dto.type ? this.toDocumentType(dto.documentType ?? dto.type) : document.type,
      fileUrl: dto.fileUrl ?? document.fileUrl,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : document.expiryDate,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : document.issueDate,
      metadata: { ...(document.metadata ?? {}), ...dto },
    });
    return this.mapDriverDocument(user.id, await this.driverDocuments.save(document));
  }

  @Delete('documents/:documentId')
  async deleteDriverDocument(@CurrentUser() user: AuthUser, @Param('documentId') documentId: string) {
    const driver = await this.drivers.getByUserId(user.id);
    const document = await this.driverDocuments.findOne({ where: { id: documentId, driverId: driver.id } });
    if (!document) throw new NotFoundException('Driver document not found');
    await this.driverDocuments.softRemove(document);
    return { deleted: true };
  }

  @Get('documents/status')
  async documentStatus(@CurrentUser() user: AuthUser) {
    const docs = await this.drivers.listDocuments(user.id);
    const required = [DocumentType.NATIONAL_ID, DocumentType.DRIVING_LICENSE_FRONT];
    const completed = docs.filter((d) => d.status !== DocumentStatus.REJECTED).map((d) => d.type);
    const missing = required.filter((type) => !completed.includes(type));
    return { required, completed, missing, hasBlockingIssues: missing.length > 0 };
  }

  @Post('identity/photo')
  async uploadIdentityPhoto(@CurrentUser() user: AuthUser, @Body() dto: any) {
    const profilePhoto = dto.profilePhotoUrl ?? dto.imageUrl ?? dto.fileUrl ?? null;
    if (profilePhoto) {
      await this.users.updateProfile(user.id, { avatarUrl: profilePhoto });
    }
    return { profilePhoto, identityVerified: Boolean(profilePhoto) };
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
      batterySize: v.batteryCapacityKwh != null ? String(v.batteryCapacityKwh) : '',
      color: v.color || '',
      range: v.estimatedRangeKm != null ? String(v.estimatedRangeKm) : '',
      isActive: v.status === 'ACTIVE' || v.isActive === true,
      documents: ((v.documents as VehicleDocument[] | undefined) ?? []).map((d: VehicleDocument) =>
        this.mapVehicleDocument(d),
      ),
    };
  }

  private mapVehicleDocument(document: VehicleDocument) {
    return {
      id: document.id,
      documentType: document.type,
      fileUrl: document.fileUrl,
      fileKey: (document.metadata?.fileKey as string | undefined) ?? null,
      originalFileName: (document.metadata?.originalFileName as string | undefined) ?? null,
      mimeType: (document.metadata?.mimeType as string | undefined) ?? null,
      sizeBytes: (document.metadata?.sizeBytes as number | undefined) ?? null,
      status: document.status,
      expiryDate: document.expiryDate ? document.expiryDate.toISOString() : null,
      createdAt: document.createdAt.toISOString(),
      uploadedAt: document.createdAt.toISOString(),
    };
  }

  private mapDriverDocument(userId: string, document: DriverDocument) {
    return {
      id: document.id,
      userId,
      userType: 'DRIVER',
      documentType: document.type,
      fileUrl: document.fileUrl,
      fileKey: (document.metadata?.fileKey as string | undefined) ?? null,
      originalFileName: (document.metadata?.originalFileName as string | undefined) ?? null,
      mimeType: (document.metadata?.mimeType as string | undefined) ?? null,
      sizeBytes: (document.metadata?.sizeBytes as number | undefined) ?? null,
      side: (document.metadata?.side as string | undefined) ?? null,
      status: document.status,
      expiryDate: document.expiryDate ? document.expiryDate.toISOString() : null,
      uploadedAt: document.createdAt.toISOString(),
      createdAt: document.createdAt.toISOString(),
    };
  }

  private toVehicleDto(input: any, withDefaults = false): Partial<CreateVehicleDto> {
    const dto: Partial<CreateVehicleDto> = {
      make: input.make,
      model: input.model,
      year: input.year,
      plateNumber: input.plateNumber ?? input.plate,
      vehicleType:
        input.vehicleType || input.type ? this.toVehicleType(input.vehicleType ?? input.type) : undefined,
      energyType: input.energyType ?? (withDefaults ? EnergyType.ELECTRIC : undefined),
      seats: input.seats ?? (withDefaults ? 4 : undefined),
      cargoCapacityKg: input.cargoCapacityKg ?? (withDefaults ? 0 : undefined),
      batteryCapacityKwh:
        input.batteryCapacityKwh ?? (input.batterySize ? Number(input.batterySize) : undefined),
      estimatedRangeKm: input.estimatedRangeKm ?? (input.range ? Number(input.range) : undefined),
      color: input.color,
      imageUrl: input.imageUrl ?? input.imageKey,
      serviceCapabilities: input.serviceCapabilities ?? (withDefaults ? [ServiceType.RIDE] : undefined),
      features: input.features ?? input.accessories ?? (withDefaults ? {} : undefined),
      dailyRentalRate: input.dailyRentalRate,
      includedDailyKm: input.includedDailyKm,
      extraKmRate: input.extraKmRate,
    };
    return Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    ) as Partial<CreateVehicleDto>;
  }

  private toVehicleType(value: unknown): VehicleType {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    if (normalized in VehicleType) return VehicleType[normalized as keyof typeof VehicleType];
    if (normalized.includes('BIKE') || normalized.includes('MOTOR')) return VehicleType.MOTORCYCLE;
    if (normalized.includes('SCOOTER')) return VehicleType.SCOOTER;
    if (normalized.includes('VAN')) return VehicleType.VAN;
    if (normalized.includes('SUV')) return VehicleType.SUV;
    return VehicleType.SEDAN;
  }

  private toDocumentType(value: unknown): DocumentType {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    if (normalized in DocumentType) return DocumentType[normalized as keyof typeof DocumentType];
    if (normalized.includes('LICENSE')) return DocumentType.DRIVING_LICENSE_FRONT;
    if (normalized.includes('NATIONAL') || normalized.includes('IDENTITY')) return DocumentType.NATIONAL_ID;
    if (normalized.includes('INSURANCE')) return DocumentType.VEHICLE_INSURANCE;
    if (normalized.includes('INSPECTION')) return DocumentType.VEHICLE_INSPECTION;
    if (normalized.includes('LOGBOOK') || normalized.includes('OWNERSHIP'))
      return DocumentType.VEHICLE_LOGBOOK;
    if (normalized.includes('REGISTRATION') || normalized.includes('ROAD_LICENSE'))
      return DocumentType.ROAD_LICENSE;
    return DocumentType.OTHER;
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
