import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { DriverAvailabilityStatus, DriverVerificationStatus, ServiceType } from '../common/enums';
import { haversineKm } from '../common/utils/geo';
import { DriverProfile } from '../database/entities';
import { RedisService } from '../infrastructure/redis.service';

export type DriverLocationSource = 'POSTGIS' | 'REDIS' | 'HAVERSINE';

export interface NearbyDriverResult {
  driver: DriverProfile;
  distanceKm: number;
  source: DriverLocationSource;
}

@Injectable()
export class DriverLocatorService {
  private readonly logger = new Logger(DriverLocatorService.name);
  private postgisAvailable?: boolean;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    private readonly redis: RedisService,
  ) {}

  async indexDriver(driver: DriverProfile): Promise<void> {
    const keys = Object.values(ServiceType).map((serviceType) => this.geoKey(serviceType));
    if (
      ![DriverAvailabilityStatus.ONLINE, DriverAvailabilityStatus.BUSY].includes(driver.availabilityStatus) ||
      driver.verificationStatus !== DriverVerificationStatus.VERIFIED ||
      driver.lastLatitude == null ||
      driver.lastLongitude == null
    ) {
      await Promise.all(keys.map((key) => this.redis.geoRemove(key, driver.id)));
      return;
    }

    await Promise.all(
      (driver.serviceCapabilities ?? []).map((serviceType) =>
        this.redis.geoAdd(
          this.geoKey(serviceType),
          driver.id,
          Number(driver.lastLongitude),
          Number(driver.lastLatitude),
          Number(process.env.DRIVER_GEO_TTL_SECONDS ?? 300),
        ),
      ),
    );
  }

  async removeDriver(driverId: string): Promise<void> {
    await Promise.all(
      Object.values(ServiceType).map((serviceType) =>
        this.redis.geoRemove(this.geoKey(serviceType), driverId),
      ),
    );
  }

  async findNearby(
    serviceType: ServiceType,
    latitude: number,
    longitude: number,
    radiusKm = 25,
    limit = 100,
  ): Promise<NearbyDriverResult[]> {
    const postgis = await this.findWithPostgis(serviceType, latitude, longitude, radiusKm, limit);
    if (postgis.length) return postgis;

    const redis = await this.findWithRedis(serviceType, latitude, longitude, radiusKm, limit);
    if (redis.length) return redis;

    return this.findWithHaversine(serviceType, latitude, longitude, radiusKm, limit);
  }

  status() {
    return {
      databaseType: this.dataSource.options.type,
      postgisAvailable: this.postgisAvailable ?? null,
      redis: this.redis.status(),
      fallbackOrder: ['POSTGIS', 'REDIS', 'HAVERSINE'],
    };
  }

  private async findWithPostgis(
    serviceType: ServiceType,
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit: number,
  ): Promise<NearbyDriverResult[]> {
    if (this.dataSource.options.type !== 'postgres' || this.postgisAvailable === false) return [];
    try {
      if (this.postgisAvailable === undefined) {
        await this.dataSource.query('SELECT PostGIS_Version()');
        this.postgisAvailable = true;
      }
      const rows = await this.dataSource.query<Array<{ id: string; distanceKm: string | number }>>(
        `SELECT "id",
          ST_Distance(
            ST_SetSRID(ST_MakePoint(CAST("lastLongitude" AS double precision), CAST("lastLatitude" AS double precision)), 4326)::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS "distanceKm"
        FROM "driver_profiles"
        WHERE "availabilityStatus" IN ($3, $4)
          AND "verificationStatus" = $5
          AND "lastLatitude" IS NOT NULL
          AND "lastLongitude" IS NOT NULL
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(CAST("lastLongitude" AS double precision), CAST("lastLatitude" AS double precision)), 4326)::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $6
          )
        ORDER BY "distanceKm" ASC
        LIMIT $7`,
        [
          longitude,
          latitude,
          DriverAvailabilityStatus.ONLINE,
          DriverAvailabilityStatus.BUSY,
          DriverVerificationStatus.VERIFIED,
          radiusKm * 1000,
          limit,
        ],
      );
      if (!rows.length) return [];
      const profiles = await this.drivers.find({ where: { id: In(rows.map((row) => row.id)) } });
      return rows.reduce<NearbyDriverResult[]>((results, row) => {
        const driver = profiles.find((profile) => profile.id === row.id);
        if (driver?.serviceCapabilities?.includes(serviceType)) {
          results.push({ driver, distanceKm: Number(row.distanceKm), source: 'POSTGIS' });
        }
        return results;
      }, []);
    } catch (error) {
      this.postgisAvailable = false;
      this.logger.warn(
        `PostGIS lookup unavailable; falling back to Redis/Haversine: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private async findWithRedis(
    serviceType: ServiceType,
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit: number,
  ): Promise<NearbyDriverResult[]> {
    const matches = await this.redis.geoSearch(
      this.geoKey(serviceType),
      longitude,
      latitude,
      radiusKm,
      limit,
    );
    if (!matches.length) return [];
    const profiles = await this.drivers.find({ where: { id: In(matches.map((item) => item.member)) } });
    return matches.reduce<NearbyDriverResult[]>((results, item) => {
      const driver = profiles.find((profile) => profile.id === item.member);
      if (driver && this.isEligible(driver, serviceType)) {
        results.push({ driver, distanceKm: item.distanceKm, source: 'REDIS' });
      }
      return results;
    }, []);
  }

  private async findWithHaversine(
    serviceType: ServiceType,
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit: number,
  ): Promise<NearbyDriverResult[]> {
    const candidates = await this.drivers.find({
      where: [
        {
          availabilityStatus: DriverAvailabilityStatus.ONLINE,
          verificationStatus: DriverVerificationStatus.VERIFIED,
        },
        {
          availabilityStatus: DriverAvailabilityStatus.BUSY,
          verificationStatus: DriverVerificationStatus.VERIFIED,
        },
      ],
    });
    return candidates
      .filter((driver) => this.isEligible(driver, serviceType))
      .filter((driver) => driver.lastLatitude != null && driver.lastLongitude != null)
      .map((driver) => ({
        driver,
        distanceKm: haversineKm(
          { latitude, longitude },
          { latitude: Number(driver.lastLatitude), longitude: Number(driver.lastLongitude) },
        ),
        source: 'HAVERSINE' as const,
      }))
      .filter((item) => item.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  private isEligible(driver: DriverProfile, serviceType: ServiceType): boolean {
    return (
      [DriverAvailabilityStatus.ONLINE, DriverAvailabilityStatus.BUSY].includes(driver.availabilityStatus) &&
      driver.verificationStatus === DriverVerificationStatus.VERIFIED &&
      Boolean(driver.serviceCapabilities?.includes(serviceType))
    );
  }

  private geoKey(serviceType: ServiceType): string {
    return `geo:drivers:${serviceType}`;
  }
}
