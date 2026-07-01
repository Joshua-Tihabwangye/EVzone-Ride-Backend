import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENTITIES } from './entities';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function buildPostgresSsl(): PostgresConnectionOptions['ssl'] {
  const sslMode = process.env.DB_SSL_MODE?.toLowerCase();
  const sslEnabled = bool(
    process.env.DB_SSL,
    sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full',
  );

  if (!sslEnabled && !sslMode) return false;

  const ssl: Record<string, unknown> = { rejectUnauthorized: false };

  if (process.env.DB_SSL_CA) {
    try {
      ssl.ca = readFileSync(resolve(process.env.DB_SSL_CA), 'utf8');
      ssl.rejectUnauthorized = true;
    } catch (error) {
      throw new Error(
        `Unable to read DB_SSL_CA file at ${process.env.DB_SSL_CA}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (process.env.DB_SSL_CERT) {
    ssl.cert = readFileSync(resolve(process.env.DB_SSL_CERT), 'utf8');
  }

  if (process.env.DB_SSL_KEY) {
    ssl.key = readFileSync(resolve(process.env.DB_SSL_KEY), 'utf8');
  }

  return ssl as PostgresConnectionOptions['ssl'];
}

export function createTypeOrmOptions(): TypeOrmModuleOptions {
  const type = (process.env.DB_TYPE ?? 'postgres').toLowerCase();
  const synchronize = bool(process.env.DB_SYNCHRONIZE, false);
  const logging = bool(process.env.DB_LOGGING, false);

  if (type !== 'postgres') {
    throw new Error(
      `Unsupported database type: ${type}. PostgreSQL is the only supported database outside isolated unit tests.`,
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. PostgreSQL is the only supported database.');
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [...ENTITIES],
    migrations: [resolve(__dirname, 'migrations/*{.ts,.js}')],
    migrationsRun: bool(process.env.DB_MIGRATIONS_RUN, true),
    migrationsTableName: 'typeorm_migrations',
    synchronize,
    logging,
    ssl: buildPostgresSsl(),
    extra: {
      max: Number(process.env.DB_POOL_SIZE ?? 20),
      min: Number(process.env.DB_POOL_MIN ?? 2),
      connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 30_000),
    },
  };
}
