import { buildApp, startApp, waitForReady, shutdown, post, get } from './smoke-utils.mjs';

const port = 13012;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  buildApp();
  const child = startApp(port, { SEED_DEMO: 'true' });
  let passed = false;

  try {
    await waitForReady(baseUrl);

    const login = await post(baseUrl, '/auth/login', {
      identifier: 'admin@evzone.local',
      password: 'Password123!',
    });
    expect(login.accessToken, 'Admin login did not return an access token');
    const token = login.accessToken;

    const dashboard = await get(baseUrl, '/operations/control-center', token);
    expect(dashboard && typeof dashboard === 'object', 'Control center dashboard is invalid');

    const health = await get(baseUrl, '/operations/control-center/health', token);
    expect(health && typeof health === 'object', 'Control center health is invalid');

    const alerts = await get(baseUrl, '/operations/control-center/alerts', token);
    expect(typeof alerts === 'object', 'Control center alerts is invalid');

    const workers = await get(baseUrl, '/operations/control-center/workers', token);
    expect(typeof workers === 'object', 'Control center workers is invalid');

    const slos = await get(baseUrl, '/operations/slos', token);
    expect(Array.isArray(slos), 'SLOs response is invalid');

    passed = true;
    // eslint-disable-next-line no-console
    console.log('✅ Operations smoke test passed');
  } finally {
    await shutdown(child);
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ Operations smoke test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
