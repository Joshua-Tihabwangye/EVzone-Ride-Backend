import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DispatchExpireOffersProcessor } from './processors/dispatch-expire-offers.processor';

@Injectable()
export class OfferExpiryWorker {
  private readonly logger = new Logger(OfferExpiryWorker.name);
  private processing = false;

  constructor(private readonly processor: DispatchExpireOffersProcessor) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.processor.schedule();
    } catch (error) {
      this.logger.warn(
        `Failed to schedule offer expiry: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.processing = false;
    }
  }
}
