import { buildApp, startApp, waitForReady, shutdown } from './smoke-utils.mjs';

const allowedOrigin = 'https://app.evzone.example';
const rejectedOrigin = 'https://unauthorized.example';
const port = 13001;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;

async function request(origin) {
  const response = await fetch(`${baseUrl}/health`, {
    method: 'GET',
    headers: { Origin: origin },
  });
  return {
    status: response.status,
    accessControlAllowOrigin: response.headers.get('access-control-allow-origin'),
  };
}

async function run() {
  buildApp();
  const child = startApp(port, {
    SEED_DEMO: 'false',
    CORS_ORIGINS: allowedOrigin,
    SOCKET_CORS_ORIGINS: allowedOrigin,
  });
  let passed = false;

  try {
    await waitForReady(baseUrl);

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
    await shutdown(child);
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ CORS smoke test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
