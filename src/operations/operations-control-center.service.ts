import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { HealthCheckResult, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { Repository } from 'typeorm';
import { DomainEventsService } from '../infrastructure/domain-events.service';
import { WorkerHeartbeatService } from '../infrastructure/worker-heartbeat.service';
import { CRITICAL_WORKERS } from '../health/indicators/workers.health';
import { DatabaseHealthIndicator } from '../health/indicators/database.health';
import { KafkaHealthIndicator } from '../health/indicators/kafka.health';
import { MigrationsHealthIndicator } from '../health/indicators/migrations.health';
import { RedisHealthIndicator } from '../health/indicators/redis.health';
import { StorageHealthIndicator } from '../health/indicators/storage.health';
import { WebhookEventRecord } from '../database/entities';
import { WebhookEventStatus } from '../common/enums';
import { GovernanceService } from '../governance/governance.service';
import { OperationsWatchdogService } from './operations-watchdog.service';
import { SloConfigService } from './slo-config.service';

export interface OperationsDashboard {
  health: HealthSummary;
  workers: Record<string, { stale: boolean; lastRunAt?: string }>;
  watchdog: ReturnType<OperationsWatchdogService['status']>;
  alerts: AlertSummary;
  outbox: { pending: number; failed: number; total: number };
  failedWebhooks: number;
  slos: ReturnType<SloConfigService['getSlos']>;
}

export interface HealthSummary {
  status: 'ok' | 'degraded' | 'down';
  dependencies: Record<string, { status: 'up' | 'down'; details?: unknown }>;
}

export interface AlertSummary {
  total: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
}

@Injectable()
export class OperationsControlCenterService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly migrations: MigrationsHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly kafka: KafkaHealthIndicator,
    private readonly storage: StorageHealthIndicator,
    private readonly workerHeartbeat: WorkerHeartbeatService,
    private readonly watchdog: OperationsWatchdogService,
    private readonly governance: GovernanceService,
    private readonly domainEvents: DomainEventsService,
    @InjectRepository(WebhookEventRecord)
    private readonly webhookRecords: Repository<WebhookEventRecord>,
    private readonly sloConfig: SloConfigService,
  ) {}

  async getDashboard(): Promise<OperationsDashboard> {
    const [health, workers, alerts, outbox, failedWebhooks] = await Promise.all([
      this.getHealthSummary(),
      this.getWorkersSummary(),
      this.getAlertsSummary(),
      this.domainEvents.backlogCounts(),
      this.webhookRecords.count({ where: { status: WebhookEventStatus.FAILED } }),
    ]);

    return {
      health,
      workers,
      watchdog: this.watchdog.status(),
      alerts,
      outbox,
      failedWebhooks,
      slos: this.sloConfig.getSlos(),
    };
  }

  async getHealthSummary(): Promise<HealthSummary> {
    let result: HealthCheckResult;
    try {
      result = await this.health.check([
        () => this.database.isHealthy('database'),
        () => this.migrations.isHealthy('migrations'),
        () => this.redis.isHealthy('redis'),
        () => this.kafka.isHealthy('kafka'),
        () => this.storage.isHealthy('storage'),
      ]);
    } catch (error) {
      result =
        (error as unknown as { response?: HealthCheckResult }).response ??
        ({ status: 'error', info: {}, error: {} } as HealthCheckResult);
    }

    const info = (result.info ?? {}) as Record<string, HealthIndicatorResult>;
    const error = (result.error ?? {}) as Record<string, HealthIndicatorResult>;

    const dependencies: HealthSummary['dependencies'] = {};
    const names = ['database', 'migrations', 'redis', 'kafka', 'storage'];
    for (const name of names) {
      const healthy = info[name]?.[name]?.status === 'up';
      dependencies[name] = {
        status: healthy ? 'up' : 'down',
        details: info[name] ?? error[name],
      };
    }

    const upCount = Object.values(dependencies).filter((d) => d.status === 'up').length;
    const status = upCount === names.length ? 'ok' : upCount === 0 ? 'down' : 'degraded';

    return { status, dependencies };
  }

  async getWorkersSummary(): Promise<OperationsDashboard['workers']> {
    return this.workerHeartbeat.getStatuses(CRITICAL_WORKERS);
  }

  async getAlertsSummary(): Promise<AlertSummary> {
    const alerts = await this.governance.listAlerts();
    const bySeverity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const alert of alerts) {
      bySeverity[alert.severity] = (bySeverity[alert.severity] ?? 0) + 1;
      byStatus[alert.status] = (byStatus[alert.status] ?? 0) + 1;
    }
    return { total: alerts.length, bySeverity, byStatus };
  }
}
