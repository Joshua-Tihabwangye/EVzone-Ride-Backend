import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UniversalOutboxService } from '../infrastructure/universal-outbox.service';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(private readonly outbox: UniversalOutboxService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    try {
      await this.outbox.flush();
    } catch (error) {
      this.logger.warn(`Outbox flush failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
