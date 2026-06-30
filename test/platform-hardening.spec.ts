import { ConfigService } from '@nestjs/config';
import { parseCorsOrigins } from '../src/common/utils/cors-origins.helper';
import { getRequiredSecret } from '../src/common/utils/required-secret.util';
import { validationSchema, validationOptions } from '../src/config/env.validation';
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
  DATABASE_URL: 'postgresql://evzone:strong-password@postgres:5432/evzone',
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

describe('environment validation schema', () => {
  it('allows development defaults', () => {
    const result = validationSchema.validate(
      { NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' },
      validationOptions,
    );
    expect(result.error).toBeUndefined();
  });

  it('rejects wildcard CORS in production', () => {
    const result = validationSchema.validate(
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@db:5432/db',
        CORS_ORIGINS: '*',
        JWT_SECRET: 'strong-jwt-secret-value-with-40-characters',
        INTEGRATION_ENCRYPTION_KEY: 'strong-integration-secret-with-40-chars',
        CORPORATEPAY_WEBHOOK_SECRET: 'strong-webhook-secret-with-40-characters',
        CORPORATEPAY_SIGNING_SECRET: 'strong-signing-secret-with-40-characters',
        SCHOOL_WEBHOOK_SECRET: 'strong-school-secret-with-40-characters',
      },
      validationOptions,
    );
    expect(result.error?.message).toMatch(/CORS_ORIGINS cannot be wildcard/);
  });

  it('rejects weak secrets in production', () => {
    const result = validationSchema.validate(
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@db:5432/db',
        CORS_ORIGINS: 'https://app.evzone.example',
        JWT_SECRET: 'evzone-local-access-secret-2026',
        INTEGRATION_ENCRYPTION_KEY: 'evzone-local-integration-key',
        CORPORATEPAY_WEBHOOK_SECRET: 'evzone-corporatepay-local-secret',
        CORPORATEPAY_SIGNING_SECRET: 'evzone-local-signing-secret',
        SCHOOL_WEBHOOK_SECRET: 'evzone-school-local-secret',
      },
      validationOptions,
    );
    expect(result.error?.message).toMatch(/JWT_SECRET/);
  });

  it('rejects DB_SYNCHRONIZE=true in production', () => {
    const result = validationSchema.validate(
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@db:5432/db',
        CORS_ORIGINS: 'https://app.evzone.example',
        DB_SYNCHRONIZE: 'true',
        DB_MIGRATIONS_RUN: 'true',
        JWT_SECRET: 'strong-jwt-secret-value-with-40-characters',
        INTEGRATION_ENCRYPTION_KEY: 'strong-integration-secret-with-40-chars',
        CORPORATEPAY_WEBHOOK_SECRET: 'strong-webhook-secret-with-40-characters',
        CORPORATEPAY_SIGNING_SECRET: 'strong-signing-secret-with-40-characters',
        SCHOOL_WEBHOOK_SECRET: 'strong-school-secret-with-40-characters',
      },
      validationOptions,
    );
    expect(result.error?.message).toMatch(/DB_SYNCHRONIZE must be false/);
  });
});

describe('CORS origin parser', () => {
  it('returns true for wildcard in development', () => {
    expect(parseCorsOrigins('*', 'development')).toBe(true);
  });

  it('parses comma-separated origins', () => {
    expect(parseCorsOrigins('https://a.example, https://b.example', 'production')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('throws on wildcard in production', () => {
    expect(() => parseCorsOrigins('*', 'production')).toThrow(/cannot be wildcard/);
  });

  it('throws on invalid origin URL', () => {
    expect(() => parseCorsOrigins('not-a-url', 'production')).toThrow(/invalid URL/);
  });
});

describe('required secret helper', () => {
  it('returns a strong secret in production', () => {
    expect(getRequiredSecret('JWT_SECRET', 'strong-secret-with-more-than-32-characters', 'production')).toBe(
      'strong-secret-with-more-than-32-characters',
    );
  });

  it('throws on weak secrets in production', () => {
    expect(() => getRequiredSecret('JWT_SECRET', 'evzone-local-secret-2026', 'production')).toThrow(
      /strong secret/,
    );
  });

  it('throws on missing secrets in production', () => {
    expect(() => getRequiredSecret('JWT_SECRET', undefined, 'production')).toThrow(/required/);
  });

  it('warns but accepts weak secrets in development', () => {
    expect(getRequiredSecret('JWT_SECRET', 'evzone-local-secret-2026', 'development')).toBe(
      'evzone-local-secret-2026',
    );
  });

  it('uses configured local fallback in development when missing', () => {
    expect(
      getRequiredSecret('JWT_SECRET', undefined, 'development', {
        allowLocalFallback: true,
        localFallback: 'evzone-local-access-secret-change-in-production',
      }),
    ).toBe('evzone-local-access-secret-change-in-production');
  });
});
