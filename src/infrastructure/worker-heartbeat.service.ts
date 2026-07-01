import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../infrastructure/redis.service';

export interface WorkerHeartbeatStatus {
  lastRunAt?: string;
  stale: boolean;
}

export interface WorkerHeartbeatConfig {
  name: string;
  intervalSeconds: number;
}

@Injectable()
export class WorkerHeartbeatService {
  private readonly staleMultiplier: number;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.staleMultiplier = Number(this.config.get<string>('HEALTH_WORKER_STALE_MULTIPLIER') ?? 3);
  }

  async record(jobName: string, intervalSeconds?: number): Promise<void> {
    const ttlSeconds = intervalSeconds ? intervalSeconds * this.staleMultiplier : undefined;
    await this.redis.set(`worker:heartbeat:${jobName}`, new Date().toISOString(), ttlSeconds);
  }

  async getStatus(jobName: string, intervalSeconds?: number): Promise<WorkerHeartbeatStatus> {
    const value = await this.redis.get(`worker:heartbeat:${jobName}`);
    if (!value) {
      return { stale: true };
    }
    const lastRunAt = value;
    const stale = intervalSeconds
      ? Date.now() - new Date(lastRunAt).getTime() > intervalSeconds * this.staleMultiplier * 1000
      : false;
    return { lastRunAt, stale };
  }

  async getStatuses(jobs: WorkerHeartbeatConfig[]): Promise<Record<string, WorkerHeartbeatStatus>> {
    const result: Record<string, WorkerHeartbeatStatus> = {};
    for (const job of jobs) {
      result[job.name] = await this.getStatus(job.name, job.intervalSeconds);
    }
    return result;
  }
}
