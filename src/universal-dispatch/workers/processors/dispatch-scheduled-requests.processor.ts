import { InjectQueue, OnQueueEvent, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Queue, Job } from 'bullmq';
import { DISPATCH_SCHEDULED_REQUESTS_QUEUE, WorkerHealthService, DeadLetterService } from '../../../workers';
import { BusinessMetricsService } from '../../../observability/metrics/business-metrics.service';
import { WithSpan } from '../../../observability/tracing/trace.decorator';
import { UniversalServiceRequest } from '../../domain/universal-dispatch.entities';
import { UniversalRequestStatus, UniversalScheduleType } from '../../domain/universal-dispatch.enums';
import { UniversalMatchingService } from '../../application/universal-matching.service';
import { UniversalDispatchStateMachineService } from '../../application/universal-dispatch-state-machine.service';

export interface ScheduledRequestsJob {
  batchSize?: number;
}

@Injectable()
@Processor(DISPATCH_SCHEDULED_REQUESTS_QUEUE)
export class DispatchScheduledRequestsProcessor {
  private readonly logger = new Logger(DispatchScheduledRequestsProcessor.name);

  constructor(
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    private readonly matching: UniversalMatchingService,
    private readonly dataSource: DataSource,
    private readonly stateMachine: UniversalDispatchStateMachineService,
    private readonly health: WorkerHealthService,
    private readonly deadLetter: DeadLetterService,
    private readonly businessMetrics: BusinessMetricsService,
    @Optional() @InjectQueue(DISPATCH_SCHEDULED_REQUESTS_QUEUE) private readonly queue?: Queue,
  ) {}

  @WithSpan()
  async process(job: Job<ScheduledRequestsJob>): Promise<void> {
    this.businessMetrics.recordQueueJob(DISPATCH_SCHEDULED_REQUESTS_QUEUE, 'processed');
    const batchSize = job.data.batchSize ?? 50;
    const now = new Date();
    const ready = await this.requests.find({
      where: {
        scheduleType: UniversalScheduleType.SCHEDULED,
        status: UniversalRequestStatus.SCHEDULED,
        scheduledAt: LessThan(now),
      },
      take: batchSize,
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

  async schedule(): Promise<void> {
    if (this.queue) {
      await this.queue.add('scheduled-requests', {}, { jobId: `scheduled-requests:${Date.now()}` });
    } else {
      await this.process({ data: {} } as Job<ScheduledRequestsJob>);
    }
  }

  @OnQueueEvent('completed')
  onCompleted(): void {
    this.health.beat(DispatchScheduledRequestsProcessor.name, 'success');
  }

  @OnQueueEvent('failed')
  onFailed(job: Job<ScheduledRequestsJob>, error: Error): void {
    this.businessMetrics.recordQueueJob(DISPATCH_SCHEDULED_REQUESTS_QUEUE, 'failed');
    this.health.beat(DispatchScheduledRequestsProcessor.name, 'failure');
    void this.deadLetter.record(job, error);
  }
}
