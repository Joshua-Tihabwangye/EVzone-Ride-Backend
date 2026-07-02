import { InjectQueue, OnQueueEvent, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { DISPATCH_FLUSH_OUTBOX_QUEUE, WorkerHealthService, DeadLetterService } from '../../../workers';
import { BusinessMetricsService } from '../../../observability/metrics/business-metrics.service';
import { WithSpan } from '../../../observability/tracing/trace.decorator';
import { UniversalOutboxService } from '../../infrastructure/universal-outbox.service';

export interface FlushOutboxJob {
  limit?: number;
}

@Injectable()
@Processor(DISPATCH_FLUSH_OUTBOX_QUEUE)
export class DispatchFlushOutboxProcessor {
  private readonly logger = new Logger(DispatchFlushOutboxProcessor.name);

  constructor(
    private readonly outbox: UniversalOutboxService,
    private readonly health: WorkerHealthService,
    private readonly deadLetter: DeadLetterService,
    private readonly businessMetrics: BusinessMetricsService,
    @Optional() @InjectQueue(DISPATCH_FLUSH_OUTBOX_QUEUE) private readonly queue?: Queue,
  ) {}

  @WithSpan()
  async process(job: Job<FlushOutboxJob>): Promise<void> {
    this.logger.debug('Flushing universal outbox');
    this.businessMetrics.recordQueueJob(DISPATCH_FLUSH_OUTBOX_QUEUE, 'processed');
    await this.outbox.flush(job.data.limit ?? 100);
  }

  async schedule(): Promise<void> {
    if (this.queue) {
      await this.queue.add('flush', {}, { jobId: `flush:${Date.now()}` });
    } else {
      await this.process({ data: {} } as Job<FlushOutboxJob>);
    }
  }

  @OnQueueEvent('completed')
  onCompleted(): void {
    this.health.beat(DispatchFlushOutboxProcessor.name, 'success');
  }

  @OnQueueEvent('failed')
  onFailed(job: Job<FlushOutboxJob>, error: Error): void {
    this.businessMetrics.recordQueueJob(DISPATCH_FLUSH_OUTBOX_QUEUE, 'failed');
    this.health.beat(DispatchFlushOutboxProcessor.name, 'failure');
    void this.deadLetter.record(job, error);
  }
}
