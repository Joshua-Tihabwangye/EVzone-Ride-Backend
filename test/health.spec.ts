import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health endpoints (Phase 1.8)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
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
