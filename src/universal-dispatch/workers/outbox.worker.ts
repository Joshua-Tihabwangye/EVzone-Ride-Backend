import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
<<<<<<< HEAD
import { DispatchFlushOutboxProcessor } from './processors/dispatch-flush-outbox.processor';
=======
import { ProcessRoleService } from '../../infrastructure/process-role.service';
import { UniversalOutboxService } from '../infrastructure/universal-outbox.service';
>>>>>>> origin/main

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private processing = false;

<<<<<<< HEAD
  constructor(private readonly processor: DispatchFlushOutboxProcessor) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
=======
  constructor(
    private readonly outbox: UniversalOutboxService,
    private readonly roles: ProcessRoleService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    if (!this.roles.runsWorkers()) return;
>>>>>>> origin/main
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
