import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { RECONCILIATION_DAILY_QUEUE } from '../../workers';
import { ReconciliationService } from '../reconciliation.service';
import { ReconcileJob } from './reconciliation.processor';

@Injectable()
export class ReconciliationScheduler {
  private readonly logger = new Logger(ReconciliationScheduler.name);

  constructor(
    private readonly service: ReconciliationService,
    @Optional() @InjectQueue(RECONCILIATION_DAILY_QUEUE) private readonly queue?: Queue,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyReconciliation(): Promise<void> {
    const yesterday = this.previousDayRange();
    for (const type of ['PAYMENTS', 'PAYOUTS']) {
      const job: ReconcileJob = {
        type,
        periodStart: yesterday.start.toISOString(),
        periodEnd: yesterday.end.toISOString(),
      };
      try {
        if (this.queue) {
          await this.queue.add('reconcile', job, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
          });
        } else {
          await this.service.startRun({
            type: job.type,
            periodStart: new Date(job.periodStart),
            periodEnd: new Date(job.periodEnd),
          });
        }
      } catch (error) {
        this.logger.warn(
          `Daily reconciliation failed for ${type}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private previousDayRange(): { start: Date; end: Date } {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    return { start, end };
  }
}
