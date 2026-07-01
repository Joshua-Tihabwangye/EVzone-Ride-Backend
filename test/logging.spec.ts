import 'reflect-metadata';
import { BadRequestException, Controller, Get, INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Writable } from 'node:stream';
import supertest from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

@Controller('log-test')
class LogTestController {
  @Get('client-error')
  clientError() {
    throw new BadRequestException('client error');
  }

  @Get('server-error')
  serverError() {
    throw new Error('server error');
  }
}

describe('Structured logging (Phase 1.8)', () => {
  let app: INestApplication;
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: { level: 'info', stream, autoLogging: false },
        }),
      ],
      controllers: [LogTestController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    lines.length = 0;
  });

  it('logs unexpected errors with UNEXPECTED_ERROR classification', async () => {
    await supertest(app.getHttpServer()).get('/log-test/server-error').expect(500);
    const log = lines.find((line) => line.includes('UNEXPECTED_ERROR'));
    expect(log).toBeDefined();
    expect(log).toContain('"status":500');
    expect(log).toContain('"operational":false');
  });

  it('logs client errors with CLIENT_ERROR classification', async () => {
    await supertest(app.getHttpServer()).get('/log-test/client-error').expect(400);
    const log = lines.find((line) => line.includes('CLIENT_ERROR'));
    expect(log).toBeDefined();
    expect(log).toContain('"status":400');
    expect(log).toContain('"operational":true');
  });
});
