import { RankingEngineService } from './ranking-engine.service';
import { DispatchPolicyConfig, RouteMatrixResult } from '../domain/universal-dispatch.types';
import { UniversalDispatchUnit } from '../domain/universal-dispatch.entities';

describe('RankingEngineService', () => {
  let service: RankingEngineService;

  const basePolicy: DispatchPolicyConfig = {
    schemaVersion: '1.0',
    allowedVehicleTypes: ['SEDAN'],
    requiredCertifications: [],
    requiredCapabilities: [],
    candidateIndexes: [],
    searchRadiiKm: [3],
    routeMatrixLimit: 8,
    candidateLimit: 50,
    weights: {
      pickupEta: 0.5,
      reliability: 0.15,
      fairness: 0.15,
      serviceQuality: 0.1,
      routeFit: 0.05,
      energyMargin: 0.05,
      preference: 0,
    },
    offerWaves: [{ size: 1, timeoutSeconds: 10 }],
    locationFreshnessSeconds: 60,
    maximumLocationAccuracyMeters: 100,
    routeProviderTimeoutMs: 1000,
    routeFallbackPenalty: 0.18,
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
    neverRelax: [],
    allowedFallbacks: [],
    substitutions: {},
    serviceSpecific: {},
  };

  beforeEach(() => {
    service = new RankingEngineService();
  });

  it('ranks closer unit higher', () => {
    const units = [{ id: 'du_far' }, { id: 'du_close' }] as UniversalDispatchUnit[];
    const routes: RouteMatrixResult[] = [
      {
        dispatchUnitId: 'du_far',
        distanceMeters: 5000,
        etaSeconds: 600,
        source: 'ROUTE_PROVIDER',
        uncertaintyPenalty: 0,
        mode: 'driving',
      },
      {
        dispatchUnitId: 'du_close',
        distanceMeters: 1000,
        etaSeconds: 120,
        source: 'ROUTE_PROVIDER',
        uncertaintyPenalty: 0,
        mode: 'driving',
      },
    ];

    const ranked = service.rank(
      units.map((unit, index) => ({ unit, route: routes[index] })),
      basePolicy,
      'req_1',
    );
    expect(ranked[0].unit.id).toBe('du_close');
    expect(ranked[1].unit.id).toBe('du_far');
  });

  it('applies fallback penalty', () => {
    const units = [{ id: 'du_1' }] as UniversalDispatchUnit[];
    const routes: RouteMatrixResult[] = [
      {
        dispatchUnitId: 'du_1',
        distanceMeters: 1000,
        etaSeconds: 120,
        source: 'FALLBACK',
        uncertaintyPenalty: 0.18,
        mode: 'driving',
      },
    ];
    const ranked = service.rank(
      units.map((unit, index) => ({ unit, route: routes[index] })),
      basePolicy,
      'req_1',
    );
    expect(ranked[0].score).toBeLessThan(1);
  });

  it('uses real signal values instead of defaults', () => {
    const units = [{ id: 'du_low' }, { id: 'du_high' }] as UniversalDispatchUnit[];
    const routes: RouteMatrixResult[] = [
      {
        dispatchUnitId: 'du_low',
        distanceMeters: 1000,
        etaSeconds: 120,
        source: 'ROUTE_PROVIDER',
        uncertaintyPenalty: 0,
        mode: 'driving',
      },
      {
        dispatchUnitId: 'du_high',
        distanceMeters: 1000,
        etaSeconds: 120,
        source: 'ROUTE_PROVIDER',
        uncertaintyPenalty: 0,
        mode: 'driving',
      },
    ];

    const ranked = service.rank(
      [
        { unit: units[0], route: routes[0], reliability: 0.2, quality: 0.2 },
        { unit: units[1], route: routes[1], reliability: 1, quality: 1 },
      ],
      basePolicy,
      'req_2',
    );
    expect(ranked[0].unit.id).toBe('du_high');
    expect(ranked[0].scoreComponents.reliability).toBe(1);
    expect(ranked[0].scoreComponents.serviceQuality).toBe(1);
  });

  it('boosts fairness when configured', () => {
    const units = [{ id: 'du_recent' }, { id: 'du_stale' }] as UniversalDispatchUnit[];
    const routes: RouteMatrixResult[] = [
      {
        dispatchUnitId: 'du_recent',
        distanceMeters: 1000,
        etaSeconds: 120,
        source: 'ROUTE_PROVIDER',
        uncertaintyPenalty: 0,
        mode: 'driving',
      },
      {
        dispatchUnitId: 'du_stale',
        distanceMeters: 1000,
        etaSeconds: 120,
        source: 'ROUTE_PROVIDER',
        uncertaintyPenalty: 0,
        mode: 'driving',
      },
    ];

    const fairnessPolicy: DispatchPolicyConfig = {
      ...basePolicy,
      weights: {
        ...basePolicy.weights,
        pickupEta: 0,
        fairness: 1,
        reliability: 0,
        serviceQuality: 0,
        routeFit: 0,
        energyMargin: 0,
      },
    };

    const ranked = service.rank(
      [
        { unit: units[0], route: routes[0], fairness: 0.2 },
        { unit: units[1], route: routes[1], fairness: 1 },
      ],
      fairnessPolicy,
      'req_3',
    );
    expect(ranked[0].unit.id).toBe('du_stale');
    expect(ranked[0].scoreComponents.fairness).toBe(1);
  });
});
