import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { DataSource } from 'typeorm';

/**
 * Expected latest applied migration. Update this constant whenever a new
 * migration is added to src/database/migrations/.
 */
const EXPECTED_LATEST_MIGRATION = 'PartnerIntegrationFramework1785000002000';

@Injectable()
export class MigrationsHealthIndicator extends HealthIndicator {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // SQL.js test runs intentionally skip Postgres-only migrations, so the
      // migration parity check is not meaningful there.
      if (this.dataSource.options.type === 'sqljs') {
        return this.getStatus(key, true, {
          latest: null,
          expected: EXPECTED_LATEST_MIGRATION,
          note: 'sqljs migration parity check skipped',
        });
      }

      const rows = await this.dataSource.query(
        'SELECT name FROM typeorm_migrations ORDER BY timestamp DESC LIMIT 1',
      );
      const latest = (rows?.[0]?.name as string | undefined) ?? null;
      const isHealthy = latest === EXPECTED_LATEST_MIGRATION;
      const result = this.getStatus(key, isHealthy, {
        latest,
        expected: EXPECTED_LATEST_MIGRATION,
      });
      if (!isHealthy) {
        throw new HealthCheckError('Migration state is not current', result);
      }
      return result;
    } catch (error) {
      if (error instanceof HealthCheckError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError(
        `Migration check failed: ${message}`,
        this.getStatus(key, false, { message }),
      );
    }
  }
}
