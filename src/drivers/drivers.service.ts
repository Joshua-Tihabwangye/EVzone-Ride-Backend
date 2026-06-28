import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  DocumentStatus,
  DocumentType,
  DriverAvailabilityStatus,
  DriverVerificationStatus,
  ServiceType,
  TrainingProgressStatus,
  TransactionDirection,
  UserRole,
  WalletTransactionType,
  VehicleStatus,
} from '../common/enums';
import {
  DriverDocument,
  DriverEarningGoal,
  DriverLocation,
  DriverProfile,
  DriverSession,
  TrainingModule,
  TrainingProgress,
  User,
  Vehicle,
  VehicleDocument,
  Wallet,
  WalletTransaction,
} from '../database/entities';
import { DriverLocatorService } from '../geolocation/driver-locator.service';
import {
  DriverAvailabilityDto,
  DriverDocumentDto,
  DriverLocationDto,
  EarningGoalDto,
  OnboardDriverDto,
  TrainingProgressDto,
} from './drivers.dto';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(DriverDocument) private readonly documents: Repository<DriverDocument>,
    @InjectRepository(DriverLocation) private readonly locations: Repository<DriverLocation>,
    @InjectRepository(DriverSession) private readonly sessions: Repository<DriverSession>,
    @InjectRepository(DriverEarningGoal) private readonly goals: Repository<DriverEarningGoal>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(VehicleDocument)
    private readonly vehicleDocuments: Repository<VehicleDocument>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(WalletTransaction) private readonly transactions: Repository<WalletTransaction>,
    @InjectRepository(TrainingModule) private readonly modules: Repository<TrainingModule>,
    @InjectRepository(TrainingProgress) private readonly progress: Repository<TrainingProgress>,
    private readonly events: EventEmitter2,
    private readonly locator: DriverLocatorService,
  ) {}

  async onboard(userId: string, dto: OnboardDriverDto) {
    if (await this.drivers.findOne({ where: { userId } }))
      throw new ConflictException('Driver profile already exists');
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.role = UserRole.DRIVER;
    await this.users.save(user);
    return this.drivers.save(
      this.drivers.create({
        userId,
        serviceCapabilities: dto.serviceCapabilities,
        preferences: dto.preferences,
        experienceYears: dto.experienceYears ?? 0,
        verificationStatus: DriverVerificationStatus.PENDING,
        availabilityStatus: DriverAvailabilityStatus.OFFLINE,
      }),
    );
  }

  async getByUserId(userId: string): Promise<DriverProfile> {
    const driver = await this.drivers.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    return driver;
  }

  async getById(driverId: string): Promise<DriverProfile> {
    const driver = await this.drivers.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  async me(userId: string) {
    const driver = await this.getByUserId(userId);
    const [documents, vehicle, goals, wallet] = await Promise.all([
      this.documents.find({ where: { driverId: driver.id }, order: { createdAt: 'DESC' } }),
      driver.currentVehicleId ? this.vehicles.findOne({ where: { id: driver.currentVehicleId } }) : null,
      this.goals.find({ where: { driverId: driver.id }, order: { periodStart: 'DESC' }, take: 5 }),
      this.wallets.findOne({ where: { userId } }),
    ]);
    return { driver, documents, vehicle, goals, wallet };
  }

  async updatePreferences(userId: string, preferences: Record<string, unknown>) {
    const driver = await this.getByUserId(userId);
    driver.preferences = { ...(driver.preferences ?? {}), ...preferences };
    return this.drivers.save(driver);
  }

  async updateProfile(
    userId: string,
    patch: {
      fullName?: string;
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
    let driver = await this.drivers.findOne({ where: { userId } });
    if (!driver) {
      // Auto-onboard a driver profile when a DRIVER-role user first patches their profile.
      driver = await this.onboard(userId, { serviceCapabilities: [] });
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (patch.fullName !== undefined) {
      const parts = patch.fullName.trim().split(/\s+/).filter(Boolean);
      user.firstName = parts[0] || user.firstName;
      user.lastName = parts.slice(1).join(' ') || user.lastName;
    }
    if (patch.phone !== undefined) user.phone = patch.phone;
    await this.users.save(user);

    const profilePrefs = (driver.preferences ?? {}) as Record<string, unknown>;
    const profile: Record<string, unknown> = { ...(profilePrefs.profile as Record<string, unknown> ?? {}) };
    if (patch.city !== undefined) profile.city = patch.city;
    if (patch.country !== undefined) profile.country = patch.country;
    if (patch.dateOfBirth !== undefined) profile.dateOfBirth = patch.dateOfBirth;
    if (patch.streetAddress !== undefined) profile.streetAddress = patch.streetAddress;
    if (patch.district !== undefined) profile.district = patch.district;
    if (patch.postalCode !== undefined) profile.postalCode = patch.postalCode;
    if (patch.landmark !== undefined) profile.landmark = patch.landmark;
    driver.preferences = { ...profilePrefs, profile };
    await this.drivers.save(driver);

    return {
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      phone: user.phone,
      city: profile.city,
      country: profile.country,
      dateOfBirth: profile.dateOfBirth,
      streetAddress: profile.streetAddress,
      district: profile.district,
      postalCode: profile.postalCode,
      landmark: profile.landmark,
    };
  }

  async setAvailability(userId: string, dto: DriverAvailabilityDto) {
    const driver = await this.getByUserId(userId);
    if (dto.status === DriverAvailabilityStatus.ONLINE) {
      const readiness = await this.readinessForDriver(driver, dto.vehicleId);
      if (!readiness.canGoOnline) {
        throw new BadRequestException({
          message: 'Driver requirements must be completed before going online',
          code: 'DRIVER_NOT_READY',
          blockingReasons: readiness.blockingReasons,
          readiness,
        });
      }
      driver.currentVehicleId = readiness.vehicle?.id;
      const openSession = await this.sessions.findOne({ where: { driverId: driver.id, status: 'ONLINE' } });
      if (!openSession) {
        await this.sessions.save(
          this.sessions.create({ driverId: driver.id, startedAt: new Date(), status: 'ONLINE' }),
        );
      }
    } else if (driver.availabilityStatus === DriverAvailabilityStatus.ONLINE) {
      const session = await this.sessions.findOne({
        where: { driverId: driver.id, status: 'ONLINE' },
        order: { startedAt: 'DESC' },
      });
      if (session) {
        session.endedAt = new Date();
        session.onlineSeconds = Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000);
        session.status = 'CLOSED';
        await this.sessions.save(session);
      }
    }
    driver.availabilityStatus = dto.status;
    await this.drivers.save(driver);
    if (dto.status === DriverAvailabilityStatus.OFFLINE) await this.locator.removeDriver(driver.id);
    else await this.locator.indexDriver(driver);
    this.events.emit('user.event', { userId, event: 'driver.availability', data: driver });
    this.events.emit('domain.event', {
      topic: 'drivers',
      eventType: 'driver.availability.changed',
      aggregateType: 'DriverProfile',
      aggregateId: driver.id,
      eventKey: driver.id,
      payload: { driverId: driver.id, userId, status: driver.availabilityStatus },
    });
    return driver;
  }

  async readiness(userId: string, vehicleId?: string) {
    const driver = await this.getByUserId(userId);
    return this.readinessForDriver(driver, vehicleId);
  }

  async updateLocation(userId: string, dto: DriverLocationDto) {
    const driver = await this.getByUserId(userId);
    if (dto.serviceId && driver.availabilityStatus === DriverAvailabilityStatus.OFFLINE) {
      throw new BadRequestException({ message: 'Driver is offline', code: 'DRIVER_OFFLINE' });
    }
    driver.lastLatitude = dto.latitude;
    driver.lastLongitude = dto.longitude;
    driver.lastLocationAt = new Date();
    await this.drivers.save(driver);
    const ping = await this.locations.save(
      this.locations.create({
        driverId: driver.id,
        serviceType: dto.serviceType,
        serviceId: dto.serviceId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        speedKph: dto.speedKph,
        heading: dto.heading,
        accuracyMeters: dto.accuracyMeters,
        recordedAt: new Date(),
      }),
    );
    await this.locator.indexDriver(driver);
    await this.events.emitAsync('domain.event', {
      topic: 'locations',
      eventType: 'driver.location.updated',
      aggregateType: 'DriverProfile',
      aggregateId: driver.id,
      eventKey: driver.id,
      payload: { driverId: driver.id, userId, location: ping },
    });
    if (dto.serviceType && dto.serviceId) {
      this.events.emit('service.updated', {
        serviceType: dto.serviceType,
        serviceId: dto.serviceId,
        data: { event: 'driver.location', location: ping },
      });
    }
    return ping;
  }

  async uploadDocument(userId: string, dto: DriverDocumentDto) {
    const driver = await this.getByUserId(userId);
    // There is currently no admin/review UI wired to the driver app. Without
    // auto-approval, uploaded documents would remain IN_REVIEW forever and the
    // driver could never go online. AUTO_VERIFY_DRIVER_DOCUMENTS lets this be
    // disabled when a real review flow is added.
    const autoVerify = (process.env.AUTO_VERIFY_DRIVER_DOCUMENTS ?? 'true') === 'true';
    const document = await this.documents.save(
      this.documents.create({
        driverId: driver.id,
        type: dto.type,
        fileUrl: dto.fileUrl,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        metadata: dto.metadata,
        status: autoVerify ? DocumentStatus.VERIFIED : DocumentStatus.IN_REVIEW,
      }),
    );
    if (driver.verificationStatus === DriverVerificationStatus.NOT_STARTED) {
      driver.verificationStatus = DriverVerificationStatus.PENDING;
      await this.drivers.save(driver);
    }
    // Auto-promote the driver to VERIFIED when all required docs are in order.
    await this.promoteDriverVerificationIfReady(userId);
    return document;
  }

  listDocuments(userId: string) {
    return this.getByUserId(userId).then((driver) =>
      this.documents.find({ where: { driverId: driver.id }, order: { createdAt: 'DESC' } }),
    );
  }

  async updateDocument(userId: string, documentId: string, patch: Partial<DriverDocumentDto>) {
    const driver = await this.getByUserId(userId);
    const document = await this.documents.findOne({ where: { id: documentId, driverId: driver.id } });
    if (!document) throw new NotFoundException('Document not found');
    if (patch.type) document.type = patch.type;
    if (patch.fileUrl !== undefined) document.fileUrl = patch.fileUrl;
    if (patch.issueDate) document.issueDate = new Date(patch.issueDate);
    if (patch.expiryDate) document.expiryDate = new Date(patch.expiryDate);
    if (patch.metadata !== undefined) document.metadata = patch.metadata;
    const updated = await this.documents.save(document);
    // A patch may fix an expiry date, so re-evaluate driver verification.
    await this.promoteDriverVerificationIfReady(userId);
    return updated;
  }

  async setWeeklyGoal(userId: string, dto: EarningGoalDto) {
    const driver = await this.getByUserId(userId);
    const start = dto.periodStart ? new Date(dto.periodStart) : this.startOfWeek(new Date());
    const end = new Date(start.getTime() + 7 * 86400000 - 1);
    const existing = await this.goals.findOne({ where: { driverId: driver.id, periodStart: start } });
    if (existing) {
      existing.goalAmount = dto.goalAmount;
      return this.goals.save(existing);
    }
    return this.goals.save(
      this.goals.create({
        driverId: driver.id,
        goalAmount: dto.goalAmount,
        periodStart: start,
        periodEnd: end,
      }),
    );
  }

  async dashboard(userId: string, from?: Date, to?: Date) {
    const driver = await this.getByUserId(userId);
    const start = from ?? new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ?? new Date();
    const sessions = await this.sessions.find({
      where: { driverId: driver.id, startedAt: Between(start, end) },
    });
    const wallet = await this.wallets.findOne({ where: { userId } });
    const earnings = wallet
      ? await this.transactions.find({
          where: { walletId: wallet.id, createdAt: Between(start, end) },
          order: { createdAt: 'DESC' },
        })
      : [];
    return {
      driver,
      wallet,
      period: { from: start, to: end },
      onlineSeconds: sessions.reduce((sum, session) => sum + session.onlineSeconds, 0),
      distanceKm: sessions.reduce((sum, session) => sum + Number(session.distanceKm), 0),
      earningTransactions: earnings,
      totalEarnings: earnings
        .filter(
          (item) =>
            item.direction === TransactionDirection.CREDIT &&
            [WalletTransactionType.EARNING, WalletTransactionType.TIP].includes(item.type),
        )
        .reduce((sum, item) => sum + Number(item.amount), 0),
    };
  }

  async nearby(serviceType: ServiceType, latitude: number, longitude: number, radiusKm = 25) {
    return this.locator.findNearby(serviceType, latitude, longitude, radiusKm);
  }

  async trainingModules(userId: string) {
    const driver = await this.getByUserId(userId);
    const [modules, progress] = await Promise.all([
      this.modules.find({ where: { active: true }, order: { sequence: 'ASC' } }),
      this.progress.find({ where: { driverId: driver.id } }),
    ]);
    return modules.map((module) => ({
      ...module,
      progress: progress.find((item) => item.moduleId === module.id) ?? null,
    }));
  }

  async completeTraining(userId: string, moduleId: string, dto: TrainingProgressDto) {
    const driver = await this.getByUserId(userId);
    const module = await this.modules.findOne({ where: { id: moduleId, active: true } });
    if (!module) throw new NotFoundException('Training module not found');
    let record = await this.progress.findOne({ where: { driverId: driver.id, moduleId } });
    record ??= this.progress.create({ driverId: driver.id, moduleId });
    record.answers = dto.answers;
    record.score = dto.score ?? 100;
    record.status = record.score >= 60 ? TrainingProgressStatus.PASSED : TrainingProgressStatus.FAILED;
    record.completedAt = new Date();
    return this.progress.save(record);
  }

  private async promoteDriverVerificationIfReady(userId: string) {
    const driver = await this.getByUserId(userId);
    if (driver.verificationStatus === DriverVerificationStatus.VERIFIED) {
      return;
    }
    const documents = await this.documents.find({ where: { driverId: driver.id } });
    const now = new Date();
    const requiredTypes = [
      DocumentType.NATIONAL_ID,
      DocumentType.DRIVING_LICENSE_FRONT,
      DocumentType.GOOD_CONDUCT,
    ];
    const allReady = requiredTypes.every((type) =>
      documents.some(
        (d) =>
          d.type === type &&
          d.status === DocumentStatus.VERIFIED &&
          (!d.expiryDate || d.expiryDate > now),
      ),
    );
    if (allReady) {
      driver.verificationStatus = DriverVerificationStatus.VERIFIED;
      await this.drivers.save(driver);
    }
  }

  private async readinessForDriver(driver: DriverProfile, requestedVehicleId?: string) {
    const strictCompliance =
      (process.env.STRICT_DRIVER_COMPLIANCE ?? (process.env.NODE_ENV === 'production').toString()) === 'true';
    const vehicleId = requestedVehicleId ?? driver.currentVehicleId;
    const vehicle = vehicleId ? await this.vehicles.findOne({ where: { id: vehicleId } }) : null;
    const now = new Date();
    const [driverDocuments, vehicleDocuments] = await Promise.all([
      this.documents.find({ where: { driverId: driver.id } }),
      vehicleId ? this.vehicleDocuments.find({ where: { vehicleId } }) : Promise.resolve([]),
    ]);
    const valid = (status: DocumentStatus, expiryDate?: Date) =>
      status === DocumentStatus.VERIFIED && (!expiryDate || expiryDate > now);
    const hasDriverDocument = (type: DocumentType) =>
      driverDocuments.some(
        (document) => document.type === type && valid(document.status, document.expiryDate),
      );
    const hasVehicleDocument = (type: DocumentType) =>
      vehicleDocuments.some(
        (document) => document.type === type && valid(document.status, document.expiryDate),
      );
    const checks = {
      profileVerified: driver.verificationStatus === DriverVerificationStatus.VERIFIED,
      activeVehicle: Boolean(vehicle && vehicle.status === VehicleStatus.ACTIVE && vehicle.isActive),
      currentLocation: driver.lastLatitude != null && driver.lastLongitude != null,
      nationalId: hasDriverDocument(DocumentType.NATIONAL_ID),
      drivingLicense: hasDriverDocument(DocumentType.DRIVING_LICENSE_FRONT),
      vehicleInsurance: hasVehicleDocument(DocumentType.VEHICLE_INSURANCE),
      vehicleInspection: hasVehicleDocument(DocumentType.VEHICLE_INSPECTION),
    };
    const requiredChecks = strictCompliance
      ? Object.entries(checks)
      : Object.entries(checks).filter(([key]) => ['profileVerified', 'activeVehicle'].includes(key));
    const blockingReasons = requiredChecks.filter(([, passed]) => !passed).map(([key]) => key);
    return {
      driverId: driver.id,
      strictCompliance,
      canGoOnline: blockingReasons.length === 0,
      checks,
      blockingReasons,
      vehicle,
      documentSummary: {
        driver: driverDocuments.map((document) => ({
          type: document.type,
          status: document.status,
          expiryDate: document.expiryDate,
        })),
        vehicle: vehicleDocuments.map((document) => ({
          type: document.type,
          status: document.status,
          expiryDate: document.expiryDate,
        })),
      },
    };
  }

  private startOfWeek(date: Date): Date {
    const copy = new Date(date);
    const day = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
}
