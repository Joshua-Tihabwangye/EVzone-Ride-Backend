import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UniversalDispatchUnit } from '../domain/universal-dispatch.entities';
import { DispatchUnitStatus } from '../domain/universal-dispatch.enums';
import { DispatchLiveStateService } from '../infrastructure/dispatch-live-state.service';
import { UniversalDispatchStateMachineService } from '../application/universal-dispatch-state-machine.service';

@Injectable()
export class StaleCleanupWorker {
  private readonly logger = new Logger(StaleCleanupWorker.name);

  constructor(
    @InjectRepository(UniversalDispatchUnit)
    private readonly units: Repository<UniversalDispatchUnit>,
    private readonly config: ConfigService,
    private readonly liveState: DispatchLiveStateService,
    private readonly dataSource: DataSource,
    private readonly stateMachine: UniversalDispatchStateMachineService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async run(): Promise<void> {
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
      unit.offlineAt = new Date();
      await this.dataSource.transaction(async (manager) =>
        this.stateMachine.transitionUnit(manager, unit, DispatchUnitStatus.OFFLINE, {
          reasonCode: 'STALE_LOCATION',
        }),
      );
      await this.liveState.removeLiveSnapshot(unit.id, unit.marketId);
      this.logger.log(`Marked stale dispatch unit ${unit.id} offline`);
    }
  }
}
