import { buildApp, startApp, waitForReady, shutdown } from './smoke-utils.mjs';

const port = 13010;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;

async function run() {
  buildApp();
  const child = startApp(port, {
    SEED_DEMO: 'false',
    OTEL_ENABLED: 'true',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
    OTEL_LOG_LEVEL: 'NONE',
    METRICS_ENABLED: 'false',
  });
  let passed = false;

  try {
    await waitForReady(baseUrl);

    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const response = await fetch(`${baseUrl}/health/live`, {
      headers: { traceparent },
    });
    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }

    const body = await response.json();
    if (body.status !== 'ok') {
      throw new Error(`Expected status ok, got ${body.status}`);
    }

    passed = true;
    // eslint-disable-next-line no-console
    console.log('✅ Tracing smoke test passed');
  } finally {
    await shutdown(child);
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ Tracing smoke test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
