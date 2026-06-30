import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { PayoutStatusService } from '../payout-status.service';

export interface VerifyPayoutJob {
  payoutId: string;
}

@Injectable()
@Processor('payout-verification')
export class PayoutVerificationProcessor {
  private readonly logger = new Logger(PayoutVerificationProcessor.name);

  constructor(
    private readonly statusService: PayoutStatusService,
    @InjectQueue('payout-verification') private readonly queue: Queue,
  ) {}

  async process(job: Job<VerifyPayoutJob>): Promise<void> {
    this.logger.debug(`Verifying payout ${job.data.payoutId}`);
    await this.statusService.verifyPayout(job.data.payoutId);
  }

  async scheduleVerification(payoutId: string, delayMs = 60_000): Promise<void> {
    await this.queue.add(
      'verify',
      { payoutId },
      { delay: delayMs, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
  }
}
