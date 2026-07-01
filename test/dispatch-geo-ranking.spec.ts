import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { UniversalDispatchModule } from '../src/universal-dispatch/universal-dispatch.module';
import { InfrastructureModule } from '../src/infrastructure/infrastructure.module';
import { GeolocationModule } from '../src/geolocation/geolocation.module';
import { DispatchGeoIndexService } from '../src/universal-dispatch/infrastructure/dispatch-geo-index.service';
import { DispatchMetricsService } from '../src/universal-dispatch/infrastructure/dispatch-metrics.service';
import { RankingDataService } from '../src/universal-dispatch/application/ranking-data.service';
import { RankingEngineService } from '../src/universal-dispatch/application/ranking-engine.service';
import { UniversalMatchingService } from '../src/universal-dispatch/application/universal-matching.service';

import {
  UniversalDispatchDecisionTrace,
  UniversalDispatchUnit,
  UniversalServiceRequest,
} from '../src/universal-dispatch/domain/universal-dispatch.entities';
import { DriverProfile } from '../src/database/entities';
import {
  DispatchUnitStatus,
  UniversalRequestStatus,
  UniversalServiceFamily,
  UniversalServiceType,
} from '../src/universal-dispatch/domain/universal-dispatch.enums';
import { ENTITIES } from '../src/database/entities';

describe('Dispatch geo index and ranking', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let geoIndex: DispatchGeoIndexService;
  let metrics: DispatchMetricsService;
  let rankingData: RankingDataService;
  let ranking: RankingEngineService;
  let matching: UniversalMatchingService;

  beforeAll(async () => {
    process.env.DISPATCH_GEO_FALLBACK_ENABLED = 'true';
    process.env.DISPATCH_GEO_MAX_SCAN = '10';
    process.env.DISPATCH_LOCATION_FRESHNESS_SECONDS = '60';

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
    geoIndex = app.get(DispatchGeoIndexService);
    metrics = app.get(DispatchMetricsService);
    rankingData = app.get(RankingDataService);
    ranking = app.get(RankingEngineService);
    matching = app.get(UniversalMatchingService);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    metrics.reset();
  });

  const buildSnapshot = (overrides: Partial<Record<string, unknown>> = {}) => {
    const base = {
      snapshotVersion: 1,
      generatedAt: new Date().toISOString(),
      driver: {
        driverId: 'driver_1',
        userId: 'user_1',
        rating: 4.5,
        ratingsCount: 10,
        completedJobs: 50,
        acceptanceRate: 0.8,
        cancellationRate: 0.02,
        languages: [],
        certifications: ['PASSENGER_TRANSPORT'],
        entitlements: [UniversalServiceType.STANDARD_RIDE],
      },
      vehicle: {
        vehicleId: 'vehicle_1',
        vehicleType: 'SEDAN',
        energyType: 'PETROL',
        passengerCapacity: 4,
        cargoWeightKg: 0,
        cargoVolumeM3: 0,
        capabilities: {},
        verifiedCapabilityCodes: [],
      },
      compliance: {
        driverAccountActive: true,
        driverVerified: true,
        safetyClear: true,
        driverSuspended: false,
        vehicleActive: true,
        vehicleVerified: true,
        driverDocumentsValid: true,
        insuranceValid: true,
        inspectionValid: true,
        registrationValid: true,
        blockedReasons: [],
      },
      shift: { active: true, remainingMinutes: 480, breakRequired: false },
      fleet: { active: false, allowed: true, rules: {} },
      enabledServices: [UniversalServiceType.STANDARD_RIDE],
      riskSignals: [],
      liveState: {
        status: DispatchUnitStatus.AVAILABLE,
        lastSeenAt: new Date().toISOString(),
        availableSince: new Date().toISOString(),
      },
    };
    return {
      ...base,
      ...overrides,
      driver: { ...base.driver, ...(overrides.driver as Record<string, unknown> | undefined) },
      vehicle: { ...base.vehicle, ...(overrides.vehicle as Record<string, unknown> | undefined) },
      compliance: { ...base.compliance, ...(overrides.compliance as Record<string, unknown> | undefined) },
      shift: { ...base.shift, ...(overrides.shift as Record<string, unknown> | undefined) },
      fleet: { ...base.fleet, ...(overrides.fleet as Record<string, unknown> | undefined) },
      liveState: { ...base.liveState, ...(overrides.liveState as Record<string, unknown> | undefined) },
    };
  };

  describe('DispatchGeoIndexService Haversine fallback', () => {
    it('excludes stale locations and reports HAVERSINE source', async () => {
      const unitRepo = dataSource.getRepository(UniversalDispatchUnit);
      await unitRepo.save(
        unitRepo.create({
          driverId: 'driver_fresh',
          activeVehicleId: 'vehicle_fresh',
          marketId: 'test-market',
          status: DispatchUnitStatus.AVAILABLE,
          latitude: 0.3476,
          longitude: 32.5825,
          locationRecordedAt: new Date(),
          enabledServices: [UniversalServiceType.STANDARD_RIDE],
          eligibilitySnapshot: buildSnapshot({ driver: { driverId: 'driver_fresh' } }) as unknown as Record<
            string,
            unknown
          >,
        }),
      );
      await unitRepo.save(
        unitRepo.create({
          driverId: 'driver_stale',
          activeVehicleId: 'vehicle_stale',
          marketId: 'test-market',
          status: DispatchUnitStatus.AVAILABLE,
          latitude: 0.3476,
          longitude: 32.5825,
          locationRecordedAt: new Date(Date.now() - 120_000),
          enabledServices: [UniversalServiceType.STANDARD_RIDE],
          eligibilitySnapshot: buildSnapshot({ driver: { driverId: 'driver_stale' } }) as unknown as Record<
            string,
            unknown
          >,
        }),
      );

      const found = await geoIndex.findNearby(
        'test-market',
        UniversalServiceType.STANDARD_RIDE,
        0.3476,
        32.5825,
        5,
        10,
      );
      expect(found.length).toBe(1);
      expect(found[0].dispatchUnitId).toBeDefined();
      expect(found[0].source).toBe('HAVERSINE');
      expect(metrics.getGeoSourceCounters()).toMatchObject({ HAVERSINE: 1, REDIS: 0, POSTGIS: 0 });
    });
  });

  describe('RankingDataService', () => {
    it('computes fairness boost from lastAssignedAt', async () => {
      const recent = {
        id: 'du_recent',
        driverId: 'driver_recent',
        lastAssignedAt: new Date(),
      } as UniversalDispatchUnit;
      const stale = {
        id: 'du_stale',
        driverId: 'driver_stale',
        lastAssignedAt: new Date(Date.now() - 20 * 60_000),
      } as UniversalDispatchUnit;

      const request = {
        pickupLatitude: 0.34,
        pickupLongitude: 32.58,
        dropoffLatitude: 0.33,
        dropoffLongitude: 32.57,
      } as UniversalServiceRequest;

      const recentSignals = await rankingData.forUnit(recent, request);
      const staleSignals = await rankingData.forUnit(stale, request);
      expect(recentSignals.fairness).toBeLessThan(staleSignals.fairness);
    });
  });

  describe('RankingEngineService fairness', () => {
    it('ranks a stale unit above a recently assigned unit when fairness weight dominates', () => {
      const units = [{ id: 'du_recent' }, { id: 'du_stale' }] as UniversalDispatchUnit[];
      const route: any = {
        dispatchUnitId: 'du_any',
        distanceMeters: 1000,
        etaSeconds: 120,
        source: 'ROUTE_PROVIDER',
        uncertaintyPenalty: 0,
        mode: 'driving',
      };

      const fairnessPolicy = {
        schemaVersion: '1.0',
        allowedVehicleTypes: ['SEDAN'],
        requiredCertifications: [],
        requiredCapabilities: [],
        candidateIndexes: [],
        searchRadiiKm: [3],
        routeMatrixLimit: 8,
        candidateLimit: 50,
        weights: {
          pickupEta: 0,
          reliability: 0,
          fairness: 1,
          serviceQuality: 0,
          routeFit: 0,
          energyMargin: 0,
          preference: 0,
        },
        offerWaves: [{ size: 1, timeoutSeconds: 10 }],
        locationFreshnessSeconds: 60,
        maximumLocationAccuracyMeters: 100,
        routeProviderTimeoutMs: 1000,
        routeFallbackPenalty: 0,
        maximumPickupEtaSeconds: 1800,
        scheduleLeadMinutes: 30,
        minimumRemainingShiftMinutes: 30,
        evReservePercent: 15,
        evFixedReserveKm: 15,
        chargerContingencyKm: 10,
        maximumSharedDetourMinutes: 12,
        maximumSharedWaitMinutes: 10,
        arrivalGeofenceMeters: 150,
        noShowGraceSeconds: 300,
        otpTtlSeconds: 1800,
        otpAttemptLimit: 5,
        qrTtlSeconds: 7200,
        neverRelax: [
          'driverVerification',
          'safety',
          'vehicleVerification',
          'documents',
          'insurance',
          'inspection',
          'capacity',
          'accessibility',
          'medical',
          'school',
          'energy',
        ],
        allowedFallbacks: [],
        substitutions: {},
        serviceSpecific: {},
      };

      const ranked = ranking.rank(
        [
          { unit: units[0], route, fairness: 0.1 },
          { unit: units[1], route, fairness: 1 },
        ],
        fairnessPolicy as any,
        'req_fairness',
      );
      expect(ranked[0].unit.id).toBe('du_stale');
    });
  });

  describe('UniversalMatchingService decision trace', () => {
    it('persists full score components for top candidates', async () => {
      const request = await dataSource.getRepository(UniversalServiceRequest).save(
        dataSource.getRepository(UniversalServiceRequest).create({
          clientRequestId: 'geo-rank-001',
          requesterUserId: 'rider_1',
          serviceFamily: UniversalServiceFamily.PASSENGER,
          serviceType: UniversalServiceType.STANDARD_RIDE,
          scheduleType: 'IMMEDIATE' as never,
          marketId: 'default',
          status: UniversalRequestStatus.SEARCHING,
          pickupLatitude: 0.3476,
          pickupLongitude: 32.5825,
          dropoffLatitude: 0.31,
          dropoffLongitude: 32.58,
        }),
      );

      const unitRepo = dataSource.getRepository(UniversalDispatchUnit);
      await unitRepo.save(
        unitRepo.create({
          driverId: 'driver_trace',
          activeVehicleId: 'vehicle_trace',
          marketId: 'default',
          status: DispatchUnitStatus.AVAILABLE,
          latitude: 0.3476,
          longitude: 32.5825,
          locationRecordedAt: new Date(),
          availableSince: new Date(),
          enabledServices: [UniversalServiceType.STANDARD_RIDE],
          eligibilitySnapshot: buildSnapshot({
            driver: { driverId: 'driver_trace', rating: 4.9 },
          }) as unknown as Record<string, unknown>,
        }),
      );

      await dataSource.getRepository(DriverProfile).save({
        id: 'driver_trace',
        userId: 'user_trace',
        rating: 4.9,
        ratingsCount: 20,
      } as DriverProfile);

      const result = await matching.matchRequest(request.id);
      expect(result.candidateCount).toBeGreaterThanOrEqual(1);
      expect(result.eligibleCandidates).toBeGreaterThanOrEqual(1);

      const trace = await dataSource
        .getRepository(UniversalDispatchDecisionTrace)
        .findOne({ where: { id: result.traceId } });
      expect(trace).toBeDefined();
      if (!trace || !trace.candidateDetails) throw new Error('trace missing');
      expect(trace.decisionSummary).toMatchObject({
        candidateSource: 'HAVERSINE',
      });
      expect(Array.isArray(trace.candidateDetails)).toBe(true);
      expect(trace.candidateDetails.length).toBeGreaterThan(0);
      expect(trace.candidateDetails[0].scoreComponents).toMatchObject({
        pickupEta: expect.any(Number),
        reliability: expect.any(Number),
        fairness: expect.any(Number),
        serviceQuality: expect.any(Number),
        routeFit: expect.any(Number),
        energyMargin: expect.any(Number),
        preference: expect.any(Number),
      });
    });
  });
});
