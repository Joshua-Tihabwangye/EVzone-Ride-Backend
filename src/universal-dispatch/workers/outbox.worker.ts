import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkerHeartbeatService } from '../../infrastructure/worker-heartbeat.service';
import { ProcessRoleService } from '../../infrastructure/process-role.service';
import { UniversalOutboxService } from '../infrastructure/universal-outbox.service';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(
    private readonly outbox: UniversalOutboxService,
    private readonly roles: ProcessRoleService,
    @Optional() private readonly heartbeat?: WorkerHeartbeatService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    if (!this.roles.runsWorkers()) return;
    try {
      await this.outbox.flush();
    } catch (error) {
      this.logger.warn(`Outbox flush failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await this.heartbeat?.record('OutboxWorker.run', 10);
    }
  }
}
