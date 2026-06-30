import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ProcessRoleService } from '../../infrastructure/process-role.service';
import { UniversalDispatchUnit } from '../domain/universal-dispatch.entities';
import { DispatchUnitStatus } from '../domain/universal-dispatch.enums';
import { DispatchLiveStateService } from '../infrastructure/dispatch-live-state.service';

@Injectable()
export class StaleCleanupWorker {
  private readonly logger = new Logger(StaleCleanupWorker.name);

  constructor(
    @InjectRepository(UniversalDispatchUnit)
    private readonly units: Repository<UniversalDispatchUnit>,
    private readonly config: ConfigService,
    private readonly liveState: DispatchLiveStateService,
    private readonly roles: ProcessRoleService,
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
    }
  }
}
