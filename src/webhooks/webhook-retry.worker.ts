import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WorkerHeartbeatService } from '../infrastructure/worker-heartbeat.service';
import { WebhookEventService } from './webhook-event.service';

@Injectable()
export class WebhookRetryWorker {
  private readonly logger = new Logger(WebhookRetryWorker.name);

  constructor(
    private readonly events: WebhookEventService,
    @Optional() private readonly heartbeat?: WorkerHeartbeatService,
  ) {}

  @Cron('*/30 * * * * *')
  async run(): Promise<void> {
    try {
      const pending = await this.events.claimFailedForRetry(20);
      for (const record of pending) {
        try {
          await this.events.retry(record.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Webhook retry failed for ${record.id}: ${message}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Webhook retry worker failed: ${message}`);
    } finally {
      await this.heartbeat?.record('WebhookRetryWorker.run', 30);
    }
  }
}
