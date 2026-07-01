import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, MoreThan } from 'typeorm';
import { RedisService } from '../../infrastructure/redis.service';
import { UniversalDispatchUnit } from '../domain/universal-dispatch.entities';
import { DispatchUnitStatus, UniversalServiceType } from '../domain/universal-dispatch.enums';
import { DispatchMetricsService } from './dispatch-metrics.service';

export interface GeoCandidate {
  dispatchUnitId: string;
  distanceKm: number;
  source: 'REDIS' | 'POSTGIS' | 'HAVERSINE';
}

@Injectable()
export class DispatchGeoIndexService {
  private readonly logger = new Logger(DispatchGeoIndexService.name);
  private readonly ttlSeconds: number;
  private postgisAvailable?: boolean;

  constructor(
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly metrics: DispatchMetricsService,
  ) {
    this.ttlSeconds = Number(this.config.get<string>('DRIVER_GEO_TTL_SECONDS') ?? 300);
  }

  private geoKey(marketId: string, serviceType: UniversalServiceType): string {
    return `geo:${marketId}:${serviceType}`;
  }

  async add(unit: UniversalDispatchUnit, serviceTypes: UniversalServiceType[]): Promise<void> {
    if (unit.status !== DispatchUnitStatus.AVAILABLE || unit.latitude == null || unit.longitude == null) {
      await this.remove(unit.id, unit.marketId, serviceTypes);
      return;
    }
    await Promise.all(
      serviceTypes.map((serviceType) =>
        this.redis.geoAdd(
          this.geoKey(unit.marketId, serviceType),
          unit.id,
          unit.longitude!,
          unit.latitude!,
          this.ttlSeconds,
        ),
      ),
    );
  }

  async remove(
    dispatchUnitId: string,
    marketId: string,
    serviceTypes: UniversalServiceType[],
  ): Promise<void> {
    await Promise.all(
      serviceTypes.map((serviceType) =>
        this.redis.geoRemove(this.geoKey(marketId, serviceType), dispatchUnitId),
      ),
    );
  }

  async findNearby(
    marketId: string,
    serviceType: UniversalServiceType,
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit: number,
  ): Promise<GeoCandidate[]> {
    const redis = await this.findWithRedis(marketId, serviceType, latitude, longitude, radiusKm, limit);
    if (redis.length) return redis;

    const postgis = await this.findWithPostgis(marketId, serviceType, latitude, longitude, radiusKm, limit);
    if (postgis.length) return postgis;

    return this.findWithHaversine(marketId, serviceType, latitude, longitude, radiusKm, limit);
  }

  private async findWithRedis(
    marketId: string,
    serviceType: UniversalServiceType,
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit: number,
  ): Promise<GeoCandidate[]> {
    const matches = await this.redis.geoSearch(
      this.geoKey(marketId, serviceType),
      longitude,
      latitude,
      radiusKm,
      limit,
    );
    if (!matches.length) return [];
    this.metrics.incrementGeoSource('REDIS');
    return matches.map((item) => ({
      dispatchUnitId: item.member,
      distanceKm: item.distanceKm,
      source: 'REDIS' as const,
    }));
  }

  private async findWithPostgis(
    marketId: string,
    serviceType: UniversalServiceType,
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit: number,
  ): Promise<GeoCandidate[]> {
    if (this.dataSource.options.type !== 'postgres' || this.postgisAvailable === false) return [];
    try {
      if (this.postgisAvailable === undefined) {
        await this.dataSource.query('SELECT PostGIS_Version()');
        this.postgisAvailable = true;
      }
      const freshnessSeconds = Number(this.config.get<string>('DISPATCH_LOCATION_FRESHNESS_SECONDS') ?? 60);
      const rows = await this.dataSource.query<Array<{ id: string; distance_km: string | number }>>(
        `SELECT "id",
          ST_Distance(
            ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS "distance_km"
        FROM "universal_dispatch_units"
        WHERE "marketId" = $3
          AND "status" = $4
          AND "locationRecordedAt" > now() - interval '${freshnessSeconds} seconds'
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $5
          )
        ORDER BY "distance_km" ASC
        LIMIT $6`,
        [longitude, latitude, marketId, DispatchUnitStatus.AVAILABLE, radiusKm * 1000, limit],
      );
      if (rows.length) {
        this.metrics.incrementGeoSource('POSTGIS');
      }
      return rows.map((row) => ({
        dispatchUnitId: row.id,
        distanceKm: Number(row.distance_km),
        source: 'POSTGIS' as const,
      }));
    } catch (error) {
      this.postgisAvailable = false;
      this.logger.warn(
        `PostGIS dispatch lookup unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private async findWithHaversine(
    marketId: string,
    serviceType: UniversalServiceType,
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit: number,
  ): Promise<GeoCandidate[]> {
    const fallbackEnabled = (this.config.get<string>('DISPATCH_GEO_FALLBACK_ENABLED') ?? 'true') === 'true';
    if (!fallbackEnabled) return [];

    const maxScan = Number(this.config.get<string>('DISPATCH_GEO_MAX_SCAN') ?? 500);
    const freshnessSeconds = Number(this.config.get<string>('DISPATCH_LOCATION_FRESHNESS_SECONDS') ?? 60);
    const cutoff = new Date(Date.now() - freshnessSeconds * 1000);
    const { haversineDistanceKm } = await import('../domain/universal-dispatch.utils');

    const units = await this.dataSource.getRepository(UniversalDispatchUnit).find({
      where: {
        marketId,
        status: DispatchUnitStatus.AVAILABLE,
        locationRecordedAt: MoreThan(cutoff),
      },
      take: maxScan,
      order: { locationRecordedAt: 'DESC' },
    });

    const candidates = units
      .filter((unit) => this.unitSupportsService(unit, serviceType))
      .filter((unit) => unit.latitude != null && unit.longitude != null)
      .map((unit) => ({
        dispatchUnitId: unit.id,
        distanceKm: haversineDistanceKm(
          { latitude, longitude },
          { latitude: unit.latitude!, longitude: unit.longitude! },
        ),
        source: 'HAVERSINE' as const,
      }))
      .filter((item) => item.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    if (candidates.length) {
      this.metrics.incrementGeoSource('HAVERSINE');
    }
    return candidates;
  }

  private unitSupportsService(unit: UniversalDispatchUnit, serviceType: UniversalServiceType): boolean {
    const enabledServices = unit.enabledServices ?? unit.eligibilitySnapshot?.enabledServices ?? [];
    return (enabledServices as UniversalServiceType[]).includes(serviceType);
  }
}
