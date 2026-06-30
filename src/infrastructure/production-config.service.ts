import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEventsService } from './domain-events.service';
import { ProcessRoleService } from './process-role.service';
import { RedisService } from './redis.service';

export interface ProductionCheck {
  key: string;
  ok: boolean;
  message: string;
  severity: 'error' | 'warning';
}

@Injectable()
export class ProductionConfigService implements OnModuleInit {
  private readonly logger = new Logger(ProductionConfigService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly events: DomainEventsService,
    private readonly roles: ProcessRoleService,
  ) {}

  onModuleInit(): void {
    const report = this.report();
    if (!report.production) return;
    const errors = report.checks.filter((check) => check.severity === 'error' && !check.ok);
    if (errors.length) {
      throw new Error(
        `Unsafe production configuration:\n${errors.map((check) => `- ${check.key}: ${check.message}`).join('\n')}`,
      );
    }
    this.logger.log('Production configuration validation passed');
  }

  report() {
    const production = this.value('NODE_ENV').toLowerCase() === 'production';
    const checks = production ? this.productionChecks() : this.developmentChecks();
    return {
      production,
      productionReady: checks.every((check) => check.ok || check.severity === 'warning'),
      process: this.roles.status(),
      checks,
    };
  }

  readiness() {
    const report = this.report();
    const redis = this.redis.status();
    const events = this.events.status();
    const dependencies = {
      database: { configured: true, connected: true, fallback: null, productionReady: true },
      redis: {
        ...redis,
        productionReady: !report.production || (redis.configured && redis.connected && !redis.fallback),
      },
      eventStreaming: {
        ...events,
        productionReady: !report.production || (events.enabled && events.connected && !events.fallback),
      },
      payments: this.paymentStatus(report.production),
      push: this.pushStatus(report.production),
      files: this.fileStatus(report.production),
      workers: {
        ...this.roles.status(),
        productionReady: !report.production || this.roles.runsWorkers() || this.roles.isApi(),
      },
    };
    const dependencyReady = Object.values(dependencies).every(
      (item) => (item as { productionReady?: boolean }).productionReady !== false,
    );
    return {
      status: report.productionReady && dependencyReady ? 'ready' : 'degraded',
      ...report,
      dependencies,
    };
  }

  private productionChecks(): ProductionCheck[] {
    return [
      this.check('cors.explicit', this.value('CORS_ORIGINS') !== '*', 'CORS_ORIGINS must be explicit'),
      this.check(
        'socketCors.explicit',
        this.value('SOCKET_CORS_ORIGINS', this.value('CORS_ORIGINS')) !== '*',
        'SOCKET_CORS_ORIGINS must be explicit',
      ),
      this.check(
        'db.postgres',
        this.value('DB_TYPE', 'postgres').toLowerCase() === 'postgres',
        'DB_TYPE must be postgres',
      ),
      this.check('db.noSync', !this.truthy('DB_SYNCHRONIZE'), 'DB_SYNCHRONIZE must be false'),
      this.check('db.migrations', this.truthy('DB_MIGRATIONS_RUN', true), 'DB_MIGRATIONS_RUN must be true'),
      this.check('seed.disabled', !this.truthy('SEED_DEMO'), 'SEED_DEMO must be false'),
      this.secretCheck('JWT_SECRET'),
      this.secretCheck('INTEGRATION_ENCRYPTION_KEY'),
      this.secretCheck('CORPORATEPAY_WEBHOOK_SECRET'),
      this.secretCheck('CORPORATEPAY_SIGNING_SECRET'),
      this.check('redis.configured', Boolean(this.value('REDIS_URL')), 'REDIS_URL is required'),
      this.check('redis.enabled', !this.truthy('REDIS_DISABLED'), 'REDIS_DISABLED must be false'),
      this.check('kafka.enabled', !this.truthy('KAFKA_DISABLED'), 'KAFKA_DISABLED must be false'),
      this.check('kafka.brokers', Boolean(this.value('KAFKA_BROKERS')), 'KAFKA_BROKERS is required'),
      this.check(
        'payments.realProvider',
        this.value('PAYMENT_PROVIDER').toUpperCase() !== 'MOCK',
        'PAYMENT_PROVIDER cannot be MOCK',
      ),
      this.check(
        'payments.noAutoApprove',
        !this.truthy('MOCK_PAYMENT_AUTO_APPROVE'),
        'MOCK_PAYMENT_AUTO_APPROVE must be false',
      ),
      this.check(
        'corporatePay.remote',
        this.value('CORPORATEPAY_MODE').toLowerCase() === 'remote',
        'CORPORATEPAY_MODE must be remote',
      ),
      this.check(
        'corporatePay.noMockApproval',
        !this.truthy('CORPORATEPAY_MOCK_AUTO_APPROVE'),
        'CORPORATEPAY_MOCK_AUTO_APPROVE must be false',
      ),
      this.check(
        'partner.noApiKeyOnly',
        !this.truthy('CORPORATEPAY_PARTNER_ALLOW_API_KEY_ONLY'),
        'CORPORATEPAY_PARTNER_ALLOW_API_KEY_ONLY must be false',
      ),
      this.check(
        'push.realProvider',
        this.value('PUSH_PROVIDER').toUpperCase() !== 'LOCAL',
        'PUSH_PROVIDER cannot be LOCAL',
      ),
      this.check(
        'files.objectStorage',
        !this.truthy('CLOUDINARY_DISABLED') &&
          Boolean(this.value('CLOUDINARY_CLOUD_NAME')) &&
          Boolean(this.value('CLOUDINARY_API_KEY')) &&
          Boolean(this.value('CLOUDINARY_API_SECRET')),
        'Object storage credentials are required',
      ),
      this.check(
        'files.scanning',
        ['CLAMAV', 'WEBHOOK', 'VENDOR'].includes(this.value('FILE_SCAN_PROVIDER').toUpperCase()),
        'FILE_SCAN_PROVIDER must be CLAMAV, WEBHOOK, or VENDOR',
      ),
      this.check(
        'drivers.strictCompliance',
        this.truthy('STRICT_DRIVER_COMPLIANCE'),
        'STRICT_DRIVER_COMPLIANCE must be true',
      ),
      this.check(
        'cashout.noAutoApprove',
        !this.truthy('CASHOUT_AUTO_APPROVE'),
        'CASHOUT_AUTO_APPROVE must be false',
      ),
      this.check(
        'cashout.realPayoutProvider',
        this.value('CASHOUT_PAYOUT_PROVIDER', 'LOCAL').toUpperCase() !== 'LOCAL',
        'CASHOUT_PAYOUT_PROVIDER cannot be LOCAL',
      ),
    ];
  }

  private developmentChecks(): ProductionCheck[] {
    return [
      this.check('mode.developmentFallbacks', true, 'Development fallbacks are allowed', 'warning'),
      this.check('api.version', true, '/api/v1 is the canonical REST prefix', 'warning'),
    ];
  }

  private paymentStatus(production: boolean) {
    const provider = this.value('PAYMENT_PROVIDER', 'MOCK').toUpperCase();
    const configured = provider !== 'MOCK' && Boolean(this.value(`${provider}_SECRET_KEY`));
    return {
      provider,
      configured: provider === 'MOCK' ? true : configured,
      connected: provider === 'MOCK' ? false : configured,
      fallback: provider === 'MOCK' ? 'MOCK' : null,
      productionReady: !production || (provider !== 'MOCK' && configured),
    };
  }

  private pushStatus(production: boolean) {
    const provider = this.value('PUSH_PROVIDER', 'LOCAL').toUpperCase();
    const configured =
      provider === 'FCM'
        ? Boolean(this.value('FIREBASE_SERVICE_ACCOUNT_JSON'))
        : provider === 'WEBHOOK'
          ? Boolean(this.value('PUSH_WEBHOOK_URL'))
          : provider === 'EXPO' || provider === 'LOCAL';
    return {
      provider,
      configured,
      connected: provider !== 'LOCAL' && configured,
      fallback: provider === 'LOCAL' ? 'IN_APP_AND_WEBSOCKET' : null,
      productionReady: !production || (provider !== 'LOCAL' && configured),
    };
  }

  private fileStatus(production: boolean) {
    const cloudinaryConfigured =
      !this.truthy('CLOUDINARY_DISABLED') &&
      Boolean(this.value('CLOUDINARY_CLOUD_NAME')) &&
      Boolean(this.value('CLOUDINARY_API_KEY')) &&
      Boolean(this.value('CLOUDINARY_API_SECRET'));
    const scanProvider = this.value('FILE_SCAN_PROVIDER', 'NONE').toUpperCase();
    return {
      provider: cloudinaryConfigured ? 'CLOUDINARY' : 'LOCAL',
      configured: cloudinaryConfigured,
      connected: cloudinaryConfigured,
      fallback: cloudinaryConfigured ? null : 'LOCAL',
      scanProvider,
      scanningConfigured: ['CLAMAV', 'WEBHOOK', 'VENDOR'].includes(scanProvider),
      productionReady:
        !production || (cloudinaryConfigured && ['CLAMAV', 'WEBHOOK', 'VENDOR'].includes(scanProvider)),
    };
  }

  private secretCheck(key: string): ProductionCheck {
    const value = this.value(key);
    const unsafe =
      !value ||
      value.length < 32 ||
      /local|docker|demo|example|change-in-production|secret-2026/i.test(value);
    return this.check(`secret.${key}`, !unsafe, `${key} must be a strong non-default secret`);
  }

  private check(
    key: string,
    ok: boolean,
    message: string,
    severity: ProductionCheck['severity'] = 'error',
  ): ProductionCheck {
    return { key, ok, message, severity };
  }

  private truthy(key: string, fallback = false): boolean {
    const value = this.config.get<string>(key);
    if (value === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  private value(key: string, fallback = ''): string {
    return (this.config.get<string>(key) ?? fallback).trim();
  }
}
