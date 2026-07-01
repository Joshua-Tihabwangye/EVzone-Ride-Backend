import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DefaultJobOptions, QueueOptions } from 'bullmq';

export const DISPATCH_MATCH_QUEUE = 'dispatch-match-request';
export const DISPATCH_EXPIRE_OFFERS_QUEUE = 'dispatch-expire-offers';
export const DISPATCH_FLUSH_OUTBOX_QUEUE = 'dispatch-flush-outbox';
export const DISPATCH_SCHEDULED_REQUESTS_QUEUE = 'dispatch-scheduled-requests';
export const DISPATCH_STALE_CLEANUP_QUEUE = 'dispatch-stale-cleanup';
export const PAYOUT_VERIFY_QUEUE = 'payout-verify';
export const RECONCILIATION_DAILY_QUEUE = 'reconciliation-daily-run';

export const WORKER_QUEUE_NAMES = [
  DISPATCH_MATCH_QUEUE,
  DISPATCH_EXPIRE_OFFERS_QUEUE,
  DISPATCH_FLUSH_OUTBOX_QUEUE,
  DISPATCH_SCHEDULED_REQUESTS_QUEUE,
  DISPATCH_STALE_CLEANUP_QUEUE,
  PAYOUT_VERIFY_QUEUE,
  RECONCILIATION_DAILY_QUEUE,
] as const;

export type WorkerQueueName = (typeof WORKER_QUEUE_NAMES)[number];

@Injectable()
export class BullmqConfigService {
  constructor(private readonly config: ConfigService) {}

  get redisUrl(): string | undefined {
    return this.config.get<string>('REDIS_URL')?.trim();
  }

  isEnabled(): boolean {
    return Boolean(this.redisUrl);
  }

  get connection(): QueueOptions['connection'] {
    const url = this.redisUrl;
    if (!url) {
      throw new Error('BullMQ is not configured; REDIS_URL is missing');
    }
    return { url };
  }

  get prefix(): string | undefined {
    return this.config.get<string>('BULLMQ_PREFIX')?.trim();
  }

  get concurrency(): number {
    return Number(this.config.get<string>('BULLMQ_CONCURRENCY') ?? 5);
  }

  get deadLetterTtlDays(): number {
    return Number(this.config.get<string>('BULLMQ_DEAD_LETTER_TTL_DAYS') ?? 7);
  }

  deadLetterQueueName(queueName: string): string {
    return `${queueName}-dead-letter`;
  }

  get defaultJobOptions(): DefaultJobOptions {
    const attempts = Number(this.config.get<string>('BULLMQ_JOB_ATTEMPTS') ?? 3);
    const delay = Number(this.config.get<string>('BULLMQ_BACKOFF_DELAY_MS') ?? 10_000);
    return {
      attempts,
      backoff: { type: 'exponential', delay },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    };
  }
}
