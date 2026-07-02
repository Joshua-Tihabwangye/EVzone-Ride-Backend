import { InjectQueue, OnQueueEvent, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { PAYOUT_VERIFY_QUEUE } from '../../workers';
import { BusinessMetricsService } from '../../observability/metrics/business-metrics.service';
import { WithSpan } from '../../observability/tracing/trace.decorator';
import { PayoutStatusService } from '../payout-status.service';

export interface VerifyPayoutJob {
  payoutId: string;
}

@Injectable()
@Processor(PAYOUT_VERIFY_QUEUE)
export class PayoutVerificationProcessor {
  private readonly logger = new Logger(PayoutVerificationProcessor.name);

  constructor(
    private readonly statusService: PayoutStatusService,
    private readonly businessMetrics: BusinessMetricsService,
    @Optional() @InjectQueue(PAYOUT_VERIFY_QUEUE) private readonly queue?: Queue,
  ) {}

  @WithSpan()
  async process(job: Job<VerifyPayoutJob>): Promise<void> {
    this.logger.debug(`Verifying payout ${job.data.payoutId}`);
    this.businessMetrics.recordQueueJob(PAYOUT_VERIFY_QUEUE, 'processed');
    await this.statusService.verifyPayout(job.data.payoutId);
  }

  @OnQueueEvent('failed')
  onFailed(_job: Job<VerifyPayoutJob>): void {
    this.businessMetrics.recordQueueJob(PAYOUT_VERIFY_QUEUE, 'failed');
  }

  async scheduleVerification(payoutId: string, delayMs = 60_000): Promise<void> {
    if (this.queue) {
      await this.queue.add(
        'verify',
        { payoutId },
        { delay: delayMs, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
      );
    } else {
      await this.process({ data: { payoutId } } as Job<VerifyPayoutJob>);
    }
  }
}
