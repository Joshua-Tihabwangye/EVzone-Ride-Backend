import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaymentMethod, ServiceType, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  DeviceToken,
  DriverProfile,
  FeatureFlag,
  Notification,
  User,
  UserPreference,
  Vehicle,
  Wallet,
} from '../database/entities';
import { RegisterDeviceTokenDto } from '../notifications/notifications.dto';
import { PushNotificationsService } from '../notifications/push-notifications.service';

@Injectable()
export class MobileService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserPreference) private readonly preferences: Repository<UserPreference>,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(FeatureFlag) private readonly flags: Repository<FeatureFlag>,
    @InjectRepository(DeviceToken) private readonly deviceTokens: Repository<DeviceToken>,
    private readonly push: PushNotificationsService,
    private readonly config: ConfigService,
  ) {}

  capabilities(platform?: string, appVersion?: string) {
    const minimumVersion = this.minimumVersion(platform);
    return {
      contractVersion: '2026-06-v1',
      apiVersion: 'v1',
      platform: platform?.toUpperCase() ?? 'UNKNOWN',
      appVersion: appVersion ?? null,
      minimumSupportedVersion: minimumVersion,
      upgradeRequired: appVersion ? this.compareVersions(appVersion, minimumVersion) < 0 : false,
      services: Object.values(ServiceType),
      paymentMethods: Object.values(PaymentMethod),
      realtime: {
        transport: 'socket.io',
        namespaces: ['/rider', '/driver', '/admin'],
        authentication: 'JWT_HANDSHAKE',
        reconnection: true,
      },
      features: {
        scheduledRides: true,
        recurringCommutes: true,
        multiStopTrips: true,
        roundTrips: true,
        beneficiaryBookings: true,
        riderSavedAndRecentPlaces: true,
        sharedRides: true,
        unifiedDriverJobs: true,
        deliveryRoutes: true,
        driverTrainingCertificates: true,
        genericReviews: true,
        rentalBranches: true,
        rentalVehicleClasses: true,
        customRentalQuotations: true,
        pushNotifications: true,
        corporatePay: true,
        fleetPartner: true,
        schoolFleetSynchronization: true,
      },
      generatedAt: new Date(),
    };
  }

  publicConfig() {
    return {
      brand: {
        name: 'EVzone Ride',
        colors: {
          green: '#03cd8c',
          orange: '#f77f00',
          mediumGrey: '#a6a6a6',
          lightGrey: '#f2f2f2',
        },
      },
      country: this.config.get<string>('DEFAULT_COUNTRY_CODE') ?? 'UG',
      currency: this.config.get<string>('DEFAULT_CURRENCY') ?? 'UGX',
      timezone: this.config.get<string>('DEFAULT_TIMEZONE') ?? 'Africa/Kampala',
      support: {
        phone: this.config.get<string>('SUPPORT_PHONE') ?? null,
        email: this.config.get<string>('SUPPORT_EMAIL') ?? null,
      },
      mapProvider: this.config.get<string>('MAP_PROVIDER') ?? 'CONFIGURABLE',
      corporatePayEnabled: true,
    };
  }

  async bootstrap(user: AuthUser, platform?: string, appVersion?: string) {
    const account = await this.users.findOne({ where: { id: user.id } });
    if (!account) throw new NotFoundException('User not found');
    const [preference, wallet, driver, unreadCount, featureFlags, devices] = await Promise.all([
      this.preferences.findOne({ where: { userId: user.id } }),
      this.wallets.findOne({ where: { userId: user.id } }),
      this.drivers.findOne({ where: { userId: user.id } }),
      this.notifications.count({ where: { userId: user.id, readAt: IsNull() } }),
      this.flags.find({ where: { enabled: true }, order: { key: 'ASC' } }),
      this.deviceTokens.find({ where: { userId: user.id, active: true }, order: { lastSeenAt: 'DESC' } }),
    ]);
    const currentVehicle = driver?.currentVehicleId
      ? await this.vehicles.findOne({ where: { id: driver.currentVehicleId } })
      : null;
    return {
      contract: this.capabilities(platform, appVersion),
      publicConfig: this.publicConfig(),
      session: {
        user: account,
        role: account.role,
        allowedServices: this.allowedServices(account.role, driver?.serviceCapabilities),
      },
      rider: {
        preferences: preference,
        placesEndpoint: '/api/v1/users/me/places',
        commutesEndpoint: '/api/v1/commutes',
      },
      driver: driver
        ? {
            profile: driver,
            currentVehicle,
            jobsEndpoint: '/api/v1/driver/jobs',
            readinessEndpoint: '/api/v1/drivers/me/readiness',
            learningEndpoint: '/api/v1/drivers/me/learning',
          }
        : null,
      wallet,
      unreadNotifications: unreadCount,
      devices,
      featureFlags: featureFlags.map((flag) => ({
        key: flag.key,
        enabled: flag.enabled,
        rules: flag.rules,
        scope: flag.scope,
      })),
      serverTime: new Date(),
    };
  }

  registerDevice(userId: string, dto: RegisterDeviceTokenDto) {
    return this.push.register(userId, dto);
  }

  devices(userId: string) {
    return this.push.list(userId);
  }

  removeDevice(userId: string, id: string) {
    return this.push.remove(userId, id);
  }

  private allowedServices(role: UserRole, driverCapabilities?: ServiceType[]) {
    if (role === UserRole.DRIVER) return driverCapabilities ?? [];
    if ([UserRole.RIDER, UserRole.CUSTOMER].includes(role)) return Object.values(ServiceType);
    return Object.values(ServiceType);
  }

  private minimumVersion(platform?: string) {
    const normalized = platform?.toUpperCase();
    if (normalized === 'IOS') return this.config.get<string>('MIN_IOS_APP_VERSION') ?? '1.0.0';
    if (normalized === 'ANDROID') return this.config.get<string>('MIN_ANDROID_APP_VERSION') ?? '1.0.0';
    return this.config.get<string>('MIN_WEB_APP_VERSION') ?? '1.0.0';
  }

  private compareVersions(left: string, right: string) {
    const a = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const b = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      if ((a[index] ?? 0) > (b[index] ?? 0)) return 1;
      if ((a[index] ?? 0) < (b[index] ?? 0)) return -1;
    }
    return 0;
  }
}
