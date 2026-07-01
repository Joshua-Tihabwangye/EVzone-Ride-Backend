import { InjectQueue, OnQueueEvent, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Queue, Job } from 'bullmq';
import { DISPATCH_STALE_CLEANUP_QUEUE, WorkerHealthService, DeadLetterService } from '../../../workers';
import { UniversalDispatchUnit } from '../../domain/universal-dispatch.entities';
import { DispatchUnitStatus } from '../../domain/universal-dispatch.enums';
import { DispatchLiveStateService } from '../../infrastructure/dispatch-live-state.service';
import { UniversalDispatchStateMachineService } from '../../application/universal-dispatch-state-machine.service';

export interface StaleCleanupJob {
  batchSize?: number;
}

@Injectable()
@Processor(DISPATCH_STALE_CLEANUP_QUEUE)
export class DispatchStaleCleanupProcessor {
  private readonly logger = new Logger(DispatchStaleCleanupProcessor.name);

  constructor(
    @InjectRepository(UniversalDispatchUnit)
    private readonly units: Repository<UniversalDispatchUnit>,
    private readonly config: ConfigService,
    private readonly liveState: DispatchLiveStateService,
    private readonly dataSource: DataSource,
    private readonly stateMachine: UniversalDispatchStateMachineService,
    private readonly health: WorkerHealthService,
    private readonly deadLetter: DeadLetterService,
    @Optional() @InjectQueue(DISPATCH_STALE_CLEANUP_QUEUE) private readonly queue?: Queue,
  ) {}

  async process(job: Job<StaleCleanupJob>): Promise<void> {
    const batchSize = job.data.batchSize ?? 200;
    const thresholdSeconds = Number(this.config.get<string>('DISPATCH_STALE_LOCATION_SECONDS') ?? 300);
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000);
    const stale = await this.units.find({
      where: {
        status: DispatchUnitStatus.AVAILABLE,
        locationRecordedAt: LessThan(cutoff),
      },
      take: batchSize,
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

  async schedule(): Promise<void> {
    if (this.queue) {
      await this.queue.add('stale-cleanup', {}, { jobId: `stale-cleanup:${Date.now()}` });
    } else {
      await this.process({ data: {} } as Job<StaleCleanupJob>);
    }
  }

  @OnQueueEvent('completed')
  onCompleted(): void {
    this.health.beat(DispatchStaleCleanupProcessor.name, 'success');
  }

  @OnQueueEvent('failed')
  onFailed(job: Job<StaleCleanupJob>, error: Error): void {
    this.health.beat(DispatchStaleCleanupProcessor.name, 'failure');
    void this.deadLetter.record(job, error);
  }
}
