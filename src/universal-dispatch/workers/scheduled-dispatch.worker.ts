import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { UniversalServiceRequest } from '../domain/universal-dispatch.entities';
import { UniversalRequestStatus, UniversalScheduleType } from '../domain/universal-dispatch.enums';
import { UniversalMatchingService } from '../application/universal-matching.service';
import { UniversalDispatchStateMachineService } from '../application/universal-dispatch-state-machine.service';

@Injectable()
export class ScheduledDispatchWorker {
  private readonly logger = new Logger(ScheduledDispatchWorker.name);

  constructor(
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    private readonly matching: UniversalMatchingService,
    private readonly dataSource: DataSource,
    private readonly stateMachine: UniversalDispatchStateMachineService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    const now = new Date();
    const ready = await this.requests.find({
      where: {
        scheduleType: UniversalScheduleType.SCHEDULED,
        status: UniversalRequestStatus.SCHEDULED,
        scheduledAt: LessThan(now),
      },
      take: 50,
      order: { scheduledAt: 'ASC' },
    });

    for (const request of ready) {
      try {
        request.searchStartedAt = now;
        await this.dataSource.transaction(async (manager) =>
          this.stateMachine.transitionRequest(manager, request, UniversalRequestStatus.SEARCHING, {
            reasonCode: 'SCHEDULED_ACTIVATED',
          }),
        );
        await this.matching.matchRequest(request.id);
      } catch (error) {
        this.logger.warn(
          `Scheduled activation failed for request ${request.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
