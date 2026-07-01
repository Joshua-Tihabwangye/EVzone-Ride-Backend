import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infrastructure/redis.service';
import { UniversalDispatchUnit } from '../domain/universal-dispatch.entities';
import { DispatchUnitSnapshot, DispatchUnitLiveState } from '../domain/universal-dispatch.types';

interface LiveSnapshot {
  status: string;
  marketId: string;
  vehicleId: string;
  fleetId?: string;
  lastSeenEpochMs: number;
  lat?: number;
  lon?: number;
  heading?: number;
  speedMps?: number;
  accuracyM?: number;
  sequence: number;
  availableSinceEpochMs?: number;
  snapshotVersion: number;
  batterySoc?: number;
  usableRangeKm?: number;
  remainingShiftMinutes?: number;
  enabledServices: string[];
  capabilityCodes: string[];
  complianceVersion: number;
  activeRequestId?: string;
  activeOfferId?: string;
}

@Injectable()
export class DispatchLiveStateService {
  private readonly logger = new Logger(DispatchLiveStateService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.ttlSeconds = Number(this.config.get<string>('DRIVER_GEO_TTL_SECONDS') ?? 300);
  }

  private snapshotKey(dispatchUnitId: string): string {
    return `du:live:${dispatchUnitId}`;
  }

  private freshnessKey(marketId: string): string {
    return `du:last_seen:${marketId}`;
  }

  async setLiveSnapshot(unit: UniversalDispatchUnit, snapshot: DispatchUnitSnapshot): Promise<void> {
    const live = snapshot.liveState;
    const data: LiveSnapshot = {
      status: live.status,
      marketId: unit.marketId,
      vehicleId: unit.activeVehicleId,
      fleetId: unit.fleetId ?? undefined,
      lastSeenEpochMs: live.lastSeenAt ? new Date(live.lastSeenAt).getTime() : Date.now(),
      lat: live.latitude,
      lon: live.longitude,
      heading: live.heading,
      speedMps: live.speedKph ? live.speedKph / 3.6 : undefined,
      accuracyM: live.accuracyMeters,
      sequence: unit.locationSequence,
      availableSinceEpochMs: live.availableSince ? new Date(live.availableSince).getTime() : undefined,
      snapshotVersion: snapshot.snapshotVersion,
      batterySoc: live.batterySoc,
      usableRangeKm: live.usableRangeKm,
      remainingShiftMinutes: unit.remainingShiftMinutes ?? snapshot.shift.remainingMinutes,
      enabledServices: snapshot.enabledServices,
      capabilityCodes: snapshot.vehicle.verifiedCapabilityCodes,
      complianceVersion: snapshot.snapshotVersion,
      activeRequestId: live.activeRequestId,
      activeOfferId: live.activeOfferId,
    };
    await this.redis.setJson(this.snapshotKey(unit.id), data, this.ttlSeconds);
    if (live.lastSeenAt) {
      await this.redis.set(
        this.freshnessKey(unit.marketId),
        `${unit.id}:${data.lastSeenEpochMs}`,
        this.ttlSeconds,
      );
    }
  }

  async getLiveSnapshot(dispatchUnitId: string): Promise<LiveSnapshot | null> {
    return this.redis.getJson<LiveSnapshot>(this.snapshotKey(dispatchUnitId));
  }

  async removeLiveSnapshot(dispatchUnitId: string, marketId: string): Promise<void> {
    await this.redis.delete(this.snapshotKey(dispatchUnitId));
    await this.redis.delete(this.freshnessKey(marketId));
  }

  buildLiveStateFromUnit(unit: UniversalDispatchUnit): DispatchUnitLiveState {
    return {
      status: unit.status,
      latitude: unit.latitude,
      longitude: unit.longitude,
      accuracyMeters: unit.accuracyMeters,
      speedKph: unit.speedKph,
      heading: unit.heading,
      lastSeenAt: unit.locationRecordedAt?.toISOString(),
      availableSince: unit.availableSince?.toISOString(),
      lastAssignedAt: unit.lastAssignedAt?.toISOString(),
      batterySoc: unit.batterySoc,
      usableRangeKm: unit.usableRangeKm,
      chargingState: unit.chargingState,
      activeRequestId: unit.activeRequestId,
      activeOfferId: unit.activeOfferId,
    };
  }
}
