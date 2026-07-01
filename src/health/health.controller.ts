import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { BRAND } from '../common/constants';
import { Public } from '../common/decorators/public.decorator';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { KafkaHealthIndicator } from './indicators/kafka.health';
import { MigrationsHealthIndicator } from './indicators/migrations.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StorageHealthIndicator } from './indicators/storage.health';
import { WorkersHealthIndicator } from './indicators/workers.health';
import { WorkerHealthService } from '../workers';
import { ProductionConfigService } from '../infrastructure/production-config.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly migrations: MigrationsHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly kafka: KafkaHealthIndicator,
    private readonly storage: StorageHealthIndicator,
    private readonly workersIndicator: WorkersHealthIndicator,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workerHealth: WorkerHealthService,
    private readonly production: ProductionConfigService,
  ) {}

  @Public()
  @Get()
  index() {
    return {
      service: 'EVzone Ride API',
      version: process.env.npm_package_version ?? '1.0.0',
      status: 'running',
      brand: BRAND,
      documentation: '/docs',
    };
  }

  /**
   * Backward-compatible health check. Returns 200 when the database is reachable.
   */
  @Public()
  @Get('health')
  @HealthCheck()
  legacyHealth() {
    return this.health.check([() => this.db.isHealthy('database')]);
  }

  /**
   * Liveness probe. Minimal check that the process is responsive.
   */
  @Public()
  @Get('health/live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  /**
   * Readiness probe. Verifies database, migrations, Redis, Kafka, and storage.
   */
  @Public()
  @Get('health/ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.migrations.isHealthy('migrations'),
      () => this.redis.isHealthy('redis'),
      () => this.kafka.isHealthy('kafka'),
      () => this.storage.isHealthy('storage'),
    ]);
  }

  /**
   * Detailed dependency matrix. Returns the status of every external dependency.
   */
  @Public()
  @Get('health/dependencies')
  @HealthCheck()
  dependencies() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.migrations.isHealthy('migrations'),
      () => this.redis.isHealthy('redis'),
      () => this.kafka.isHealthy('kafka'),
      () => this.storage.isHealthy('storage'),
    ]);
  }

  /**
   * Worker heartbeat status. Returns 503 if any critical cron worker is stale.
   */
  @Public()
  @Get('health/workers')
  @HealthCheck()
  workersHealth() {
    return this.health.check([() => this.workersIndicator.isHealthy('workers')]);
  }

  /**
   * Backward-compatible readiness endpoint.
   */
  @Public()
  @Get('ready')
  @HealthCheck()
  legacyReady() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.migrations.isHealthy('migrations'),
      () => this.redis.isHealthy('redis'),
      () => this.kafka.isHealthy('kafka'),
      () => this.storage.isHealthy('storage'),
      () => this.workersIndicator.isHealthy('workers'),
    ]);
  }

  @Public()
  @Get('health/workers')
  workers() {
    const statuses = this.workerHealth.status();
    const healthy = Object.values(statuses).every((s) => s.healthy);
    return {
      status: healthy ? 'ok' : 'degraded',
      workers: statuses,
      timestamp: new Date().toISOString(),
    };
  }
}
