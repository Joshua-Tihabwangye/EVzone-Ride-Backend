import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BusinessMetricsService } from '../observability/metrics/business-metrics.service';
import { WorkerHeartbeatService } from '../infrastructure/worker-heartbeat.service';
import { CRITICAL_WORKERS } from './indicators/workers.health';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { KafkaHealthIndicator } from './indicators/kafka.health';
import { MigrationsHealthIndicator } from './indicators/migrations.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StorageHealthIndicator } from './indicators/storage.health';

@Injectable()
export class DependencyHealthMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DependencyHealthMetricsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly businessMetrics: BusinessMetricsService,
    private readonly database: DatabaseHealthIndicator,
    private readonly migrations: MigrationsHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly kafka: KafkaHealthIndicator,
    private readonly storage: StorageHealthIndicator,
    private readonly workerHeartbeat: WorkerHeartbeatService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.HEALTH_METRICS_INTERVAL_MS ?? 15_000);
    void this.collect();
    this.timer = setInterval(() => void this.collect(), Math.max(5_000, intervalMs));
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async collect(): Promise<void> {
    await this.collectDependency('database', this.database);
    await this.collectDependency('migrations', this.migrations);
    await this.collectDependency('redis', this.redis);
    await this.collectDependency('kafka', this.kafka);
    await this.collectDependency('storage', this.storage);
    await this.collectWorkerHeartbeats();
  }

  private async collectDependency(
    name: string,
    indicator: { isHealthy(key: string): Promise<unknown> },
  ): Promise<void> {
    try {
      await indicator.isHealthy(name);
      this.businessMetrics.setDependencyHealth(name, true);
    } catch (error) {
      this.businessMetrics.setDependencyHealth(name, false);
      this.logger.debug(`Dependency ${name} is unhealthy`);
    }
  }

  private async collectWorkerHeartbeats(): Promise<void> {
    try {
      const statuses = await this.workerHeartbeat.getStatuses(CRITICAL_WORKERS);
      for (const [name, status] of Object.entries(statuses)) {
        this.businessMetrics.setWorkerStaleHeartbeat(name, status.stale);
      }
    } catch (error) {
      this.logger.debug('Failed to collect worker heartbeats');
    }
  }
}
