import { ConfigService } from '@nestjs/config';
import { DomainEventsService } from '../src/infrastructure/domain-events.service';
import { LIFECYCLE_REGISTRY } from '../src/infrastructure/lifecycle.registry';
import { ProcessRoleService } from '../src/infrastructure/process-role.service';
import { ProductionConfigService } from '../src/infrastructure/production-config.service';
import { RedisService } from '../src/infrastructure/redis.service';
import { ROUTE_OWNERSHIP_REGISTRY } from '../src/infrastructure/route-ownership.registry';

function service(env: Record<string, string>) {
  const config = new ConfigService(env);
  const redis = {
    status: () => ({
      configured: Boolean(env.REDIS_URL),
      connected: Boolean(env.REDIS_CONNECTED),
      fallback: env.REDIS_CONNECTED ? null : 'IN_MEMORY',
    }),
  } as unknown as RedisService;
  const events = {
    status: () => ({
      enabled: env.KAFKA_DISABLED !== 'true',
      connected: Boolean(env.KAFKA_CONNECTED),
      fallback: env.KAFKA_CONNECTED ? null : 'DURABLE_OUTBOX_AND_CONSOLE',
    }),
  } as unknown as DomainEventsService;
  const roles = new ProcessRoleService(config);
  return new ProductionConfigService(config, redis, events, roles);
}

const safeProductionEnv = {
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://app.evzone.example',
  SOCKET_CORS_ORIGINS: 'https://app.evzone.example',
  DB_TYPE: 'postgres',
  DB_SYNCHRONIZE: 'false',
  DB_MIGRATIONS_RUN: 'true',
  SEED_DEMO: 'false',
  JWT_SECRET: 'strong-jwt-secret-value-with-40-characters',
  INTEGRATION_ENCRYPTION_KEY: 'strong-integration-secret-with-40-chars',
  CORPORATEPAY_WEBHOOK_SECRET: 'strong-webhook-secret-with-40-characters',
  CORPORATEPAY_SIGNING_SECRET: 'strong-signing-secret-with-40-characters',
  REDIS_URL: 'redis://redis:6379',
  REDIS_CONNECTED: 'true',
  REDIS_DISABLED: 'false',
  KAFKA_DISABLED: 'false',
  KAFKA_BROKERS: 'kafka:9092',
  KAFKA_CONNECTED: 'true',
  PAYMENT_PROVIDER: 'FLUTTERWAVE',
  FLUTTERWAVE_SECRET_KEY: 'flw-secret',
  MOCK_PAYMENT_AUTO_APPROVE: 'false',
  CORPORATEPAY_MODE: 'remote',
  CORPORATEPAY_MOCK_AUTO_APPROVE: 'false',
  CORPORATEPAY_PARTNER_ALLOW_API_KEY_ONLY: 'false',
  PUSH_PROVIDER: 'WEBHOOK',
  PUSH_WEBHOOK_URL: 'https://push.evzone.example',
  CLOUDINARY_DISABLED: 'false',
  CLOUDINARY_CLOUD_NAME: 'evzone',
  CLOUDINARY_API_KEY: 'cloudinary-key',
  CLOUDINARY_API_SECRET: 'cloudinary-secret',
  FILE_SCAN_PROVIDER: 'CLAMAV',
  STRICT_DRIVER_COMPLIANCE: 'true',
  CASHOUT_AUTO_APPROVE: 'false',
  CASHOUT_PAYOUT_PROVIDER: 'BANK',
};

describe('platform hardening registries', () => {
  it('covers every Phase 1 public API audience with canonical owners', () => {
    expect(ROUTE_OWNERSHIP_REGISTRY.map((owner) => owner.audience).sort()).toEqual([
      'admin',
      'agent',
      'driver',
      'fleet',
      'partner',
      'public-tracking',
      'rider',
    ]);
    expect(ROUTE_OWNERSHIP_REGISTRY.every((owner) => owner.canonicalBase.startsWith('/api/v1/'))).toBe(true);
  });

  it('defines the critical platform lifecycle sources of truth', () => {
    expect(LIFECYCLE_REGISTRY.map((item) => item.name).sort()).toEqual([
      'ambulance',
      'cashout',
      'delivery',
      'document',
      'payment',
      'rental',
      'ride',
      'shuttle',
      'support-ticket',
      'tourist',
    ]);
    expect(LIFECYCLE_REGISTRY.every((item) => item.terminalStates.length > 0)).toBe(true);
  });
});

describe('production config validation', () => {
  it('allows development fallbacks', () => {
    const report = service({ NODE_ENV: 'development', CORS_ORIGINS: '*' }).report();
    expect(report.production).toBe(false);
    expect(report.productionReady).toBe(true);
  });

  it('rejects unsafe production defaults', () => {
    const validator = service({
      NODE_ENV: 'production',
      CORS_ORIGINS: '*',
      DB_SYNCHRONIZE: 'true',
      SEED_DEMO: 'true',
      JWT_SECRET: 'evzone-local-access-secret-2026',
      PAYMENT_PROVIDER: 'MOCK',
      PUSH_PROVIDER: 'LOCAL',
      KAFKA_DISABLED: 'true',
    });
    expect(() => validator.onModuleInit()).toThrow(/Unsafe production configuration/);
    const failedKeys = validator
      .report()
      .checks.filter((check) => !check.ok)
      .map((check) => check.key);
    expect(failedKeys).toEqual(
      expect.arrayContaining([
        'cors.explicit',
        'db.noSync',
        'seed.disabled',
        'secret.JWT_SECRET',
        'payments.realProvider',
        'push.realProvider',
        'kafka.enabled',
      ]),
    );
  });

  it('accepts a fully configured production profile', () => {
    const validator = service(safeProductionEnv);
    expect(() => validator.onModuleInit()).not.toThrow();
    expect(validator.readiness().status).toBe('ready');
  });
});
