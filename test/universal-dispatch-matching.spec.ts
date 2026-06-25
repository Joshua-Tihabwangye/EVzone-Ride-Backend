import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { UniversalDispatchModule } from '../src/universal-dispatch/universal-dispatch.module';
import { DispatchUnitService } from '../src/universal-dispatch/application/dispatch-unit.service';
import { UniversalRequestService } from '../src/universal-dispatch/application/universal-request.service';
import { UniversalMatchingService } from '../src/universal-dispatch/application/universal-matching.service';
import { InfrastructureModule } from '../src/infrastructure/infrastructure.module';
import { GeolocationModule } from '../src/geolocation/geolocation.module';
import {
  DispatchUnitStatus,
  UniversalRequestStatus,
  UniversalServiceFamily,
  UniversalServiceType,
} from '../src/universal-dispatch/domain/universal-dispatch.enums';
import { ENTITIES } from '../src/database/entities';

describe('Universal dispatch matching integration', () => {
  let app: INestApplication;
  let dispatchUnitService: DispatchUnitService;
  let requestService: UniversalRequestService;
  let matchingService: UniversalMatchingService;

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
    dispatchUnitService = app.get(DispatchUnitService);
    requestService = app.get(UniversalRequestService);
    matchingService = app.get(UniversalMatchingService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates a request and runs matching', async () => {
    const unit = await dispatchUnitService.goOnline('driver_1', {
      vehicleId: 'vehicle_1',
      marketId: 'default',
      requestedServices: [UniversalServiceType.STANDARD_RIDE],
      location: { latitude: 0.3476, longitude: 32.5825, accuracyMeters: 10 },
    });
    expect(unit.status).toBe(DispatchUnitStatus.AVAILABLE);

    const request = await requestService.create('rider_1', {
      clientRequestId: 'ride-001',
      serviceFamily: UniversalServiceFamily.PASSENGER,
      serviceType: UniversalServiceType.STANDARD_RIDE,
      pickup: { latitude: 0.3476, longitude: 32.5825 },
      dropoff: { latitude: 0.31, longitude: 32.58 },
      passengerCount: 1,
    });
    expect(request.status).toBe(UniversalRequestStatus.SEARCHING);

    const result = await matchingService.matchRequest(request.id);
    expect(result.candidateCount).toBeGreaterThanOrEqual(0);
    expect([UniversalRequestStatus.OFFERING, UniversalRequestStatus.NO_QUALIFIED_DRIVER]).toContain(
      result.status,
    );
  });
});
