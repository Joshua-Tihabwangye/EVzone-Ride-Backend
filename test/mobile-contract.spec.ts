import { ConfigService } from '@nestjs/config';
import { ObjectLiteral, Repository } from 'typeorm';
import {
  DeviceToken,
  DriverProfile,
  FeatureFlag,
  Notification,
  User,
  UserPreference,
  Vehicle,
  Wallet,
} from '../src/database/entities';
import { MobileService } from '../src/mobile/mobile.service';
import { PushNotificationsService } from '../src/notifications/push-notifications.service';

function repository<T extends ObjectLiteral>(): Repository<T> {
  return {} as Repository<T>;
}

describe('mobile contract capabilities', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        MIN_ANDROID_APP_VERSION: '2.5.0',
        MIN_IOS_APP_VERSION: '2.4.0',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const push = {} as PushNotificationsService;
  const service = new MobileService(
    repository<User>(),
    repository<UserPreference>(),
    repository<Wallet>(),
    repository<DriverProfile>(),
    repository<Vehicle>(),
    repository<Notification>(),
    repository<FeatureFlag>(),
    repository<DeviceToken>(),
    push,
    config,
  );

  it('advertises all app-facing service contracts', () => {
    const contract = service.capabilities('android', '2.5.0');
    expect(contract.features.unifiedDriverJobs).toBe(true);
    expect(contract.features.riderSavedAndRecentPlaces).toBe(true);
    expect(contract.features.customRentalQuotations).toBe(true);
    expect(contract.features.driverTrainingCertificates).toBe(true);
  });

  it('requires an upgrade below the configured minimum version', () => {
    expect(service.capabilities('android', '2.4.9').upgradeRequired).toBe(true);
    expect(service.capabilities('android', '2.5.0').upgradeRequired).toBe(false);
    expect(service.capabilities('android', '3.0.0').upgradeRequired).toBe(false);
  });

  it('publishes stable realtime namespaces and branding', () => {
    expect(service.capabilities('ios', '2.4.0').realtime.namespaces).toEqual(['/rider', '/driver', '/admin']);
    expect(service.publicConfig().brand.colors.green).toBe('#03cd8c');
  });
});
