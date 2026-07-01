import { InjectQueue, OnQueueEvent, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { DISPATCH_MATCH_QUEUE, WorkerHealthService, DeadLetterService } from '../../../workers';
import { UniversalMatchingService } from '../../application/universal-matching.service';

export interface MatchRequestJob {
  requestId: string;
}

@Injectable()
@Processor(DISPATCH_MATCH_QUEUE)
export class DispatchMatchProcessor {
  private readonly logger = new Logger(DispatchMatchProcessor.name);

  constructor(
    private readonly matching: UniversalMatchingService,
    private readonly health: WorkerHealthService,
    private readonly deadLetter: DeadLetterService,
    @Optional() @InjectQueue(DISPATCH_MATCH_QUEUE) private readonly queue?: Queue,
  ) {}

  async process(job: Job<MatchRequestJob>): Promise<void> {
    this.logger.debug(`Matching request ${job.data.requestId}`);
    await this.matching.matchRequest(job.data.requestId);
  }

  async schedule(requestId: string, delayMs = 0): Promise<void> {
    if (this.queue) {
      await this.queue.add(
        'match',
        { requestId },
        {
          jobId: `match:${requestId}`,
          delay: delayMs,
        },
      );
    } else {
      await this.process({ data: { requestId } } as Job<MatchRequestJob>);
    }
  }

  @OnQueueEvent('completed')
  onCompleted(): void {
    this.health.beat(DispatchMatchProcessor.name, 'success');
  }

  @OnQueueEvent('failed')
  onFailed(job: Job<MatchRequestJob>, error: Error): void {
    this.health.beat(DispatchMatchProcessor.name, 'failure');
    void this.deadLetter.record(job, error);
  }
}
