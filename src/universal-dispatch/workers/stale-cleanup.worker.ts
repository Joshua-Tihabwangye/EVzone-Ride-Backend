import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
<<<<<<< HEAD
import { DispatchStaleCleanupProcessor } from './processors/dispatch-stale-cleanup.processor';
=======
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WorkerHeartbeatService } from '../../infrastructure/worker-heartbeat.service';
import { ProcessRoleService } from '../../infrastructure/process-role.service';
import { UniversalDispatchUnit } from '../domain/universal-dispatch.entities';
import { DispatchUnitStatus } from '../domain/universal-dispatch.enums';
import { DispatchLiveStateService } from '../infrastructure/dispatch-live-state.service';
>>>>>>> origin/main

@Injectable()
export class StaleCleanupWorker {
  private readonly logger = new Logger(StaleCleanupWorker.name);
  private processing = false;

<<<<<<< HEAD
  constructor(private readonly processor: DispatchStaleCleanupProcessor) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async run(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.processor.schedule();
    } catch (error) {
      this.logger.warn(
        `Failed to schedule stale cleanup: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.processing = false;
=======
  constructor(
    @InjectRepository(UniversalDispatchUnit)
    private readonly units: Repository<UniversalDispatchUnit>,
    private readonly config: ConfigService,
    private readonly liveState: DispatchLiveStateService,
    private readonly roles: ProcessRoleService,
    @Optional() private readonly heartbeat?: WorkerHeartbeatService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async run(): Promise<void> {
    if (!this.roles.runsWorkers()) return;
    const thresholdSeconds = Number(this.config.get<string>('DISPATCH_STALE_LOCATION_SECONDS') ?? 300);
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000);
    const stale = await this.units.find({
      where: {
        status: DispatchUnitStatus.AVAILABLE,
        locationRecordedAt: LessThan(cutoff),
      },
      take: 200,
    });
    for (const unit of stale) {
      unit.status = DispatchUnitStatus.OFFLINE;
      unit.offlineAt = new Date();
      await this.units.save(unit);
      await this.liveState.removeLiveSnapshot(unit.id, unit.marketId);
      this.logger.log(`Marked stale dispatch unit ${unit.id} offline`);
>>>>>>> origin/main
    }
    await this.heartbeat?.record('StaleCleanupWorker.run', 30);
  }
}
