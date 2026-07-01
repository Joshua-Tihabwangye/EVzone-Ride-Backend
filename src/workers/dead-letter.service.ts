import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { BullmqConfigService } from './bullmq-config.service';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);
  private readonly deadLetterQueues = new Map<string, Queue>();

  constructor(private readonly config: BullmqConfigService) {}

  async record<T>(job: Job<T>, error: Error): Promise<void> {
    if (!this.config.isEnabled()) {
      return;
    }
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    const queue = this.getQueue(job.queueName);
    try {
      await queue.add(
        'failed',
        {
          originalName: job.name,
          originalQueue: job.queueName,
          data: job.data,
          failedReason: error.message,
          attemptsMade: job.attemptsMade,
          failedAt: new Date().toISOString(),
        },
        {
          jobId: job.id ? `dl:${job.id}` : undefined,
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 100 },
        },
      );
      this.logger.warn(`Moved job ${job.id} from ${job.queueName} to dead letter`);
    } catch (enqueueError) {
      this.logger.error(
        `Failed to move job ${job.id} to dead letter: ${
          enqueueError instanceof Error ? enqueueError.message : String(enqueueError)
        }`,
      );
    }
  }

  private getQueue(sourceQueueName: string): Queue {
    const name = this.config.deadLetterQueueName(sourceQueueName);
    let queue = this.deadLetterQueues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.config.connection,
        prefix: this.config.prefix,
        defaultJobOptions: {
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 100 },
        },
      });
      this.deadLetterQueues.set(name, queue);
    }
    return queue;
  }

  async onModuleDestroy(): Promise<void> {
    for (const queue of this.deadLetterQueues.values()) {
      await queue.close();
    }
    this.deadLetterQueues.clear();
  }
}
