import { UniversalDispatchUnit, UniversalServiceRequest } from './universal-dispatch.entities';
import { DispatchReasonCode, UniversalServiceType } from './universal-dispatch.enums';

export interface DispatchPolicyWeights {
  pickupEta: number;
  reliability: number;
  fairness: number;
  serviceQuality: number;
  routeFit: number;
  energyMargin: number;
  preference: number;
}

export interface DispatchOfferWavePolicy {
  size: number;
  timeoutSeconds: number;
}

export interface DispatchPolicyConfig {
  schemaVersion: string;
  allowedVehicleTypes: string[];
  requiredCertifications: string[];
  requiredCapabilities: string[];
  candidateIndexes: string[];
  searchRadiiKm: number[];
  routeMatrixLimit: number;
  candidateLimit: number;
  weights: DispatchPolicyWeights;
  offerWaves: DispatchOfferWavePolicy[];
  locationFreshnessSeconds: number;
  maximumLocationAccuracyMeters: number;
  routeProviderTimeoutMs: number;
  routeFallbackPenalty: number;
  maximumPickupEtaSeconds: number;
  scheduleLeadMinutes: number;
  minimumRemainingShiftMinutes: number;
  evReservePercent: number;
  evFixedReserveKm: number;
  chargerContingencyKm: number;
  maximumSharedDetourMinutes: number;
  maximumSharedWaitMinutes: number;
  arrivalGeofenceMeters: number;
  noShowGraceSeconds: number;
  otpTtlSeconds: number;
  otpAttemptLimit: number;
  qrTtlSeconds: number;
  neverRelax: string[];
  allowedFallbacks: string[];
  substitutions: Record<string, string[]>;
  serviceSpecific: Record<string, unknown>;
  operatingZoneIds?: string[];
}

export interface DispatchComplianceSnapshot {
  driverAccountActive: boolean;
  driverVerified: boolean;
  safetyClear: boolean;
  driverSuspended: boolean;
  vehicleActive: boolean;
  vehicleVerified: boolean;
  driverDocumentsValid: boolean;
  insuranceValid: boolean;
  inspectionValid: boolean;
  registrationValid: boolean;
  blockedReasons: string[];
}

export interface DispatchVehicleSnapshot {
  vehicleId: string;
  vehicleType: string;
  energyType: string;
  passengerCapacity: number;
  cargoWeightKg: number;
  cargoVolumeM3: number;
  capabilities: Record<string, boolean | number | string | null>;
  verifiedCapabilityCodes: string[];
}

export interface DispatchDriverSnapshot {
  driverId: string;
  userId: string;
  rating: number;
  ratingsCount: number;
  completedJobs: number;
  acceptanceRate: number;
  cancellationRate: number;
  availableSince?: string;
  languages: string[];
  certifications: string[];
  entitlements: UniversalServiceType[];
}

export interface DispatchShiftSnapshot {
  active: boolean;
  shiftId?: string;
  remainingMinutes: number;
  breakRequired: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface DispatchFleetSnapshot {
  fleetId?: string;
  active: boolean;
  allowed: boolean;
  rules: Record<string, unknown>;
}

export interface DispatchUnitLiveState {
  status: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  speedKph?: number;
  heading?: number;
  lastSeenAt?: string;
  availableSince?: string;
  batterySoc?: number;
  usableRangeKm?: number;
  chargingState?: string;
  activeRequestId?: string;
  activeOfferId?: string;
}

export interface DispatchUnitSnapshot {
  snapshotVersion: number;
  generatedAt: string;
  driver: DispatchDriverSnapshot;
  vehicle: DispatchVehicleSnapshot;
  compliance: DispatchComplianceSnapshot;
  shift: DispatchShiftSnapshot;
  fleet: DispatchFleetSnapshot;
  enabledServices: UniversalServiceType[];
  riskSignals: Record<string, unknown>[];
  liveState: DispatchUnitLiveState;
}

export interface EligibilityResult {
  eligible: boolean;
  reasonCodes: DispatchReasonCode[];
  facts: Record<string, unknown>;
}

export interface RouteMatrixResult {
  dispatchUnitId: string;
  distanceMeters: number;
  etaSeconds: number;
  source: 'ROUTE_PROVIDER' | 'CACHE' | 'FALLBACK';
  uncertaintyPenalty: number;
  mode: 'driving' | 'motorcycle' | 'cycling' | 'truck';
}

export interface RankedDispatchCandidate {
  unit: UniversalDispatchUnit;
  snapshot: DispatchUnitSnapshot;
  eligibility: EligibilityResult;
  route: RouteMatrixResult;
  score: number;
  scoreComponents: Record<string, number>;
  rank: number;
}

export interface DiscoveredDispatchCandidate {
  unit: UniversalDispatchUnit;
  distanceKm: number;
  source: 'REDIS' | 'POSTGIS' | 'HAVERSINE';
}

export interface MatchResult {
  request: UniversalServiceRequest;
  traceId: string;
  offersCreated: number;
  eligibleCandidates: number;
  candidateCount: number;
  selectedDispatchUnitIds: string[];
  status: string;
  shadowMode: boolean;
}

export interface RouteOptimizationResult {
  feasible: boolean;
  source: 'HEURISTIC' | 'EXTERNAL';
  orderedStops: Array<{
    originalSequence: number;
    sequence: number;
    latitude: number;
    longitude: number;
    type: string;
  }>;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  violations: string[];
  timedOut: boolean;
  metadata?: Record<string, unknown>;
}
