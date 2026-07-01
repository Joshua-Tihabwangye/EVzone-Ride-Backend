import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { UniversalDispatchModule } from '../src/universal-dispatch/universal-dispatch.module';
import { InfrastructureModule } from '../src/infrastructure/infrastructure.module';
import { GeolocationModule } from '../src/geolocation/geolocation.module';
import {
  UniversalServiceFamily,
  UniversalServiceType,
  UniversalRequestStatus,
  UniversalOfferStatus,
  DispatchUnitStatus,
} from '../src/universal-dispatch/domain/universal-dispatch.enums';
import { UniversalDispatchStateMachineService } from '../src/universal-dispatch/application/universal-dispatch-state-machine.service';
import {
  StateTransitionLog,
  UniversalServiceRequest,
} from '../src/universal-dispatch/domain/universal-dispatch.entities';
import { ENTITIES } from '../src/database/entities';

describe('Universal dispatch state machine integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let stateMachine: UniversalDispatchStateMachineService;

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
    dataSource = app.get(DataSource);
    stateMachine = app.get(UniversalDispatchStateMachineService);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects invalid request transitions', async () => {
    const request = await dataSource.getRepository(UniversalServiceRequest).save(
      dataSource.getRepository(UniversalServiceRequest).create({
        clientRequestId: 'sm-invalid-001',
        requesterUserId: 'rider_1',
        serviceFamily: UniversalServiceFamily.PASSENGER,
        serviceType: UniversalServiceType.STANDARD_RIDE,
        scheduleType: 'IMMEDIATE' as never,
        marketId: 'default',
        status: UniversalRequestStatus.CREATED,
        pickupLatitude: 0.3476,
        pickupLongitude: 32.5825,
        dropoffLatitude: 0.31,
        dropoffLongitude: 32.58,
      }),
    );

    await expect(
      dataSource.transaction((manager) =>
        stateMachine.transitionRequest(manager, request, UniversalRequestStatus.COMPLETED),
      ),
    ).rejects.toThrow();
  });

  it('persists previousStatus and a transition log row', async () => {
    const request = await dataSource.getRepository(UniversalServiceRequest).save(
      dataSource.getRepository(UniversalServiceRequest).create({
        clientRequestId: 'sm-log-001',
        requesterUserId: 'rider_1',
        serviceFamily: UniversalServiceFamily.PASSENGER,
        serviceType: UniversalServiceType.STANDARD_RIDE,
        scheduleType: 'IMMEDIATE' as never,
        marketId: 'default',
        status: UniversalRequestStatus.CREATED,
        pickupLatitude: 0.3476,
        pickupLongitude: 32.5825,
        dropoffLatitude: 0.31,
        dropoffLongitude: 32.58,
      }),
    );

    await dataSource.transaction((manager) =>
      stateMachine.transitionRequest(manager, request, UniversalRequestStatus.SEARCHING, {
        actorType: 'SYSTEM',
        reasonCode: 'TEST',
      }),
    );

    const refreshed = await dataSource
      .getRepository(UniversalServiceRequest)
      .findOne({ where: { id: request.id } });
    expect(refreshed?.status).toBe(UniversalRequestStatus.SEARCHING);
    expect(refreshed?.previousStatus).toBe(UniversalRequestStatus.CREATED);

    const logs = await dataSource
      .getRepository(StateTransitionLog)
      .find({ where: { entityType: 'service_request', entityId: request.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].fromStatus).toBe(UniversalRequestStatus.CREATED);
    expect(logs[0].toStatus).toBe(UniversalRequestStatus.SEARCHING);
    expect(logs[0].actorType).toBe('SYSTEM');
  });

  it('allows offer and unit transitions and logs them', async () => {
    const result = await dataSource.transaction(async (manager) => {
      const request = await manager.getRepository(UniversalServiceRequest).save(
        manager.getRepository(UniversalServiceRequest).create({
          clientRequestId: 'sm-offer-001',
          requesterUserId: 'rider_1',
          serviceFamily: UniversalServiceFamily.PASSENGER,
          serviceType: UniversalServiceType.STANDARD_RIDE,
          scheduleType: 'IMMEDIATE' as never,
          marketId: 'default',
          status: UniversalRequestStatus.OFFERING,
          pickupLatitude: 0.3476,
          pickupLongitude: 32.5825,
          dropoffLatitude: 0.31,
          dropoffLongitude: 32.58,
        }),
      );

      const unit = await manager.getRepository('UniversalDispatchUnit').save(
        manager.getRepository('UniversalDispatchUnit').create({
          driverId: 'driver_1',
          activeVehicleId: 'vehicle_1',
          marketId: 'default',
          status: DispatchUnitStatus.AVAILABLE,
        }),
      );

      const offer = await manager.getRepository('UniversalDispatchOffer').save(
        manager.getRepository('UniversalDispatchOffer').create({
          requestId: request.id,
          dispatchUnitId: (unit as { id: string }).id,
          waveNumber: 1,
          status: UniversalOfferStatus.PENDING,
          policyVersion: '1.0',
          offeredAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );

      await stateMachine.transitionOffer(manager, offer as never, UniversalOfferStatus.ACCEPTED, {
        actorType: 'DRIVER',
        actorId: 'driver_1',
      });
      await stateMachine.transitionUnit(manager, unit as never, DispatchUnitStatus.RESERVED, {
        actorType: 'DRIVER',
        actorId: 'driver_1',
      });

      return {
        requestId: request.id,
        offerId: (offer as { id: string }).id,
        unitId: (unit as { id: string }).id,
      };
    });

    const offerLogs = await dataSource
      .getRepository(StateTransitionLog)
      .find({ where: { entityType: 'dispatch_offer', entityId: result.offerId } });
    expect(offerLogs).toHaveLength(1);
    expect(offerLogs[0].toStatus).toBe(UniversalOfferStatus.ACCEPTED);

    const unitLogs = await dataSource
      .getRepository(StateTransitionLog)
      .find({ where: { entityType: 'dispatch_unit', entityId: result.unitId } });
    expect(unitLogs).toHaveLength(1);
    expect(unitLogs[0].toStatus).toBe(DispatchUnitStatus.RESERVED);
  });
});
