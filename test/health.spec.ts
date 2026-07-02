import 'reflect-metadata';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, INestApplication } from '@nestjs/common';
import { Response } from 'express';
import { Test } from '@nestjs/testing';
import { HealthCheckError, TerminusModule } from '@nestjs/terminus';
import { DataSource } from 'typeorm';
import supertest from 'supertest';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HealthController } from '../src/health/health.controller';
import { DatabaseHealthIndicator } from '../src/health/indicators/database.health';
import { MigrationsHealthIndicator } from '../src/health/indicators/migrations.health';
import { RedisHealthIndicator } from '../src/health/indicators/redis.health';
import { KafkaHealthIndicator } from '../src/health/indicators/kafka.health';
import { StorageHealthIndicator } from '../src/health/indicators/storage.health';
import { WorkersHealthIndicator } from '../src/health/indicators/workers.health';
import { WorkerHealthService } from '../src/workers';
import { ProductionConfigService } from '../src/infrastructure/production-config.service';

@Catch(HttpException)
class TestExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const raw = exception.getResponse();
    response.status(status).json({
      success: false,
      error: { ...(typeof raw === 'object' && raw !== null ? raw : { message: raw }), statusCode: status },
    });
  }
}

describe('Health endpoints (Phase 1.8)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        {
          provide: DataSource,
          useValue: { isInitialized: true, options: { type: 'postgres' } },
        },
        {
          provide: WorkerHealthService,
          useValue: { status: () => ({}) },
        },
        {
          provide: ProductionConfigService,
          useValue: {},
        },
        {
          provide: DatabaseHealthIndicator,
          useValue: {
            isHealthy: async (key: string) => ({ [key]: { status: 'up' } }),
          },
        },
        {
          provide: MigrationsHealthIndicator,
          useValue: {
            isHealthy: async (key: string) => ({
              [key]: { status: 'up', latest: 'HardenedAuditTrail1784000007000' },
            }),
          },
        },
        {
          provide: RedisHealthIndicator,
          useValue: {
            isHealthy: async (key: string) => ({
              [key]: { status: 'up', configured: false },
            }),
          },
        },
        {
          provide: KafkaHealthIndicator,
          useValue: {
            isHealthy: async (key: string) => ({
              [key]: { status: 'up', enabled: false },
            }),
          },
        },
        {
          provide: StorageHealthIndicator,
          useValue: {
            isHealthy: async (key: string) => ({
              [key]: { status: 'up', provider: 'LOCAL' },
            }),
          },
        },
        {
          provide: WorkersHealthIndicator,
          useValue: {
            isHealthy: async (key: string) => {
              const result = { [key]: { status: 'down', stale: [] } };
              throw new HealthCheckError('stale workers', result);
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new TestExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health/live returns 200', async () => {
    const response = await supertest(app.getHttpServer()).get('/api/v1/health/live').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
  });

  it('GET /api/v1/health/ready returns 200 with core dependencies', async () => {
    const response = await supertest(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.info).toHaveProperty('database');
    expect(response.body.data.info).toHaveProperty('migrations');
    expect(response.body.data.info).toHaveProperty('redis');
    expect(response.body.data.info).toHaveProperty('kafka');
    expect(response.body.data.info).toHaveProperty('storage');
  });

  it('GET /api/v1/health/dependencies returns detailed dependency matrix', async () => {
    const response = await supertest(app.getHttpServer()).get('/api/v1/health/dependencies').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.info).toHaveProperty('database');
    expect(response.body.data.info).toHaveProperty('migrations');
    expect(response.body.data.info).toHaveProperty('redis');
    expect(response.body.data.info).toHaveProperty('kafka');
    expect(response.body.data.info).toHaveProperty('storage');
    expect(response.body.data.details).toBeDefined();
  });

  it('GET /api/v1/health/workers returns 503 when no heartbeats are recorded', async () => {
    const response = await supertest(app.getHttpServer()).get('/api/v1/health/workers').expect(503);

    expect(response.body.success).toBe(false);
    expect(response.body.error.statusCode).toBe(503);
  });
});
