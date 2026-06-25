import { UniversalServiceType } from '../domain/universal-dispatch.enums';
import { DispatchPolicyConfig, DispatchPolicyWeights } from '../domain/universal-dispatch.types';

const baseWeights = {
  pickupEta: 0.42,
  reliability: 0.16,
  fairness: 0.12,
  serviceQuality: 0.1,
  routeFit: 0.1,
  energyMargin: 0.05,
  preference: 0.05,
};

type PolicyOverrides = Partial<Omit<DispatchPolicyConfig, 'weights'>> & {
  weights?: Partial<DispatchPolicyWeights>;
};

function base(overrides: PolicyOverrides = {}): DispatchPolicyConfig {
  const mergedWeights = { ...baseWeights, ...(overrides.weights ?? {}) };
  const weightTotal = Object.values(mergedWeights).reduce((sum, value) => sum + value, 0);
  const normalizedWeights: DispatchPolicyWeights = {
    pickupEta: mergedWeights.pickupEta / weightTotal,
    reliability: mergedWeights.reliability / weightTotal,
    fairness: mergedWeights.fairness / weightTotal,
    serviceQuality: mergedWeights.serviceQuality / weightTotal,
    routeFit: mergedWeights.routeFit / weightTotal,
    energyMargin: mergedWeights.energyMargin / weightTotal,
    preference: mergedWeights.preference / weightTotal,
  };
  return {
    schemaVersion: '1.0',
    allowedVehicleTypes: ['SEDAN', 'HATCHBACK', 'CROSSOVER', 'SUV', 'MINIVAN'],
    requiredCertifications: ['PASSENGER_TRANSPORT'],
    requiredCapabilities: [],
    candidateIndexes: ['service', 'market'],
    searchRadiiKm: [3, 6, 12, 25],
    routeMatrixLimit: 12,
    candidateLimit: 80,
    offerWaves: [
      { size: 1, timeoutSeconds: 10 },
      { size: 2, timeoutSeconds: 10 },
      { size: 3, timeoutSeconds: 12 },
    ],
    locationFreshnessSeconds: 45,
    maximumLocationAccuracyMeters: 100,
    routeProviderTimeoutMs: 1500,
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
    allowedFallbacks: ['expandRadius', 'conservativeEta', 'postgisDiscovery'],
    substitutions: {},
    serviceSpecific: {},
    ...overrides,
    weights: normalizedWeights,
  };
}

export const DEFAULT_DISPATCH_POLICIES: Record<UniversalServiceType, DispatchPolicyConfig> = {
  [UniversalServiceType.STANDARD_RIDE]: base({
    serviceSpecific: {
      supportsRoundTrip: true,
      supportsMultiStop: true,
      scheduledOverrides: { offerTimeoutSeconds: 60, leadMinutes: 30 },
    },
  }),
  [UniversalServiceType.EV_SCOOTER_RIDE]: base({
    allowedVehicleTypes: ['SCOOTER'],
    requiredCertifications: ['PASSENGER_TRANSPORT', 'TWO_WHEELER_APPROVED'],
    searchRadiiKm: [2, 4, 8, 15],
    maximumPickupEtaSeconds: 900,
    serviceSpecific: { maximumPassengers: 1, travelMode: 'motorcycle' },
  }),
  [UniversalServiceType.EV_MOTORCYCLE_RIDE]: base({
    allowedVehicleTypes: ['MOTORCYCLE'],
    requiredCertifications: ['PASSENGER_TRANSPORT', 'TWO_WHEELER_APPROVED'],
    searchRadiiKm: [2, 5, 10, 20],
    serviceSpecific: { maximumPassengers: 1, travelMode: 'motorcycle' },
  }),
  [UniversalServiceType.BICYCLE_RIDE]: base({
    allowedVehicleTypes: ['BICYCLE'],
    requiredCertifications: ['BICYCLE_PASSENGER_APPROVED'],
    searchRadiiKm: [1, 3, 6, 10],
    maximumPickupEtaSeconds: 1200,
    serviceSpecific: { maximumPassengers: 1, travelMode: 'cycling' },
  }),
  [UniversalServiceType.MINI_CAR_RIDE]: base({
    allowedVehicleTypes: ['HATCHBACK', 'MINI_CAR'],
    serviceSpecific: { maximumPassengers: 3 },
  }),
  [UniversalServiceType.PREMIUM_RIDE]: base({
    allowedVehicleTypes: ['LUXURY', 'SUV'],
    requiredCertifications: ['PASSENGER_TRANSPORT', 'PREMIUM_SERVICE'],
    requiredCapabilities: ['PREMIUM_APPROVED'],
    weights: { pickupEta: 0.32, serviceQuality: 0.22, reliability: 0.18 },
    offerWaves: [
      { size: 1, timeoutSeconds: 15 },
      { size: 1, timeoutSeconds: 15 },
      { size: 2, timeoutSeconds: 15 },
    ],
  }),
  [UniversalServiceType.PRIVATE_DRIVER]: base({
    allowedVehicleTypes: ['SEDAN', 'SUV', 'LUXURY', 'MINIVAN'],
    requiredCertifications: ['PASSENGER_TRANSPORT', 'CHAUFFEUR_APPROVED'],
    offerWaves: [
      { size: 1, timeoutSeconds: 15 },
      { size: 2, timeoutSeconds: 20 },
    ],
    scheduleLeadMinutes: 120,
  }),
  [UniversalServiceType.BUSINESS_RIDE]: base({
    requiredCertifications: ['PASSENGER_TRANSPORT', 'BUSINESS_SERVICE'],
    requiredCapabilities: ['CORPORATE_APPROVED'],
    serviceSpecific: { paymentAuthorizationRequired: true, contractRulesRequired: true },
  }),
  [UniversalServiceType.AIRPORT_TRANSFER]: base({
    requiredCertifications: ['PASSENGER_TRANSPORT', 'AIRPORT_APPROVED'],
    requiredCapabilities: ['LARGE_TRUNK'],
    scheduleLeadMinutes: 90,
    weights: { pickupEta: 0.34, reliability: 0.22, routeFit: 0.15 },
    serviceSpecific: { flightTrackingSupported: true, airportPermitRequired: true },
  }),
  [UniversalServiceType.INTERCITY]: base({
    allowedVehicleTypes: ['SEDAN', 'CROSSOVER', 'SUV', 'MINIVAN', 'BUS'],
    requiredCertifications: ['PASSENGER_TRANSPORT', 'INTERCITY_APPROVED'],
    searchRadiiKm: [5, 15, 30, 60],
    maximumPickupEtaSeconds: 3600,
    scheduleLeadMinutes: 120,
    minimumRemainingShiftMinutes: 180,
    evReservePercent: 20,
    evFixedReserveKm: 30,
    chargerContingencyKm: 25,
    offerWaves: [
      { size: 1, timeoutSeconds: 30 },
      { size: 2, timeoutSeconds: 45 },
      { size: 3, timeoutSeconds: 60 },
    ],
  }),
  [UniversalServiceType.TOURISM_EVENT]: base({
    allowedVehicleTypes: ['SEDAN', 'SUV', 'MINIVAN', 'BUS', 'LUXURY'],
    requiredCertifications: ['PASSENGER_TRANSPORT', 'TOURISM_APPROVED'],
    scheduleLeadMinutes: 180,
    serviceSpecific: { itineraryFitRequired: true },
  }),
  [UniversalServiceType.NIGHTLIFE]: base({
    requiredCertifications: ['PASSENGER_TRANSPORT', 'NIGHT_SERVICE_APPROVED'],
    requiredCapabilities: ['SAFETY_KIT'],
    weights: { pickupEta: 0.38, reliability: 0.2, serviceQuality: 0.12 },
  }),
  [UniversalServiceType.SENIOR_ASSISTANCE]: base({
    requiredCertifications: ['PASSENGER_TRANSPORT', 'SENIOR_ASSISTANCE'],
    requiredCapabilities: ['ASSISTANCE_READY'],
    offerWaves: [
      { size: 1, timeoutSeconds: 15 },
      { size: 2, timeoutSeconds: 20 },
    ],
    weights: { pickupEta: 0.28, reliability: 0.22, serviceQuality: 0.2 },
  }),
  [UniversalServiceType.MEDICAL_PWD_RIDE]: base({
    allowedVehicleTypes: ['SEDAN', 'SUV', 'MINIVAN', 'VAN', 'AMBULANCE'],
    requiredCertifications: ['PASSENGER_TRANSPORT', 'PWD_MEDICAL_ASSISTANCE'],
    requiredCapabilities: ['FIRST_AID_KIT'],
    offerWaves: [
      { size: 1, timeoutSeconds: 15 },
      { size: 2, timeoutSeconds: 15 },
      { size: 3, timeoutSeconds: 20 },
    ],
    weights: { pickupEta: 0.3, reliability: 0.24, serviceQuality: 0.18 },
    neverRelax: [...base().neverRelax, 'medicalTraining', 'medicalEquipment'],
  }),
  [UniversalServiceType.AMBULANCE_TRANSPORT]: base({
    allowedVehicleTypes: ['AMBULANCE'],
    requiredCertifications: ['AMBULANCE_DRIVER', 'EMERGENCY_RESPONSE'],
    requiredCapabilities: ['AMBULANCE_APPROVED', 'FIRST_AID_KIT'],
    searchRadiiKm: [5, 15, 30, 60],
    offerWaves: [
      { size: 2, timeoutSeconds: 10 },
      { size: 3, timeoutSeconds: 10 },
    ],
    weights: { pickupEta: 0.58, reliability: 0.18, fairness: 0.02 },
    neverRelax: [...base().neverRelax, 'ambulanceCertification', 'emergencyEquipment'],
  }),
  [UniversalServiceType.SCHOOL_RIDE]: base({
    allowedVehicleTypes: ['SEDAN', 'SUV', 'MINIVAN', 'VAN', 'BUS'],
    requiredCertifications: ['PASSENGER_TRANSPORT', 'SCHOOL_TRANSPORT_APPROVED', 'CHILD_SAFETY'],
    requiredCapabilities: ['SCHOOL_APPROVED', 'SEAT_BELTS', 'GPS_TRACKING'],
    scheduleLeadMinutes: 180,
    minimumRemainingShiftMinutes: 120,
    offerWaves: [
      { size: 1, timeoutSeconds: 60 },
      { size: 2, timeoutSeconds: 90 },
    ],
    weights: { pickupEta: 0.18, reliability: 0.28, serviceQuality: 0.18, routeFit: 0.18 },
    neverRelax: [...base().neverRelax, 'authorizedRoster', 'routeContinuity', 'childSafety'],
    serviceSpecific: { unrelatedPassengerMixingAllowed: false, continuityPreferred: true },
  }),
  [UniversalServiceType.RENTAL_WITH_DRIVER]: base({
    allowedVehicleTypes: ['SEDAN', 'SUV', 'MINIVAN', 'VAN', 'BUS', 'LUXURY'],
    requiredCertifications: ['PASSENGER_TRANSPORT', 'RENTAL_WITH_DRIVER'],
    scheduleLeadMinutes: 120,
    serviceSpecific: { rentalContractRequired: true },
  }),
  [UniversalServiceType.SHARED_RIDE]: base({
    requiredCertifications: ['PASSENGER_TRANSPORT'],
    requiredCapabilities: ['RIDE_SHARING_ENABLED'],
    maximumSharedDetourMinutes: 12,
    maximumSharedWaitMinutes: 10,
    weights: { pickupEta: 0.28, routeFit: 0.24, fairness: 0.12 },
    serviceSpecific: { routeInsertionRequired: true, capacityEverySegment: true },
  }),
  [UniversalServiceType.PARCEL_BIKE]: base({
    allowedVehicleTypes: ['BICYCLE'],
    requiredCertifications: ['PARCEL_DELIVERY'],
    requiredCapabilities: ['PARCEL_CARRIER'],
    searchRadiiKm: [2, 5, 10, 15],
    serviceSpecific: { maximumWeightKg: 15, travelMode: 'cycling' },
  }),
  [UniversalServiceType.PARCEL_SCOOTER]: base({
    allowedVehicleTypes: ['SCOOTER', 'MOTORCYCLE'],
    requiredCertifications: ['PARCEL_DELIVERY'],
    requiredCapabilities: ['PARCEL_CARRIER'],
    searchRadiiKm: [2, 5, 12, 25],
    serviceSpecific: { maximumWeightKg: 40, travelMode: 'motorcycle' },
  }),
  [UniversalServiceType.PARCEL_CAR]: base({
    allowedVehicleTypes: ['HATCHBACK', 'SEDAN', 'CROSSOVER', 'SUV', 'MINIVAN'],
    requiredCertifications: ['PARCEL_DELIVERY'],
    requiredCapabilities: ['CARGO_SECUREMENT'],
    serviceSpecific: { maximumWeightKg: 250 },
  }),
  [UniversalServiceType.COURIER]: base({
    allowedVehicleTypes: ['BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'HATCHBACK', 'SEDAN', 'VAN'],
    requiredCertifications: ['COURIER_DELIVERY'],
    requiredCapabilities: ['CARGO_SECUREMENT'],
  }),
  [UniversalServiceType.FOOD_DELIVERY]: base({
    allowedVehicleTypes: ['BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'HATCHBACK', 'SEDAN'],
    requiredCertifications: ['FOOD_DELIVERY'],
    requiredCapabilities: ['INSULATED_CONTAINER'],
    maximumPickupEtaSeconds: 900,
    serviceSpecific: { foodSafetyRequired: true },
  }),
  [UniversalServiceType.CARGO_VAN]: base({
    allowedVehicleTypes: ['VAN', 'MINIVAN'],
    requiredCertifications: ['CARGO_DELIVERY'],
    requiredCapabilities: ['CARGO_SECUREMENT'],
    minimumRemainingShiftMinutes: 120,
    serviceSpecific: { routeOptimizationRequired: true, travelMode: 'truck' },
  }),
  [UniversalServiceType.CARGO_TRUCK]: base({
    allowedVehicleTypes: ['TRUCK'],
    requiredCertifications: ['HEAVY_GOODS', 'CARGO_DELIVERY'],
    requiredCapabilities: ['CARGO_SECUREMENT'],
    searchRadiiKm: [10, 25, 50, 100],
    minimumRemainingShiftMinutes: 180,
    serviceSpecific: { routeOptimizationRequired: true, roadRestrictionsRequired: true, travelMode: 'truck' },
  }),
  [UniversalServiceType.MULTI_STOP_ROUTE]: base({
    allowedVehicleTypes: ['MOTORCYCLE', 'HATCHBACK', 'SEDAN', 'MINIVAN', 'VAN', 'TRUCK'],
    requiredCertifications: ['MULTI_STOP_DELIVERY'],
    requiredCapabilities: ['CARGO_SECUREMENT'],
    minimumRemainingShiftMinutes: 120,
    offerWaves: [
      { size: 1, timeoutSeconds: 30 },
      { size: 2, timeoutSeconds: 45 },
    ],
    serviceSpecific: { routeOptimizationRequired: true, precedenceRequired: true },
  }),
  [UniversalServiceType.PARTNER_VEHICLE]: base({
    requiredCertifications: ['PARTNER_APPROVED'],
    requiredCapabilities: ['PARTNER_VEHICLE_APPROVED'],
    serviceSpecific: { contractRulesRequired: true },
  }),
  [UniversalServiceType.FLEET_CONTRACT]: base({
    requiredCertifications: ['FLEET_CONTRACT_APPROVED'],
    serviceSpecific: { contractRulesRequired: true, fleetRestrictionRequired: true },
  }),
  [UniversalServiceType.SCHEDULED_ROSTER]: base({
    allowedVehicleTypes: ['SEDAN', 'SUV', 'MINIVAN', 'VAN', 'BUS'],
    requiredCertifications: ['SCHEDULED_ROSTER_APPROVED'],
    scheduleLeadMinutes: 180,
    offerWaves: [
      { size: 1, timeoutSeconds: 90 },
      { size: 2, timeoutSeconds: 120 },
    ],
    serviceSpecific: { recurringMaterializationRequired: true, backupCandidates: 2 },
  }),
};

export function policyKeyFor(serviceType: UniversalServiceType, marketId = 'default'): string {
  return `dispatch:${marketId}:${serviceType}`;
}
