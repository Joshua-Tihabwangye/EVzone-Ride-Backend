import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';

let dataSourcePromise;

async function getDataSource() {
  if (dataSourcePromise) return dataSourcePromise;
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line no-console
  console.log('[smoke] initializing TypeORM data source...');
  const mod = require('../dist/database/data-source.js');
  const ds = mod.default ?? mod;
  dataSourcePromise = ds.initialize().then(() => ds);
  return dataSourcePromise;
}

export async function closeDataSource() {
  if (dataSourcePromise) {
    const ds = await dataSourcePromise;
    if (ds.isInitialized) await ds.destroy();
    dataSourcePromise = undefined;
  }
}

export async function ensureDriverReady(
  email,
  databaseUrl = process.env.DATABASE_URL ?? 'postgresql://evzone:evzone@localhost:5432/evzone',
) {
  process.env.DATABASE_URL = databaseUrl;
  const ds = await getDataSource();
  const userRepo = ds.getRepository('User');
  const driverRepo = ds.getRepository('DriverProfile');
  const driverDocRepo = ds.getRepository('DriverDocument');
  const vehicleDocRepo = ds.getRepository('VehicleDocument');

  const user = await userRepo.findOne({ where: { email } });
  if (!user) throw new Error(`Demo driver ${email} not found`);

  const driver = await driverRepo.findOne({ where: { userId: user.id } });
  if (!driver) throw new Error(`Driver profile for ${email} not found`);

  const requiredDriverDocs = ['NATIONAL_ID', 'DRIVING_LICENSE_FRONT'];
  for (const type of requiredDriverDocs) {
    const exists = await driverDocRepo.findOne({ where: { driverId: driver.id, type } });
    if (!exists) {
      await driverDocRepo.save(
        driverDocRepo.create({
          driverId: driver.id,
          type,
          status: 'VERIFIED',
          fileUrl: 'https://evzone.local/smoke-doc.png',
        }),
      );
    }
  }

  if (driver.currentVehicleId) {
    const requiredVehicleDocs = ['VEHICLE_INSURANCE', 'VEHICLE_INSPECTION'];
    for (const type of requiredVehicleDocs) {
      const exists = await vehicleDocRepo.findOne({
        where: { vehicleId: driver.currentVehicleId, type },
      });
      if (!exists) {
        await vehicleDocRepo.save(
          vehicleDocRepo.create({
            vehicleId: driver.currentVehicleId,
            type,
            status: 'VERIFIED',
            fileUrl: 'https://evzone.local/smoke-doc.png',
          }),
        );
      }
    }
  }

  driver.availabilityStatus = 'ONLINE';
  driver.lastLatitude = 0.315;
  driver.lastLongitude = 32.58;
  driver.lastLocationAt = new Date();
  await driverRepo.save(driver);

  return { user, driver };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildApp() {
  if (process.env.SMOKE_SKIP_BUILD === 'true') return;
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function startApp(port, extraEnv = {}, stdio = 'inherit') {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    HOST: '127.0.0.1',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://evzone:evzone@localhost:5432/evzone',
    DB_SYNCHRONIZE: 'false',
    DB_MIGRATIONS_RUN: 'true',
    DB_LOGGING: 'false',
    SEED_DEMO: extraEnv.SEED_DEMO ?? 'true',
    CORS_ORIGINS: extraEnv.CORS_ORIGINS ?? '*',
    SOCKET_CORS_ORIGINS: extraEnv.SOCKET_CORS_ORIGINS ?? '*',
    JWT_SECRET: 'smoke-test-jwt-secret-with-more-than-32-characters',
    INTEGRATION_ENCRYPTION_KEY: 'smoke-test-integration-key-with-more-than-32-characters',
    FILE_SIGNATURE_SECRET: 'smoke-test-file-signature-secret-min-32-bytes',
    REDIS_DISABLED: 'true',
    KAFKA_DISABLED: 'true',
    LOG_LEVEL: 'info',
    LOG_PRETTY: 'false',
    ...extraEnv,
  };

  return spawn(process.execPath, ['dist/main.js'], {
    stdio,
    env,
  });
}

export async function waitForReady(baseUrl, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/health/live`);
      if (response.status === 200) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error('App did not become ready in time');
}

export async function request(baseUrl, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const body = options.body;

  if (body !== undefined && typeof body === 'string' && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!response.ok || json.success === false) {
    throw new Error(
      `${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(json)}`,
    );
  }

  return json.data;
}

export async function patch(baseUrl, path, body, token, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  return request(baseUrl, path, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

export async function post(baseUrl, path, body, token, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  return request(baseUrl, path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

export async function get(baseUrl, path, token, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  return request(baseUrl, path, { headers });
}

export async function shutdown(child) {
  child.kill('SIGTERM');
  await sleep(500);
  if (!child.killed) child.kill('SIGKILL');
}

export function hmacSha256(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function sha256Hex(payload) {
  return createHash('sha256').update(payload).digest('hex');
}
