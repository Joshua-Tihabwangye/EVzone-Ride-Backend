import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DispatchScheduledRequestsProcessor } from './processors/dispatch-scheduled-requests.processor';

@Injectable()
export class ScheduledDispatchWorker {
  private readonly logger = new Logger(ScheduledDispatchWorker.name);
  private processing = false;

  constructor(private readonly processor: DispatchScheduledRequestsProcessor) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.processor.schedule();
    } catch (error) {
      this.logger.warn(
        `Failed to schedule dispatch activation: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.processing = false;
    }
  }
}
