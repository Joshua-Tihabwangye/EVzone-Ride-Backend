import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PostgisBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PostgisBootstrapService.name);
  private extensionAvailable = false;
  private indexReady = false;
  private lastError?: string;

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') return;
    if ((process.env.POSTGIS_AUTO_SETUP ?? 'true').toLowerCase() !== 'true') return;
    try {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS postgis');
      await this.dataSource.query('SELECT PostGIS_Version()');
      this.extensionAvailable = true;
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS "IDX_driver_profiles_location_geography"
        ON "driver_profiles" USING GIST (
          (ST_SetSRID(
            ST_MakePoint(
              CAST("lastLongitude" AS double precision),
              CAST("lastLatitude" AS double precision)
            ),
            4326
          )::geography)
        )
        WHERE "lastLatitude" IS NOT NULL AND "lastLongitude" IS NOT NULL
      `);
      this.indexReady = true;
      this.logger.log('PostGIS extension and driver geography index are ready');
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `PostGIS bootstrap could not complete; Redis/Haversine fallbacks remain active: ${this.lastError}`,
      );
    }
  }

  status() {
    return {
      applicable: this.dataSource.options.type === 'postgres',
      autoSetup: (process.env.POSTGIS_AUTO_SETUP ?? 'true').toLowerCase() === 'true',
      extensionAvailable: this.extensionAvailable,
      geographyIndexReady: this.indexReady,
      lastError: this.lastError,
    };
  }
}
