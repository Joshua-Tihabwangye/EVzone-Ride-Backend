#!/usr/bin/env node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');
const { Client } = pg;

const checks = [];

function fail(message) {
  checks.push({ status: 'FAIL', message });
}

function warn(message) {
  checks.push({ status: 'WARN', message });
}

function pass(message) {
  checks.push({ status: 'PASS', message });
}

function getEnv(name) {
  return process.env[name]?.trim() ?? '';
}

function isProduction() {
  const env = getEnv('NODE_ENV').toLowerCase();
  return env === 'production' || env === 'staging';
}

function isWeakSecret(value) {
  if (!value || value.length < 32) return true;
  const lowered = value.toLowerCase();
  return (
    lowered.includes('secret') ||
    lowered.includes('password') ||
    lowered.includes('123') ||
    lowered.includes('test') ||
    lowered.includes('smoke') ||
    lowered.includes('default') ||
    lowered.includes('change-me')
  );
}

function checkRequiredSecret(name) {
  const value = getEnv(name);
  if (!value) return fail(`Missing required secret ${name}`);
  if (value.length < 32) return fail(`${name} must be at least 32 characters`);
  if (isWeakSecret(value)) return warn(`${name} looks weak or default; rotate before production`);
  return pass(`${name} is configured`);
}

function checkDatabaseUrl() {
  const url = getEnv('DATABASE_URL');
  if (!url) return fail('DATABASE_URL is not set');
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return fail('DATABASE_URL points to localhost; use a managed PostgreSQL instance');
  }
  return pass('DATABASE_URL points to a remote host');
}

function checkBoolean(name, expected) {
  const value = getEnv(name).toLowerCase();
  const truthy = ['true', '1', 'yes'].includes(value);
  if (truthy !== expected) {
    return fail(`${name} must be ${expected ? 'enabled' : 'disabled'} in production (got ${value || 'empty'})`);
  }
  return pass(`${name} is ${expected ? 'enabled' : 'disabled'}`);
}

function checkCors() {
  const origins = getEnv('CORS_ORIGINS');
  if (!origins) return fail('CORS_ORIGINS is not set');
  if (origins === '*') return fail('CORS_ORIGINS is wildcard (*)');
  if (origins.includes('localhost')) return warn('CORS_ORIGINS includes localhost');
  return pass('CORS_ORIGINS is restricted');
}

function checkPublicBaseUrl() {
  const url = getEnv('PUBLIC_BASE_URL');
  if (!url) return fail('PUBLIC_BASE_URL is not set');
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return fail('PUBLIC_BASE_URL points to localhost');
  }
  if (!url.startsWith('https://')) return warn('PUBLIC_BASE_URL should use HTTPS');
  return pass('PUBLIC_BASE_URL is configured');
}

function checkLogConfig() {
  const level = getEnv('LOG_LEVEL').toLowerCase();
  if (!level) return warn('LOG_LEVEL not set; defaulting to info');
  if (['debug', 'trace'].includes(level)) return warn(`LOG_LEVEL ${level} is verbose for production`);
  const pretty = getEnv('LOG_PRETTY').toLowerCase();
  if (pretty === 'true') return fail('LOG_PRETTY must be false in production');
  return pass('Logging configuration is production-ready');
}

const SUPPORTED_PAYMENT_PROVIDERS = ['MOCK', 'FLUTTERWAVE', 'PAYTOTA'];

function checkPaymentProvider() {
  const provider = (getEnv('PAYMENT_PROVIDER') || 'MOCK').toUpperCase();

  if (!SUPPORTED_PAYMENT_PROVIDERS.includes(provider)) {
    return fail(
      `PAYMENT_PROVIDER '${provider}' is not supported (expected one of ${SUPPORTED_PAYMENT_PROVIDERS.join(', ')})`,
    );
  }

  if (provider === 'MOCK') return warn('PAYMENT_PROVIDER is MOCK; configure a real provider for production');

  if (provider === 'FLUTTERWAVE') {
    if (!getEnv('FLUTTERWAVE_SECRET_KEY')) return fail('FLUTTERWAVE_SECRET_KEY is missing');
    if (!getEnv('FLUTTERWAVE_WEBHOOK_SECRET')) return fail('FLUTTERWAVE_WEBHOOK_SECRET is missing');
    return pass(`Payment provider ${provider} is configured`);
  }

  if (provider === 'PAYTOTA') {
    if (!getEnv('PAYTOTA_WEBHOOK_PUBLIC_KEY')) return fail('PAYTOTA_WEBHOOK_PUBLIC_KEY is missing');
    return pass(`Payment provider ${provider} is configured`);
  }

  return pass(`Payment provider ${provider} is configured`);
}

function checkInfrastructure() {
  if (getEnv('REDIS_DISABLED').toLowerCase() === 'true') {
    return fail('REDIS_DISABLED is true; production requires Redis');
  }
  if (!getEnv('REDIS_URL') && !getEnv('REDIS_HOST')) {
    return fail('Redis connection (REDIS_URL or REDIS_HOST) is not configured');
  }
  if (getEnv('KAFKA_DISABLED').toLowerCase() === 'true') {
    return warn('KAFKA_DISABLED is true; domain events will use database fallback only');
  }
  return pass('Infrastructure dependencies are configured');
}

async function checkDatabaseMigrations() {
  const url = getEnv('DATABASE_URL');
  if (!url) return;
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    pass('Database is reachable');
    const result = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migrations') AS has_migrations",
    );
    if (!result.rows[0].has_migrations) {
      return fail('TypeORM migrations table not found; run migrations before deploying');
    }
    const migrations = await client.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 5');
    if (!migrations.rowCount) return fail('No migrations have been executed');
    pass(`Latest migration: ${migrations.rows[0].name}`);
  } catch (error) {
    fail(`Database check failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkHealthEndpoint() {
  const baseUrl = getEnv('PUBLIC_BASE_URL');
  if (!baseUrl) return;
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/health/live`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (response.status !== 200) return fail(`Health endpoint returned ${response.status}`);
    pass(`Health endpoint is reachable (${url})`);
  } catch (error) {
    warn(`Health endpoint not reachable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function run() {
  if (!isProduction()) {
    warn('NODE_ENV is not production/staging; some production-only checks are still enforced');
  }

  checkRequiredSecret('JWT_SECRET');
  checkRequiredSecret('INTEGRATION_ENCRYPTION_KEY');
  checkRequiredSecret('FILE_SIGNATURE_SECRET');
  checkDatabaseUrl();
  checkBoolean('DB_MIGRATIONS_RUN', true);
  checkBoolean('DB_SYNCHRONIZE', false);
  checkCors();
  checkPublicBaseUrl();
  checkLogConfig();
  checkPaymentProvider();
  checkInfrastructure();
  await checkDatabaseMigrations();
  await checkHealthEndpoint();

  // eslint-disable-next-line no-console
  console.log('\nProduction readiness report');
  // eslint-disable-next-line no-console
  console.log('===========================\n');
  for (const check of checks) {
    const icon = check.status === 'PASS' ? '✅' : check.status === 'WARN' ? '⚠️' : '❌';
    // eslint-disable-next-line no-console
    console.log(`${icon} [${check.status}] ${check.message}`);
  }

  const failures = checks.filter((c) => c.status === 'FAIL').length;
  const warnings = checks.filter((c) => c.status === 'WARN').length;
  // eslint-disable-next-line no-console
  console.log(`\n${checks.length} checks: ${failures} failures, ${warnings} warnings`);
  process.exit(failures > 0 ? 1 : 0);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Production readiness check crashed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
