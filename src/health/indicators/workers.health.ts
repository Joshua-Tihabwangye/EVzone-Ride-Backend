import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { WorkerHeartbeatConfig, WorkerHeartbeatService } from '../../infrastructure/worker-heartbeat.service';

const CRITICAL_WORKERS: WorkerHeartbeatConfig[] = [
  { name: 'WebhookRetryWorker.run', intervalSeconds: 30 },
  { name: 'MatchingWorker.run', intervalSeconds: 5 },
  { name: 'OfferExpiryWorker.run', intervalSeconds: 10 },
  { name: 'StaleCleanupWorker.run', intervalSeconds: 30 },
  { name: 'ScheduledDispatchWorker.run', intervalSeconds: 60 },
  { name: 'OutboxWorker.run', intervalSeconds: 10 },
  { name: 'MatchingService.processQueue', intervalSeconds: 5 },
  { name: 'RidesService.processMatchingAndSchedules', intervalSeconds: 10 },
  { name: 'CorporatePayService.retryOutbox', intervalSeconds: 30 },
  { name: 'CorporateIntegrationService.syncActiveRequests', intervalSeconds: 60 },
  { name: 'CorporateIntegrationService.deliverEvents', intervalSeconds: 30 },
];

@Injectable()
export class WorkersHealthIndicator extends HealthIndicator {
  constructor(private readonly heartbeat: WorkerHeartbeatService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const statuses = await this.heartbeat.getStatuses(CRITICAL_WORKERS);
    const stale = Object.entries(statuses)
      .filter(([, status]) => status.stale)
      .map(([name]) => name);
    const isHealthy = stale.length === 0;
    const result = this.getStatus(key, isHealthy, { workers: statuses, stale });
    if (!isHealthy) {
      throw new HealthCheckError(`Stale workers: ${stale.join(', ')}`, result);
    }
    return result;
  }
}
