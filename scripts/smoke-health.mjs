import { buildApp, startApp, waitForReady, request, shutdown } from './smoke-utils.mjs';

const port = 13002;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;

async function run() {
  buildApp();
  const child = startApp(port, { SEED_DEMO: 'false' });
  let passed = false;

  try {
    await waitForReady(baseUrl);

    const live = await request(baseUrl, '/health/live');
    if (live.status !== 'ok') {
      throw new Error(`Expected live status ok, got ${live.status}`);
    }

    const ready = await request(baseUrl, '/health/ready');
    if (ready.status !== 'ok') {
      throw new Error(`Expected ready status ok, got ${ready.status}`);
    }
    const requiredDependencies = ['database', 'migrations', 'redis', 'kafka', 'storage'];
    for (const key of requiredDependencies) {
      if (!(key in ready.info)) {
        throw new Error(`Missing dependency in ready response: ${key}`);
      }
    }

    const dependencies = await request(baseUrl, '/health/dependencies');
    if (dependencies.status !== 'ok') {
      throw new Error(`Expected dependencies status ok, got ${dependencies.status}`);
    }

    const workersResponse = await fetch(`${baseUrl}/health/workers`);
    if (workersResponse.status !== 503) {
      throw new Error(`Expected workers status 503 when stale, got ${workersResponse.status}`);
    }

    passed = true;
    // eslint-disable-next-line no-console
    console.log('✅ Health smoke test passed');
  } finally {
    await shutdown(child);
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ Health smoke test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
