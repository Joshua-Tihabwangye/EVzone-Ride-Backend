import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkerHeartbeatService } from '../../infrastructure/worker-heartbeat.service';
import { DispatchFlushOutboxProcessor } from './processors/dispatch-flush-outbox.processor';
import { ProcessRoleService } from '../../infrastructure/process-role.service';
import { UniversalOutboxService } from '../infrastructure/universal-outbox.service';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private processing = false;

  constructor(private readonly processor: DispatchFlushOutboxProcessor) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
  constructor(
    private readonly outbox: UniversalOutboxService,
    private readonly roles: ProcessRoleService,
    @Optional() private readonly heartbeat?: WorkerHeartbeatService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    if (!this.roles.runsWorkers()) return;
    try {
      await this.processor.schedule();
    } catch (error) {
      this.logger.warn(`Outbox flush failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await this.heartbeat?.record('OutboxWorker.run', 10);
      this.logger.warn(
        `Failed to schedule outbox flush: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.processing = false;
    }
  }
}
