import { EligibilityEngineService } from './eligibility-engine.service';
import {
  DispatchReasonCode,
  DispatchUnitStatus,
  UniversalServiceType,
} from '../domain/universal-dispatch.enums';
import { UniversalServiceRequest } from '../domain/universal-dispatch.entities';
import { DispatchPolicyConfig, DispatchUnitSnapshot } from '../domain/universal-dispatch.types';

describe('EligibilityEngineService', () => {
  let service: EligibilityEngineService;

  const basePolicy: DispatchPolicyConfig = {
    schemaVersion: '1.0',
    allowedVehicleTypes: ['SEDAN'],
    requiredCertifications: ['PASSENGER_TRANSPORT'],
    requiredCapabilities: [],
    candidateIndexes: ['service'],
    searchRadiiKm: [3, 6],
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
    neverRelax: ['driverVerification', 'vehicleVerification', 'capacity'],
    allowedFallbacks: [],
    substitutions: {},
    serviceSpecific: {},
  };

  const baseSnapshot: DispatchUnitSnapshot = {
    snapshotVersion: 1,
    generatedAt: new Date().toISOString(),
    driver: {
      driverId: 'drv_1',
      userId: 'usr_1',
      rating: 4.5,
      ratingsCount: 10,
      completedJobs: 100,
      acceptanceRate: 0.9,
      cancellationRate: 0.01,
      languages: [],
      certifications: ['PASSENGER_TRANSPORT'],
      entitlements: [UniversalServiceType.STANDARD_RIDE],
    },
    vehicle: {
      vehicleId: 'veh_1',
      vehicleType: 'SEDAN',
      energyType: 'PETROL',
      passengerCapacity: 4,
      cargoWeightKg: 100,
      cargoVolumeM3: 1,
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
    shift: {
      active: true,
      shiftId: 'shift_1',
      remainingMinutes: 120,
      breakRequired: false,
    },
    fleet: {
      active: false,
      allowed: true,
      rules: {},
    },
    enabledServices: [UniversalServiceType.STANDARD_RIDE],
    riskSignals: [],
    liveState: {
      status: DispatchUnitStatus.AVAILABLE,
      latitude: 0.3476,
      longitude: 32.5825,
      lastSeenAt: new Date().toISOString(),
      accuracyMeters: 10,
    },
  };

  const baseRequest: Partial<UniversalServiceRequest> = {
    id: 'req_1',
    serviceType: UniversalServiceType.STANDARD_RIDE,
    marketId: 'default',
    pickupLatitude: 0.3476,
    pickupLongitude: 32.5825,
    dropoffLatitude: 0.31,
    dropoffLongitude: 32.58,
    passengerCount: 1,
  };

  const createMockZones = () =>
    ({ find: jest.fn().mockResolvedValue([]) }) as unknown as ReturnType<typeof jest.fn<unknown, unknown[]>>;

  beforeEach(() => {
    service = new EligibilityEngineService(createMockZones() as never);
  });

  it('accepts a fully eligible unit', async () => {
    const result = await service.evaluate(
      baseRequest as UniversalServiceRequest,
      { id: 'du_1', snapshot: baseSnapshot },
      basePolicy,
    );
    expect(result.eligible).toBe(true);
    expect(result.reasonCodes).toHaveLength(0);
  });

  it('rejects unverified driver', async () => {
    const snapshot = {
      ...baseSnapshot,
      compliance: { ...baseSnapshot.compliance, driverVerified: false },
    };
    const result = await service.evaluate(
      baseRequest as UniversalServiceRequest,
      { id: 'du_1', snapshot },
      basePolicy,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain(DispatchReasonCode.DRIVER_UNVERIFIED);
  });

  it('rejects vehicle class not allowed', async () => {
    const snapshot = {
      ...baseSnapshot,
      vehicle: { ...baseSnapshot.vehicle, vehicleType: 'TRUCK' },
    };
    const result = await service.evaluate(
      baseRequest as UniversalServiceRequest,
      { id: 'du_1', snapshot },
      basePolicy,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain(DispatchReasonCode.VEHICLE_CLASS_NOT_ALLOWED);
  });

  it('rejects insufficient capacity', async () => {
    const request = { ...baseRequest, passengerCount: 6 };
    const result = await service.evaluate(
      request as UniversalServiceRequest,
      { id: 'du_1', snapshot: baseSnapshot },
      basePolicy,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain(DispatchReasonCode.CAPACITY_INSUFFICIENT);
  });

  it('rejects stale location', async () => {
    const snapshot = {
      ...baseSnapshot,
      liveState: {
        ...baseSnapshot.liveState,
        lastSeenAt: new Date(Date.now() - 120_000).toISOString(),
      },
    };
    const result = await service.evaluate(
      baseRequest as UniversalServiceRequest,
      { id: 'du_1', snapshot },
      basePolicy,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain(DispatchReasonCode.LOCATION_STALE);
  });

  it('rejects EV with insufficient range', async () => {
    const snapshot = {
      ...baseSnapshot,
      vehicle: { ...baseSnapshot.vehicle, energyType: 'ELECTRIC' },
      liveState: { ...baseSnapshot.liveState, usableRangeKm: 5 },
    };
    const result = await service.evaluate(
      baseRequest as UniversalServiceRequest,
      { id: 'du_1', snapshot },
      basePolicy,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain(DispatchReasonCode.EV_RANGE_INSUFFICIENT);
  });

  it('rejects excluded driver', async () => {
    const result = await service.evaluate(
      baseRequest as UniversalServiceRequest,
      { id: 'du_1', snapshot: baseSnapshot },
      basePolicy,
      new Date(),
      new Set(['drv_1']),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain(DispatchReasonCode.RIDER_DRIVER_EXCLUDED);
  });
});
