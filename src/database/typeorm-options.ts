import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ENTITIES } from './entities';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function createTypeOrmOptions(): TypeOrmModuleOptions {
  const type = (process.env.DB_TYPE ?? 'sqljs').toLowerCase();
  const synchronize = bool(process.env.DB_SYNCHRONIZE, true);
  const logging = bool(process.env.DB_LOGGING, false);

  if (type === 'postgres') {
    return {
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://evzone:evzone@localhost:5432/evzone',
      entities: [...ENTITIES],
      migrations: [resolve(__dirname, 'migrations/*{.ts,.js}')],
      migrationsRun: bool(process.env.DB_MIGRATIONS_RUN, false),
      migrationsTableName: 'typeorm_migrations',
      synchronize,
      logging,
      ssl: bool(process.env.DB_SSL, false) ? { rejectUnauthorized: false } : false,
      extra: { max: Number(process.env.DB_POOL_SIZE ?? 20) },
    };
  }

  const location = resolve(process.env.SQLITE_PATH ?? './evzone.sqlite');
  mkdirSync(dirname(location), { recursive: true });
  return {
    type: 'sqljs',
    location,
    autoSave: true,
    entities: [...ENTITIES],
    synchronize,
    logging,
  };
}
