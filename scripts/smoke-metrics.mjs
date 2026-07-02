import { buildApp, startApp, waitForReady, shutdown, sleep } from './smoke-utils.mjs';

const port = 13011;
const metricsPort = 19090;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;
const metricsUrl = `http://127.0.0.1:${metricsPort}/metrics`;

async function waitForMetrics(attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(metricsUrl);
      if (response.status === 200) return response.text();
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error('Metrics endpoint did not become ready in time');
}

async function run() {
  buildApp();
  const child = startApp(port, {
    SEED_DEMO: 'false',
    METRICS_ENABLED: 'true',
    METRICS_PORT: String(metricsPort),
  });
  let passed = false;

  try {
    await waitForReady(baseUrl);

    const metrics = await waitForMetrics();
    if (!metrics.includes('evzone_')) {
      throw new Error('Metrics output does not include evzone custom metrics');
    }
    if (!metrics.includes('nodejs_')) {
      throw new Error('Metrics output does not include nodejs default metrics');
    }

    passed = true;
    // eslint-disable-next-line no-console
    console.log('✅ Metrics smoke test passed');
  } finally {
    await shutdown(child);
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ Metrics smoke test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
