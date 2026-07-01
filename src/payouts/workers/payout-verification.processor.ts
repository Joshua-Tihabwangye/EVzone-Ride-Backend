import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { PAYOUT_VERIFY_QUEUE } from '../../workers';
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
    @Optional() @InjectQueue(PAYOUT_VERIFY_QUEUE) private readonly queue?: Queue,
  ) {}

  async process(job: Job<VerifyPayoutJob>): Promise<void> {
    this.logger.debug(`Verifying payout ${job.data.payoutId}`);
    await this.statusService.verifyPayout(job.data.payoutId);
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
