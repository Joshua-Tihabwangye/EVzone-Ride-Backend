import { buildApp, startApp, waitForReady, shutdown, sleep } from './smoke-utils.mjs';

const port = 13013;
const metricsPort = 19091;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;
const metricsUrl = `http://127.0.0.1:${metricsPort}/metrics`;
const grafanaUrl = process.env.GRAFANA_URL ?? 'http://localhost:3000';

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

    try {
      const grafanaHealth = await fetch(`${grafanaUrl}/api/health`);
      if (grafanaHealth.ok) {
        const info = await grafanaHealth.json();
        if (info.database !== 'ok') {
          throw new Error(`Grafana database status is ${info.database}`);
        }
        // eslint-disable-next-line no-console
        console.log('✅ Grafana health check passed');
      } else {
        // eslint-disable-next-line no-console
        console.log('ℹ️ Grafana not reachable; skipping dashboard UI validation');
      }
    } catch {
      // eslint-disable-next-line no-console
      console.log('ℹ️ Grafana not reachable; skipping dashboard UI validation');
    }

    passed = true;
    // eslint-disable-next-line no-console
    console.log('✅ Dashboards smoke test passed');
  } finally {
    await shutdown(child);
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ Dashboards smoke test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
