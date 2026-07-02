import { spawnSync } from 'child_process';
import { Client } from 'pg';
import * as path from 'path';

const DEFAULT_TEST_DATABASE_URL = 'postgresql://evzone:evzone-group@localhost:5432/evzone';

export function getTestDatabaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
}

export async function isPostgresAvailable(databaseUrl?: string): Promise<boolean> {
  const url = databaseUrl ?? getTestDatabaseUrl();
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Synchronously checks whether the configured Postgres database is reachable.
 * Caches the result in `process.env.__TEST_DB_AVAILABLE` so that only the
 * first test file in a run pays the connection penalty.
 */
export function isPostgresReachableSync(): boolean {
  const cached = process.env.__TEST_DB_AVAILABLE;
  if (cached === 'true') return true;
  if (cached === 'false') return false;

  const helperPath = path.join(__dirname, 'db-availability.ts');
  const tsNodeBin = require.resolve('ts-node/dist/bin');
  const result = spawnSync(process.execPath, [tsNodeBin, '--transpile-only', helperPath], {
    encoding: 'utf8',
    timeout: 5000,
    stdio: 'pipe',
  });

  const available = result.status === 0;
  process.env.__TEST_DB_AVAILABLE = available ? 'true' : 'false';
  return available;
}

// CLI entry point used by `isPostgresReachableSync`.
if (require.main === module) {
  isPostgresAvailable().then((available) => process.exit(available ? 0 : 1));
}
