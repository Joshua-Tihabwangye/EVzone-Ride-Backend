import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { UniversalDispatchModule } from '../src/universal-dispatch/universal-dispatch.module';
import { InfrastructureModule } from '../src/infrastructure/infrastructure.module';
import { GeolocationModule } from '../src/geolocation/geolocation.module';
import {
  UniversalRequestStatus,
  UniversalAssignmentStatus,
  UniversalTripStatus,
  DispatchUnitStatus,
} from '../src/universal-dispatch/domain/universal-dispatch.enums';
import {
  UniversalDispatchAssignment,
  UniversalDispatchUnit,
  UniversalServiceRequest,
  UniversalTripSession,
} from '../src/universal-dispatch/domain/universal-dispatch.entities';
import { DeliveryOrder, Ride, RideStop } from '../src/database/entities';
import { BookingStatus, DeliveryServiceType, DeliveryStatus } from '../src/common/enums';
import { ENTITIES } from '../src/database/entities';

describe('Legacy dispatch adapter', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let events: EventEmitter2;
  let rides: Repository<Ride>;
  let rideStops: Repository<RideStop>;
  let deliveries: Repository<DeliveryOrder>;

  const buildApp = (authorityEnabled: boolean) =>
    Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              UNIVERSAL_DISPATCH_AUTHORITY_ENABLED: authorityEnabled ? 'true' : 'false',
            }),
          ],
        }),
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
    }).compile();

  afterEach(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // default enabled app; individual tests rebuild when disabled is needed
  });

  it('does nothing when authority flag is disabled', async () => {
    const moduleRef = await buildApp(false);
    app = moduleRef.createNestApplication();
    dataSource = app.get(DataSource);
    events = app.get(EventEmitter2);
    rides = dataSource.getRepository(Ride);
    rideStops = dataSource.getRepository(RideStop);
    await app.init();

    const ride = await rides.save(
      rides.create({
        riderId: 'rider_1',
        status: BookingStatus.SEARCHING,
        category: 'STANDARD' as never,
        mode: 'ON_DEMAND' as never,
        tripType: 'ONE_WAY' as never,
        passengerCount: 1,
        estimatedDistanceKm: 5,
        estimatedDurationMinutes: 15,
        estimatedFare: 10000,
        currency: 'UGX',
        paymentMethod: 'CASH' as never,
        paymentStatus: 'PENDING' as never,
        verificationCodeHash: 'hash',
        verificationCode: '1234',
      }),
    );
    await rideStops.save([
      rideStops.create({
        rideId: ride.id,
        sequence: 1,
        type: 'PICKUP' as never,
        address: 'A',
        latitude: 0.3476,
        longitude: 32.5825,
      }),
      rideStops.create({
        rideId: ride.id,
        sequence: 2,
        type: 'DROPOFF' as never,
        address: 'B',
        latitude: 0.31,
        longitude: 32.58,
      }),
    ]);

    events.emit('domain.event', {
      topic: 'rides',
      eventType: 'ride.status.changed',
      aggregateType: 'Ride',
      aggregateId: ride.id,
      eventKey: ride.id,
      payload: { rideId: ride.id, status: BookingStatus.SEARCHING },
    });

    // Allow async listener to run.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const universal = await dataSource
      .getRepository(UniversalServiceRequest)
      .findOne({ where: { sourceType: 'RIDE', sourceId: ride.id } });
    expect(universal).toBeNull();
  });

  it('creates a universal request from a legacy ride when enabled', async () => {
    const moduleRef = await buildApp(true);
    app = moduleRef.createNestApplication();
    dataSource = app.get(DataSource);
    events = app.get(EventEmitter2);
    rides = dataSource.getRepository(Ride);
    rideStops = dataSource.getRepository(RideStop);
    await app.init();

    const ride = await rides.save(
      rides.create({
        riderId: 'rider_1',
        status: BookingStatus.SEARCHING,
        category: 'STANDARD' as never,
        mode: 'ON_DEMAND' as never,
        tripType: 'ONE_WAY' as never,
        passengerCount: 1,
        estimatedDistanceKm: 5,
        estimatedDurationMinutes: 15,
        estimatedFare: 10000,
        currency: 'UGX',
        paymentMethod: 'CASH' as never,
        paymentStatus: 'PENDING' as never,
        verificationCodeHash: 'hash',
        verificationCode: '1234',
      }),
    );
    await rideStops.save([
      rideStops.create({
        rideId: ride.id,
        sequence: 1,
        type: 'PICKUP' as never,
        address: 'A',
        latitude: 0.3476,
        longitude: 32.5825,
      }),
      rideStops.create({
        rideId: ride.id,
        sequence: 2,
        type: 'DROPOFF' as never,
        address: 'B',
        latitude: 0.31,
        longitude: 32.58,
      }),
    ]);

    events.emit('domain.event', {
      topic: 'rides',
      eventType: 'ride.status.changed',
      aggregateType: 'Ride',
      aggregateId: ride.id,
      eventKey: ride.id,
      payload: { rideId: ride.id, status: BookingStatus.SEARCHING },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const universal = await dataSource
      .getRepository(UniversalServiceRequest)
      .findOne({ where: { sourceType: 'RIDE', sourceId: ride.id } });
    expect(universal).not.toBeNull();
    expect(universal?.status).toBe(UniversalRequestStatus.SEARCHING);
    expect(universal?.clientRequestId).toBe(`legacy:RIDE:${ride.id}`);
  });

  it('does not duplicate a universal request for the same legacy source', async () => {
    const moduleRef = await buildApp(true);
    app = moduleRef.createNestApplication();
    dataSource = app.get(DataSource);
    events = app.get(EventEmitter2);
    rides = dataSource.getRepository(Ride);
    rideStops = dataSource.getRepository(RideStop);
    await app.init();

    const ride = await rides.save(
      rides.create({
        riderId: 'rider_1',
        status: BookingStatus.SEARCHING,
        category: 'STANDARD' as never,
        mode: 'ON_DEMAND' as never,
        tripType: 'ONE_WAY' as never,
        passengerCount: 1,
        estimatedDistanceKm: 5,
        estimatedDurationMinutes: 15,
        estimatedFare: 10000,
        currency: 'UGX',
        paymentMethod: 'CASH' as never,
        paymentStatus: 'PENDING' as never,
        verificationCodeHash: 'hash',
        verificationCode: '1234',
      }),
    );
    await rideStops.save([
      rideStops.create({
        rideId: ride.id,
        sequence: 1,
        type: 'PICKUP' as never,
        address: 'A',
        latitude: 0.3476,
        longitude: 32.5825,
      }),
      rideStops.create({
        rideId: ride.id,
        sequence: 2,
        type: 'DROPOFF' as never,
        address: 'B',
        latitude: 0.31,
        longitude: 32.58,
      }),
    ]);

    for (let i = 0; i < 2; i++) {
      events.emit('domain.event', {
        topic: 'rides',
        eventType: 'ride.status.changed',
        aggregateType: 'Ride',
        aggregateId: ride.id,
        eventKey: ride.id,
        payload: { rideId: ride.id, status: BookingStatus.SEARCHING },
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    const universal = await dataSource
      .getRepository(UniversalServiceRequest)
      .find({ where: { sourceType: 'RIDE', sourceId: ride.id } });
    expect(universal).toHaveLength(1);
  });

  it('advances universal request to ASSIGNED on matching.job.assigned', async () => {
    const moduleRef = await buildApp(true);
    app = moduleRef.createNestApplication();
    dataSource = app.get(DataSource);
    events = app.get(EventEmitter2);
    rides = dataSource.getRepository(Ride);
    rideStops = dataSource.getRepository(RideStop);
    await app.init();

    const ride = await rides.save(
      rides.create({
        riderId: 'rider_1',
        status: BookingStatus.SEARCHING,
        category: 'STANDARD' as never,
        mode: 'ON_DEMAND' as never,
        tripType: 'ONE_WAY' as never,
        passengerCount: 1,
        estimatedDistanceKm: 5,
        estimatedDurationMinutes: 15,
        estimatedFare: 10000,
        currency: 'UGX',
        paymentMethod: 'CASH' as never,
        paymentStatus: 'PENDING' as never,
        verificationCodeHash: 'hash',
        verificationCode: '1234',
      }),
    );
    await rideStops.save([
      rideStops.create({
        rideId: ride.id,
        sequence: 1,
        type: 'PICKUP' as never,
        address: 'A',
        latitude: 0.3476,
        longitude: 32.5825,
      }),
      rideStops.create({
        rideId: ride.id,
        sequence: 2,
        type: 'DROPOFF' as never,
        address: 'B',
        latitude: 0.31,
        longitude: 32.58,
      }),
    ]);

    events.emit('domain.event', {
      topic: 'rides',
      eventType: 'ride.status.changed',
      aggregateType: 'Ride',
      aggregateId: ride.id,
      eventKey: ride.id,
      payload: { rideId: ride.id, status: BookingStatus.SEARCHING },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    await dataSource.getRepository(UniversalDispatchUnit).save(
      dataSource.getRepository(UniversalDispatchUnit).create({
        driverId: 'driver_1',
        activeVehicleId: 'vehicle_1',
        marketId: 'default',
        status: DispatchUnitStatus.AVAILABLE,
      }),
    );

    events.emit('matching.job.assigned', {
      serviceType: 'RIDE',
      serviceId: ride.id,
      driverId: 'driver_1',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const universal = await dataSource
      .getRepository(UniversalServiceRequest)
      .findOne({ where: { sourceType: 'RIDE', sourceId: ride.id } });
    expect(universal?.status).toBe(UniversalRequestStatus.ASSIGNED);

    const assignment = await dataSource
      .getRepository(UniversalDispatchAssignment)
      .findOne({ where: { requestId: universal?.id } });
    expect(assignment?.status).toBe(UniversalAssignmentStatus.ACTIVE);

    const trip = await dataSource
      .getRepository(UniversalTripSession)
      .findOne({ where: { primaryRequestId: universal?.id } });
    expect(trip?.status).toBe(UniversalTripStatus.ASSIGNED);
  });

  it('creates a universal request from a legacy delivery when enabled', async () => {
    const moduleRef = await buildApp(true);
    app = moduleRef.createNestApplication();
    dataSource = app.get(DataSource);
    events = app.get(EventEmitter2);
    deliveries = dataSource.getRepository(DeliveryOrder);
    await app.init();

    const order = await deliveries.save(
      deliveries.create({
        customerId: 'customer_1',
        trackingCode: 'TRK001',
        status: DeliveryStatus.ACCEPTED,
        serviceType: DeliveryServiceType.COURIER,
        packageName: 'Box',
        packageSize: 'SMALL' as never,
        weightKg: 1,
        declaredValue: 1000,
        pickupAddress: 'A',
        pickupLatitude: 0.3476,
        pickupLongitude: 32.5825,
        destinationAddress: 'B',
        destinationLatitude: 0.31,
        destinationLongitude: 32.58,
        sender: { name: 'Sender' },
        receiver: { name: 'Receiver' },
        currency: 'UGX',
        paymentMethod: 'CASH' as never,
        paymentStatus: 'PENDING' as never,
        qrTokenHash: 'hash',
        qrToken: 'token',
      }),
    );

    events.emit('domain.event', {
      topic: 'deliveries',
      eventType: 'delivery.status.changed',
      aggregateType: 'DeliveryOrder',
      aggregateId: order.id,
      eventKey: order.id,
      payload: { orderId: order.id, status: DeliveryStatus.ACCEPTED },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const universal = await dataSource
      .getRepository(UniversalServiceRequest)
      .findOne({ where: { sourceType: 'DELIVERY', sourceId: order.id } });
    expect(universal).not.toBeNull();
    expect(universal?.status).toBe(UniversalRequestStatus.SEARCHING);
  });
});
