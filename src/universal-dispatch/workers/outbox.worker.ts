import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DispatchFlushOutboxProcessor } from './processors/dispatch-flush-outbox.processor';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private processing = false;

  constructor(private readonly processor: DispatchFlushOutboxProcessor) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.processor.schedule();
    } catch (error) {
      this.logger.warn(
        `Failed to schedule outbox flush: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.processing = false;
    }
  }
}
