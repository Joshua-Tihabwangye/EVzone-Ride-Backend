import { InjectQueue, OnQueueEvent, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { RECONCILIATION_DAILY_QUEUE } from '../../workers';
import { BusinessMetricsService } from '../../observability/metrics/business-metrics.service';
import { WithSpan } from '../../observability/tracing/trace.decorator';
import { ReconciliationService } from '../reconciliation.service';

export interface ReconcileJob {
  type: string;
  periodStart: string;
  periodEnd: string;
  provider?: string;
  tolerance?: number;
  createdByUserId?: string;
}

@Injectable()
@Processor(RECONCILIATION_DAILY_QUEUE)
export class ReconciliationProcessor {
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(
    private readonly service: ReconciliationService,
    private readonly businessMetrics: BusinessMetricsService,
    @Optional() @InjectQueue(RECONCILIATION_DAILY_QUEUE) private readonly queue?: Queue,
  ) {}

  @WithSpan()
  async process(job: Job<ReconcileJob>): Promise<void> {
    this.logger.debug(`Running reconciliation ${job.data.type}`);
    this.businessMetrics.recordQueueJob(RECONCILIATION_DAILY_QUEUE, 'processed');
    await this.service.startRun({
      type: job.data.type,
      periodStart: new Date(job.data.periodStart),
      periodEnd: new Date(job.data.periodEnd),
      provider: job.data.provider,
      tolerance: job.data.tolerance,
      createdByUserId: job.data.createdByUserId,
    });
  }

  @OnQueueEvent('failed')
  onFailed(_job: Job<ReconcileJob>): void {
    this.businessMetrics.recordQueueJob(RECONCILIATION_DAILY_QUEUE, 'failed');
  }

  async schedule(job: ReconcileJob, delayMs = 0): Promise<void> {
    if (this.queue) {
      await this.queue.add('reconcile', job, {
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      });
    } else {
      await this.process({ data: job } as Job<ReconcileJob>);
    }
  }
}
