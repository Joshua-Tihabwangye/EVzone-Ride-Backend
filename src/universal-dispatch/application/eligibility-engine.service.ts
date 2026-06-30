import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ServiceZone } from '../../database/entities';
import { DispatchReasonCode, DispatchUnitStatus } from '../domain/universal-dispatch.enums';
import {
  DispatchPolicyConfig,
  DispatchUnitSnapshot,
  EligibilityResult,
} from '../domain/universal-dispatch.types';
import { UniversalServiceRequest } from '../domain/universal-dispatch.entities';
import { haversineDistanceKm, isPointInPolygon } from '../domain/universal-dispatch.utils';

interface EvaluationContext {
  request: UniversalServiceRequest;
  policy: DispatchPolicyConfig;
  now: Date;
  excludedDriverIds?: Set<string>;
  zones: ServiceZone[];
}

@Injectable()
export class EligibilityEngineService {
  constructor(
    @InjectRepository(ServiceZone)
    private readonly zones: Repository<ServiceZone>,
  ) {}

  async evaluate(
    request: UniversalServiceRequest,
    unit: { id: string; snapshot?: DispatchUnitSnapshot },
    policy: DispatchPolicyConfig,
    now = new Date(),
    excludedDriverIds?: Set<string>,
  ): Promise<EligibilityResult> {
    const snapshot = unit.snapshot;
    if (!snapshot) {
      return { eligible: false, reasonCodes: [DispatchReasonCode.DRIVER_INACTIVE], facts: {} };
    }

    const zones =
      policy.operatingZoneIds && policy.operatingZoneIds.length > 0
        ? await this.zones.find({
            where: { id: In(policy.operatingZoneIds), active: true },
          })
        : [];

    const ctx: EvaluationContext = { request, policy, now, excludedDriverIds, zones };
    const checks: Array<() => EligibilityResult | null> = [
      () => this.checkDriverActive(ctx, snapshot),
      () => this.checkDriverVerified(ctx, snapshot),
      () => this.checkServiceEntitlement(ctx, snapshot),
      () => this.checkCertifications(ctx, snapshot),
      () => this.checkVehicle(ctx, snapshot),
      () => this.checkCapacity(ctx, snapshot),
      () => this.checkCapabilities(ctx, snapshot),
      () => this.checkCompliance(ctx, snapshot),
      () => this.checkLiveState(ctx, snapshot),
      () => this.checkScheduleConflict(ctx, snapshot),
      () => this.checkEnergy(ctx, snapshot),
      () => this.checkOperatingZone(ctx, snapshot),
      () => this.checkRiderDriverExclusion(ctx, snapshot),
    ];

    const result: EligibilityResult = { eligible: true, reasonCodes: [], facts: {} };
    for (const check of checks) {
      const failure = check();
      if (failure) {
        result.eligible = false;
        result.reasonCodes.push(...failure.reasonCodes);
        Object.assign(result.facts, failure.facts);
      }
    }

    return result;
  }

  private checkDriverActive(
    ctx: EvaluationContext,
    snapshot: DispatchUnitSnapshot,
  ): EligibilityResult | null {
    if (!snapshot.compliance.driverAccountActive) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.DRIVER_INACTIVE],
        facts: { driverAccountActive: false },
      };
    }
    if (snapshot.compliance.driverSuspended) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.DRIVER_SUSPENDED],
        facts: { driverSuspended: true },
      };
    }
    return null;
  }

  private checkDriverVerified(
    ctx: EvaluationContext,
    snapshot: DispatchUnitSnapshot,
  ): EligibilityResult | null {
    if (!snapshot.compliance.driverVerified) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.DRIVER_UNVERIFIED],
        facts: { driverVerified: false },
      };
    }
    if (!snapshot.compliance.safetyClear) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.DRIVER_UNSAFE],
        facts: { safetyClear: false },
      };
    }
    return null;
  }

  private checkServiceEntitlement(
    ctx: EvaluationContext,
    snapshot: DispatchUnitSnapshot,
  ): EligibilityResult | null {
    if (!snapshot.enabledServices.includes(ctx.request.serviceType)) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.SERVICE_NOT_ENTITLED],
        facts: {
          requestedService: ctx.request.serviceType,
          enabledServices: snapshot.enabledServices,
        },
      };
    }
    return null;
  }

  private checkCertifications(
    ctx: EvaluationContext,
    snapshot: DispatchUnitSnapshot,
  ): EligibilityResult | null {
    const required = ctx.policy.requiredCertifications ?? [];
    const missing = required.filter((code) => !snapshot.driver.certifications.includes(code));
    if (missing.length) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.CERTIFICATION_MISSING],
        facts: { requiredCertifications: required, missingCertifications: missing },
      };
    }
    return null;
  }

  private checkVehicle(ctx: EvaluationContext, snapshot: DispatchUnitSnapshot): EligibilityResult | null {
    const v = snapshot.vehicle;
    if (!v.vehicleId) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.ACTIVE_VEHICLE_MISSING],
        facts: {},
      };
    }
    if (!snapshot.compliance.vehicleActive) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.VEHICLE_INACTIVE],
        facts: { vehicleActive: false },
      };
    }
    if (!snapshot.compliance.vehicleVerified) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.VEHICLE_UNVERIFIED],
        facts: { vehicleVerified: false },
      };
    }
    const allowed = ctx.policy.allowedVehicleTypes ?? [];
    if (allowed.length && !allowed.includes(v.vehicleType)) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.VEHICLE_CLASS_NOT_ALLOWED],
        facts: { vehicleType: v.vehicleType, allowedVehicleTypes: allowed },
      };
    }
    return null;
  }

  private checkCapacity(ctx: EvaluationContext, snapshot: DispatchUnitSnapshot): EligibilityResult | null {
    const passengers = ctx.request.passengerCount ?? 1;
    if (passengers > snapshot.vehicle.passengerCapacity) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.CAPACITY_INSUFFICIENT],
        facts: { requiredPassengers: passengers, passengerCapacity: snapshot.vehicle.passengerCapacity },
      };
    }
    const weight = ctx.request.cargoWeightKg ?? 0;
    if (weight > 0 && snapshot.vehicle.cargoWeightKg > 0 && weight > snapshot.vehicle.cargoWeightKg) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.CARGO_WEIGHT_EXCEEDED],
        facts: { requiredWeightKg: weight, cargoWeightKg: snapshot.vehicle.cargoWeightKg },
      };
    }
    const volume = ctx.request.cargoVolumeM3 ?? 0;
    if (volume > 0 && snapshot.vehicle.cargoVolumeM3 > 0 && volume > snapshot.vehicle.cargoVolumeM3) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.CARGO_VOLUME_EXCEEDED],
        facts: { requiredVolumeM3: volume, cargoVolumeM3: snapshot.vehicle.cargoVolumeM3 },
      };
    }
    return null;
  }

  private checkCapabilities(
    ctx: EvaluationContext,
    snapshot: DispatchUnitSnapshot,
  ): EligibilityResult | null {
    const required = ctx.policy.requiredCapabilities ?? [];
    const verified = snapshot.vehicle.verifiedCapabilityCodes ?? [];
    const missing = required.filter((code) => !verified.includes(code));
    if (missing.length) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.CAPABILITY_MISSING],
        facts: { requiredCapabilities: required, missingCapabilities: missing },
      };
    }
    const requestCapabilities = Object.keys(ctx.request.requirements ?? {});
    const requestMissing = requestCapabilities.filter((code) => {
      const value = ctx.request.requirements?.[code];
      if (value === true) return !verified.includes(code);
      return false;
    });
    if (requestMissing.length) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.CAPABILITY_MISSING],
        facts: { requestRequirements: requestMissing },
      };
    }
    return null;
  }

  private checkCompliance(ctx: EvaluationContext, snapshot: DispatchUnitSnapshot): EligibilityResult | null {
    const reasons: DispatchReasonCode[] = [];
    const facts: Record<string, unknown> = {};
    if (!snapshot.compliance.driverDocumentsValid) {
      reasons.push(DispatchReasonCode.DOCUMENT_INVALID);
      facts.driverDocumentsValid = false;
    }
    if (!snapshot.compliance.insuranceValid) {
      reasons.push(DispatchReasonCode.INSURANCE_INVALID);
      facts.insuranceValid = false;
    }
    if (!snapshot.compliance.inspectionValid) {
      reasons.push(DispatchReasonCode.INSPECTION_INVALID);
      facts.inspectionValid = false;
    }
    if (!snapshot.compliance.registrationValid) {
      reasons.push(DispatchReasonCode.REGISTRATION_INVALID);
      facts.registrationValid = false;
    }
    if (reasons.length) {
      return { eligible: false, reasonCodes: reasons, facts };
    }
    return null;
  }

  private checkLiveState(ctx: EvaluationContext, snapshot: DispatchUnitSnapshot): EligibilityResult | null {
    const live = snapshot.liveState;
    const status = live?.status as DispatchUnitStatus | undefined;
    if (status !== DispatchUnitStatus.AVAILABLE) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.NOT_AVAILABLE],
        facts: { unitStatus: status },
      };
    }
    const lastSeenAt = live?.lastSeenAt;
    if (!lastSeenAt) {
      return { eligible: false, reasonCodes: [DispatchReasonCode.LOCATION_MISSING], facts: {} };
    }
    const freshnessSeconds = (ctx.now.getTime() - new Date(lastSeenAt).getTime()) / 1000;
    if (freshnessSeconds > ctx.policy.locationFreshnessSeconds) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.LOCATION_STALE],
        facts: { freshnessSeconds, thresholdSeconds: ctx.policy.locationFreshnessSeconds },
      };
    }
    const accuracyMeters = live?.accuracyMeters;
    if (accuracyMeters != null && accuracyMeters > ctx.policy.maximumLocationAccuracyMeters) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.LOCATION_INACCURATE],
        facts: { accuracyMeters, thresholdMeters: ctx.policy.maximumLocationAccuracyMeters },
      };
    }
    const chargingState = live?.chargingState;
    if (chargingState === 'CHARGING') {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.CHARGING_IN_PROGRESS],
        facts: { chargingState },
      };
    }
    return null;
  }

  private checkScheduleConflict(
    ctx: EvaluationContext,
    snapshot: DispatchUnitSnapshot,
  ): EligibilityResult | null {
    if (!snapshot.shift.active) {
      return { eligible: false, reasonCodes: [DispatchReasonCode.SHIFT_INACTIVE], facts: {} };
    }
    if (snapshot.shift.breakRequired) {
      return { eligible: false, reasonCodes: [DispatchReasonCode.SHIFT_TIME_INSUFFICIENT], facts: {} };
    }
    if (snapshot.shift.remainingMinutes < ctx.policy.minimumRemainingShiftMinutes) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.SHIFT_TIME_INSUFFICIENT],
        facts: {
          remainingMinutes: snapshot.shift.remainingMinutes,
          requiredMinutes: ctx.policy.minimumRemainingShiftMinutes,
        },
      };
    }
    return null;
  }

  private checkEnergy(ctx: EvaluationContext, snapshot: DispatchUnitSnapshot): EligibilityResult | null {
    if (snapshot.vehicle.energyType !== 'ELECTRIC') return null;
    const live = snapshot.liveState;
    const usableRangeKm = live?.usableRangeKm;
    if (usableRangeKm == null) return null;
    const pickupDistance = haversineDistanceKm(
      { latitude: ctx.request.pickupLatitude, longitude: ctx.request.pickupLongitude },
      { latitude: live?.latitude as number, longitude: live?.longitude as number },
    );
    const tripDistance = haversineDistanceKm(
      { latitude: ctx.request.pickupLatitude, longitude: ctx.request.pickupLongitude },
      { latitude: ctx.request.dropoffLatitude, longitude: ctx.request.dropoffLongitude },
    );
    const reserveKm = Math.max(
      ctx.policy.evFixedReserveKm,
      (usableRangeKm * (ctx.policy.evReservePercent ?? 0)) / 100,
      ctx.policy.chargerContingencyKm,
    );
    const requiredRange = pickupDistance + tripDistance * 1.2 + reserveKm;
    if (usableRangeKm < requiredRange) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.EV_RANGE_INSUFFICIENT],
        facts: { usableRangeKm, requiredRangeKm: requiredRange },
      };
    }
    return null;
  }

  private checkOperatingZone(
    ctx: EvaluationContext,
    snapshot: DispatchUnitSnapshot,
  ): EligibilityResult | null {
    if (ctx.zones.length === 0) return null;

    const latitude = snapshot.liveState?.latitude;
    const longitude = snapshot.liveState?.longitude;
    if (latitude == null || longitude == null) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.OPERATING_ZONE_RESTRICTED],
        facts: { operatingZoneIds: ctx.policy.operatingZoneIds },
      };
    }

    const inside = ctx.zones.some((zone) => isPointInPolygon({ latitude, longitude }, zone.polygon));
    if (!inside) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.OPERATING_ZONE_RESTRICTED],
        facts: {
          operatingZoneIds: ctx.policy.operatingZoneIds,
          latitude,
          longitude,
        },
      };
    }
    return null;
  }

  private checkRiderDriverExclusion(
    ctx: EvaluationContext,
    snapshot: DispatchUnitSnapshot,
  ): EligibilityResult | null {
    if (ctx.excludedDriverIds?.has(snapshot.driver.driverId)) {
      return {
        eligible: false,
        reasonCodes: [DispatchReasonCode.RIDER_DRIVER_EXCLUDED],
        facts: { excludedDriverId: snapshot.driver.driverId },
      };
    }
    return null;
  }
}
