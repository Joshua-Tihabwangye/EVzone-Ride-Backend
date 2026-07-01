import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PostgisStatusService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PostgisStatusService.name);
  private extensionAvailable = false;
  private indexReady = false;
  private lastError?: string;

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') return;

    try {
      const [{ exists: extensionExists }] = await this.dataSource.query(
        `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS exists`,
      );
      this.extensionAvailable = extensionExists;

      if (this.extensionAvailable) {
        const [{ exists: indexExists }] = await this.dataSource.query(
          `SELECT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'driver_profiles'
              AND indexname = 'IDX_driver_profiles_location_geography'
          ) AS exists`,
        );
        this.indexReady = indexExists;
      }

      if (this.extensionAvailable && this.indexReady) {
        this.logger.log('PostGIS extension and driver geography index are ready');
      } else {
        this.logger.warn(
          'PostGIS extension or driver geography index not found. Ensure migrations have been run.',
        );
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.warn(`PostGIS status check failed: ${this.lastError}`);
    }
  }

  status() {
    return {
      applicable: this.dataSource.options.type === 'postgres',
      extensionAvailable: this.extensionAvailable,
      geographyIndexReady: this.indexReady,
      lastError: this.lastError,
    };
  }
}
