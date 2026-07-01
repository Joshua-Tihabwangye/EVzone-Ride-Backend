import { openSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, startApp, waitForReady, shutdown, sleep } from './smoke-utils.mjs';

const port = 13003;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;

async function run() {
  const logFile = join(tmpdir(), `evzone-smoke-logging-${Date.now()}.log`);
  const outFd = openSync(logFile, 'w');

  buildApp();
  const child = startApp(port, { SEED_DEMO: 'false' }, ['ignore', outFd, outFd]);
  let passed = false;

  try {
    await waitForReady(baseUrl);

    const requestId = `smoke-log-${Date.now()}`;
    await fetch(`${baseUrl}/`, {
      headers: {
        'x-request-id': requestId,
        authorization: 'Bearer secret-token-that-must-be-redacted',
      },
    });

    // Allow pino to flush the request log to disk.
    await sleep(1500);

    const logLines = readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(Boolean);

    const requestLog = logLines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .find(
        (log) =>
          log &&
          log.req?.method === 'GET' &&
          log.req?.url === '/api/v1/' &&
          log.requestId === requestId,
      );

    if (!requestLog) {
      throw new Error('Did not find a JSON request log for the smoke request');
    }

    if (requestLog.req?.headers?.authorization !== '[Redacted]') {
      throw new Error(
        `Authorization header was not redacted in logs: ${JSON.stringify(requestLog.req?.headers)}`,
      );
    }

    passed = true;
    // eslint-disable-next-line no-console
    console.log('✅ Logging smoke test passed');
  } finally {
    await shutdown(child);
    try {
      unlinkSync(logFile);
    } catch {
      // ignore cleanup errors
    }
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ Logging smoke test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
