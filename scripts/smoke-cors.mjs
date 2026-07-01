import { spawn, spawnSync } from 'node:child_process';

const allowedOrigin = 'https://app.evzone.example';
const rejectedOrigin = 'https://unauthorized.example';
const port = 13001;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(origin) {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
    method: 'GET',
    headers: { Origin: origin },
  });
  return {
    status: response.status,
    accessControlAllowOrigin: response.headers.get('access-control-allow-origin'),
  };
}

async function waitForReady(attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.status === 200) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error('App did not become ready in time');
}

function buildApp() {
  const result = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function startApp() {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    HOST: '127.0.0.1',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://evzone:evzone@localhost:5432/evzone',
    DB_SYNCHRONIZE: 'false',
    DB_MIGRATIONS_RUN: 'true',
    DB_LOGGING: 'false',
    CORS_ORIGINS: allowedOrigin,
    SOCKET_CORS_ORIGINS: allowedOrigin,
    JWT_SECRET: 'smoke-test-jwt-secret-with-more-than-32-characters',
    INTEGRATION_ENCRYPTION_KEY: 'smoke-test-integration-key-with-more-than-32-characters',
    REDIS_DISABLED: 'true',
    KAFKA_DISABLED: 'true',
  };

  return spawn(process.execPath, ['dist/main.js'], {
    stdio: 'inherit',
    env,
  });
}

async function run() {
  buildApp();
  const child = startApp();
  let passed = false;

  try {
    await waitForReady();

    const allowed = await request(allowedOrigin);
    if (allowed.status !== 200) {
      throw new Error(`Expected 200 from allowed origin, got ${allowed.status}`);
    }
    if (allowed.accessControlAllowOrigin !== allowedOrigin) {
      throw new Error(
        `Expected Access-Control-Allow-Origin ${allowedOrigin}, got ${allowed.accessControlAllowOrigin}`,
      );
    }

    const rejected = await request(rejectedOrigin);
    if (rejected.accessControlAllowOrigin) {
      throw new Error(
        `Expected no Access-Control-Allow-Origin for rejected origin, got ${rejected.accessControlAllowOrigin}`,
      );
    }

    passed = true;
    // eslint-disable-next-line no-console
    console.log('✅ CORS smoke test passed');
  } finally {
    child.kill('SIGTERM');
    await sleep(500);
    if (!child.killed) child.kill('SIGKILL');
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ CORS smoke test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
