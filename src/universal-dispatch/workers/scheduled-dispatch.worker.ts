import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
<<<<<<< HEAD
import { DispatchScheduledRequestsProcessor } from './processors/dispatch-scheduled-requests.processor';
=======
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { WorkerHeartbeatService } from '../../infrastructure/worker-heartbeat.service';
import { ProcessRoleService } from '../../infrastructure/process-role.service';
import { UniversalServiceRequest } from '../domain/universal-dispatch.entities';
import { UniversalRequestStatus, UniversalScheduleType } from '../domain/universal-dispatch.enums';
import { UniversalMatchingService } from '../application/universal-matching.service';
>>>>>>> origin/main

@Injectable()
export class ScheduledDispatchWorker {
  private readonly logger = new Logger(ScheduledDispatchWorker.name);
  private processing = false;

<<<<<<< HEAD
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
=======
  constructor(
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    private readonly matching: UniversalMatchingService,
    private readonly roles: ProcessRoleService,
    @Optional() private readonly heartbeat?: WorkerHeartbeatService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    if (!this.roles.runsWorkers()) return;
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
        request.status = UniversalRequestStatus.SEARCHING;
        request.searchStartedAt = now;
        await this.requests.save(request);
        await this.matching.matchRequest(request.id);
      } catch (error) {
        this.logger.warn(
          `Scheduled activation failed for request ${request.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
>>>>>>> origin/main
    }
    await this.heartbeat?.record('ScheduledDispatchWorker.run', 60);
  }
}
