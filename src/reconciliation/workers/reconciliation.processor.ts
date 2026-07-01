import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { RECONCILIATION_DAILY_QUEUE } from '../../workers';
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
    @Optional() @InjectQueue(RECONCILIATION_DAILY_QUEUE) private readonly queue?: Queue,
  ) {}

  async process(job: Job<ReconcileJob>): Promise<void> {
    this.logger.debug(`Running reconciliation ${job.data.type}`);
    await this.service.startRun({
      type: job.data.type,
      periodStart: new Date(job.data.periodStart),
      periodEnd: new Date(job.data.periodEnd),
      provider: job.data.provider,
      tolerance: job.data.tolerance,
      createdByUserId: job.data.createdByUserId,
    });
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
