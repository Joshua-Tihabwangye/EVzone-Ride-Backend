import { Injectable } from '@nestjs/common';

export interface WorkerHeartbeat {
  lastRunAt?: Date;
  lastErrorAt?: Date;
  consecutiveFailures: number;
  jobsProcessed: number;
  jobsFailed: number;
}

export interface WorkerHealthStatus extends WorkerHeartbeat {
  healthy: boolean;
  reason?: string;
}

@Injectable()
export class WorkerHealthService {
  private readonly heartbeats = new Map<string, WorkerHeartbeat>();

  beat(workerName: string, outcome: 'success' | 'failure' = 'success'): void {
    const existing = this.heartbeats.get(workerName) ?? {
      consecutiveFailures: 0,
      jobsProcessed: 0,
      jobsFailed: 0,
    };
    const now = new Date();
    if (outcome === 'failure') {
      this.heartbeats.set(workerName, {
        lastRunAt: existing.lastRunAt ?? now,
        lastErrorAt: now,
        consecutiveFailures: existing.consecutiveFailures + 1,
        jobsProcessed: existing.jobsProcessed,
        jobsFailed: existing.jobsFailed + 1,
      });
    } else {
      this.heartbeats.set(workerName, {
        lastRunAt: now,
        lastErrorAt: existing.lastErrorAt,
        consecutiveFailures: 0,
        jobsProcessed: existing.jobsProcessed + 1,
        jobsFailed: existing.jobsFailed,
      });
    }
  }

  status(maxStaleMs = 60_000): Record<string, WorkerHealthStatus> {
    const now = Date.now();
    const result: Record<string, WorkerHealthStatus> = {};
    for (const [name, heartbeat] of this.heartbeats) {
      const stale = heartbeat.lastRunAt ? now - heartbeat.lastRunAt.getTime() > maxStaleMs : true;
      const tooManyFailures = heartbeat.consecutiveFailures >= 3;
      result[name] = {
        ...heartbeat,
        healthy: !stale && !tooManyFailures,
        reason: stale ? 'stale' : tooManyFailures ? 'too many failures' : undefined,
      };
    }
    return result;
  }

  get(workerName: string): WorkerHeartbeat | undefined {
    return this.heartbeats.get(workerName);
  }
}
