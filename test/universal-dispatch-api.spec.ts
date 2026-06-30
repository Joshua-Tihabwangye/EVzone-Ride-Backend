import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import request from 'supertest';
import { UniversalDispatchModule } from '../src/universal-dispatch/universal-dispatch.module';
import { InfrastructureModule } from '../src/infrastructure/infrastructure.module';
import { GeolocationModule } from '../src/geolocation/geolocation.module';
import {
  UniversalServiceFamily,
  UniversalServiceType,
} from '../src/universal-dispatch/domain/universal-dispatch.enums';
import { ENTITIES } from '../src/database/entities';

describe('Universal dispatch API endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        InfrastructureModule,
        GeolocationModule,
        TypeOrmModule.forRoot({
          type: 'sqljs',
          location: ':memory:',
          autoSave: false,
          synchronize: true,
          entities: [...ENTITIES],
          logging: false,
        }),
        UniversalDispatchModule,
      ],
    })
      .overrideProvider(EventEmitter2)
      .useValue({
        emit: jest.fn(),
        emitAsync: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        once: jest.fn(),
        removeAllListeners: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();

    // Mirror production validation behavior.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // The test module does not wire the real auth guards. We use test headers
    // to populate request.user so that @CurrentUser() and @Roles() work.
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
      const userId = String(headers['x-test-user-id'] ?? 'test_user_1');
      const role = String(headers['x-test-user-role'] ?? 'RIDER');
      req.user = { id: userId, role };
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const riderHeaders = {
    'x-test-user-id': 'rider_1',
    'x-test-user-role': 'RIDER',
  };

  const driverHeaders = {
    'x-test-user-id': 'driver_1',
    'x-test-user-role': 'DRIVER',
  };

  it('POST /universal-dispatch/service-requests creates a request', async () => {
    const payload = {
      clientRequestId: 'api-ride-001',
      serviceFamily: UniversalServiceFamily.PASSENGER,
      serviceType: UniversalServiceType.STANDARD_RIDE,
      marketId: 'default',
      pickup: { latitude: 0.3476, longitude: 32.5825 },
      dropoff: { latitude: 0.31, longitude: 32.58 },
      passengerCount: 1,
    };

    const response = await request(app.getHttpServer())
      .post('/universal-dispatch/service-requests')
      .set(riderHeaders)
      .send(payload)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.serviceType).toBe(UniversalServiceType.STANDARD_RIDE);
    expect(response.body.status).toBe('SEARCHING');
  });

  it('GET /universal-dispatch/service-requests/:requestId returns a created request', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/universal-dispatch/service-requests')
      .set(riderHeaders)
      .send({
        clientRequestId: 'api-ride-002',
        serviceFamily: UniversalServiceFamily.PASSENGER,
        serviceType: UniversalServiceType.STANDARD_RIDE,
        marketId: 'default',
        pickup: { latitude: 0.3476, longitude: 32.5825 },
        dropoff: { latitude: 0.31, longitude: 32.58 },
        passengerCount: 1,
      });

    const requestId = createResponse.body.id;

    const response = await request(app.getHttpServer())
      .get(`/universal-dispatch/service-requests/${requestId}`)
      .set(riderHeaders)
      .expect(200);

    expect(response.body.id).toBe(requestId);
    expect(response.body.clientRequestId).toBe('api-ride-002');
  });

  it('POST /universal-dispatch/drivers/me/online brings a driver online', async () => {
    const response = await request(app.getHttpServer())
      .post('/universal-dispatch/drivers/me/online')
      .set(driverHeaders)
      .send({
        vehicleId: '550e8400-e29b-41d4-a716-446655440001',
        marketId: 'default',
        requestedServices: [UniversalServiceType.STANDARD_RIDE],
        location: { latitude: 0.3476, longitude: 32.5825, accuracyMeters: 10 },
      })
      .expect(201);

    expect(response.body.status).toBe('AVAILABLE');
    expect(response.body.driverId).toBe('driver_1');
  });

  it('rejects an invalid request payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/universal-dispatch/service-requests')
      .set(riderHeaders)
      .send({
        clientRequestId: 'short',
        serviceFamily: 'INVALID_FAMILY',
        serviceType: UniversalServiceType.STANDARD_RIDE,
        pickup: { latitude: 0.3476, longitude: 32.5825 },
        dropoff: { latitude: 0.31, longitude: 32.58 },
      })
      .expect(400);
  });
});
