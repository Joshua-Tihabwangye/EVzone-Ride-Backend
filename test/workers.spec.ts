import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BusinessMetricsService } from '../src/observability/metrics/business-metrics.service';
import { createBusinessMetricsMock } from './helpers/metrics.mock';
import { DataSource } from 'typeorm';
import { Queue, Job } from 'bullmq';
import {
  BullmqConfigService,
  DeadLetterService,
  WorkerHealthService,
  WorkersModule,
  PAYOUT_VERIFY_QUEUE,
  RECONCILIATION_DAILY_QUEUE,
  WorkerHeartbeat,
} from '../src/workers';
import { HealthController } from '../src/health/health.controller';
import { DispatchMatchProcessor } from '../src/universal-dispatch/workers/processors/dispatch-match.processor';
import { UniversalMatchingService } from '../src/universal-dispatch/application/universal-matching.service';

describe('Workers infrastructure', () => {
  describe('WorkerHealthService', () => {
    it('tracks successful beats', () => {
      const service = new WorkerHealthService();
      service.beat('match', 'success');
      service.beat('match', 'success');
      const status = service.status();
      expect(status.match).toMatchObject({
        healthy: true,
        jobsProcessed: 2,
        jobsFailed: 0,
        consecutiveFailures: 0,
      });
      expect(status.match.lastRunAt).toBeInstanceOf(Date);
    });

    it('tracks failures and marks unhealthy after consecutive failures', () => {
      const service = new WorkerHealthService();
      service.beat('expire', 'failure');
      service.beat('expire', 'failure');
      service.beat('expire', 'failure');
      const status = service.status();
      expect(status.expire).toMatchObject({
        healthy: false,
        jobsFailed: 3,
        consecutiveFailures: 3,
        reason: 'too many failures',
      });
    });

    it('resets consecutive failures after a success', () => {
      const service = new WorkerHealthService();
      service.beat('cleanup', 'failure');
      service.beat('cleanup', 'failure');
      service.beat('cleanup', 'success');
      const status = service.status();
      expect(status.cleanup).toMatchObject({
        healthy: true,
        consecutiveFailures: 0,
        jobsFailed: 2,
      });
    });

    it('marks workers stale when they have not run recently', () => {
      const service = new WorkerHealthService();
      const old = new Date(Date.now() - 120_000);
      service.beat('stale', 'success');
      (service as unknown as { heartbeats: Map<string, WorkerHeartbeat> }).heartbeats.set('stale', {
        lastRunAt: old,
        lastErrorAt: undefined,
        consecutiveFailures: 0,
        jobsProcessed: 1,
        jobsFailed: 0,
      });
      const status = service.status();
      expect(status.stale.healthy).toBe(false);
      expect(status.stale.reason).toBe('stale');
    });
  });

  describe('DeadLetterService', () => {
    it('does nothing when BullMQ is disabled', async () => {
      const config = new BullmqConfigService(new ConfigService({ REDIS_URL: '' }));
      const service = new DeadLetterService(config);
      const job = {
        id: 'j1',
        queueName: 'q',
        name: 'x',
        data: {},
        opts: { attempts: 3 },
        attemptsMade: 3,
      } as unknown as Job;
      await expect(service.record(job, new Error('boom'))).resolves.toBeUndefined();
    });

    it('does not record until attempts are exhausted', async () => {
      const config = new BullmqConfigService(new ConfigService({ REDIS_URL: 'redis://localhost:6379' }));
      const service = new DeadLetterService(config);
      const add = jest.fn().mockResolvedValue(undefined);
      (service as unknown as { deadLetterQueues: Map<string, Queue> }).deadLetterQueues.set('q:dead-letter', {
        add,
      } as unknown as Queue);
      const job = {
        id: 'j1',
        queueName: 'q',
        name: 'x',
        data: {},
        opts: { attempts: 3 },
        attemptsMade: 1,
      } as unknown as Job;
      await service.record(job, new Error('boom'));
      expect(add).not.toHaveBeenCalled();
    });
  });

  describe('DispatchMatchProcessor', () => {
    it('falls back to synchronous matching when no queue is configured', async () => {
      const matchRequest = jest.fn().mockResolvedValue(undefined);
      const moduleRef = await Test.createTestingModule({
        providers: [
          DispatchMatchProcessor,
          { provide: UniversalMatchingService, useValue: { matchRequest } },
          WorkerHealthService,
          DeadLetterService,
          {
            provide: BullmqConfigService,
            useValue: new BullmqConfigService(new ConfigService({ REDIS_URL: '' })),
          },
          { provide: BusinessMetricsService, useValue: createBusinessMetricsMock() },
        ],
      }).compile();

      const processor = moduleRef.get(DispatchMatchProcessor);
      await processor.schedule('req-1');
      expect(matchRequest).toHaveBeenCalledWith('req-1');
    });

    it('enqueues an idempotent job when a queue is available', async () => {
      const matchRequest = jest.fn().mockResolvedValue(undefined);
      const add = jest.fn().mockResolvedValue(undefined);
      const queue = { add } as unknown as Queue;
      const processor = new DispatchMatchProcessor(
        { matchRequest } as unknown as UniversalMatchingService,
        new WorkerHealthService(),
        { record: jest.fn() } as unknown as DeadLetterService,
        createBusinessMetricsMock(),
        queue,
      );

      await processor.schedule('req-2', 5_000);
      expect(add).toHaveBeenCalledWith(
        'match',
        { requestId: 'req-2' },
        expect.objectContaining({ jobId: 'match:req-2', delay: 5_000 }),
      );
      expect(matchRequest).not.toHaveBeenCalled();
    });
  });

  describe('WorkersModule', () => {
    it('registers services without BullMQ when REDIS_URL is absent', async () => {
      const original = process.env.REDIS_URL;
      delete process.env.REDIS_URL;
      const moduleRef = await Test.createTestingModule({
        imports: [WorkersModule.register()],
      }).compile();

      expect(moduleRef.get(BullmqConfigService).isEnabled()).toBe(false);
      expect(moduleRef.get(WorkerHealthService)).toBeInstanceOf(WorkerHealthService);
      expect(moduleRef.get(DeadLetterService)).toBeInstanceOf(DeadLetterService);
      await moduleRef.close();
      if (original !== undefined) process.env.REDIS_URL = original;
    });

    it('enables BullMQ when REDIS_URL is present', async () => {
      const original = process.env.REDIS_URL;
      process.env.REDIS_URL = 'redis://localhost:6379';
      const moduleRef = await Test.createTestingModule({
        imports: [WorkersModule.register()],
      }).compile();

      expect(moduleRef.get(BullmqConfigService).isEnabled()).toBe(true);
      await moduleRef.close();
      if (original !== undefined) process.env.REDIS_URL = original;
      else delete process.env.REDIS_URL;
    });
  });

  describe('HealthController workers endpoint', () => {
    it('reports degraded when a worker is unhealthy', () => {
      const health = new WorkerHealthService();
      health.beat('expire', 'failure');
      health.beat('expire', 'failure');
      health.beat('expire', 'failure');

      const controller = new HealthController(
        { query: jest.fn(), isInitialized: true } as unknown as DataSource,
        health,
      );
      const result = controller.workers();
      expect(result.status).toBe('degraded');
      expect(result.workers.expire.healthy).toBe(false);
    });

    it('reports ok when all tracked workers are healthy', () => {
      const health = new WorkerHealthService();
      health.beat('match', 'success');

      const controller = new HealthController(
        { query: jest.fn(), isInitialized: true } as unknown as DataSource,
        health,
      );
      const result = controller.workers();
      expect(result.status).toBe('ok');
      expect(result.workers.match.healthy).toBe(true);
    });
  });

  describe('Queue name constants', () => {
    it('uses consistent central queue names for financial workers', () => {
      expect(PAYOUT_VERIFY_QUEUE).toBe('payout-verify');
      expect(RECONCILIATION_DAILY_QUEUE).toBe('reconciliation-daily-run');
    });
  });
});
