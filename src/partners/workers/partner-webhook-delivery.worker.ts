import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { BusinessMetricsService } from '../../observability/metrics/business-metrics.service';
import { PARTNER_WEBHOOK_DELIVERY_QUEUE } from '../../workers/bullmq-config.service';
import { PartnerWebhookService } from '../partner-webhook.service';

@Injectable()
@Processor(PARTNER_WEBHOOK_DELIVERY_QUEUE, { concurrency: 3 })
export class PartnerWebhookDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(PartnerWebhookDeliveryWorker.name);

  constructor(
    private readonly webhookService: PartnerWebhookService,
    @Optional() private readonly metrics?: BusinessMetricsService,
    @Optional() @InjectQueue(PARTNER_WEBHOOK_DELIVERY_QUEUE) private readonly queue?: Queue,
  ) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<{ processed: number }> {
    this.logger.debug(`Processing partner webhook delivery job ${job.id}`);
    this.metrics?.recordQueueJob(PARTNER_WEBHOOK_DELIVERY_QUEUE, 'process');
    return this.webhookService.processPendingDeliveries(job.data?.limit ? Number(job.data.limit) : 25);
  }
}
