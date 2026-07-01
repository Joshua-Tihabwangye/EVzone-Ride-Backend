#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { buildApp, sleep } from './smoke-utils.mjs';

const smokeScripts = [
  'scripts/smoke-health.mjs',
  'scripts/smoke-logging.mjs',
  'scripts/smoke-cors.mjs',
  'scripts/smoke-document-lifecycle.mjs',
  'scripts/smoke-ride-to-offer.mjs',
  'scripts/smoke-payment-webhook-to-ledger.mjs',
];

async function runScript(script) {
  // eslint-disable-next-line no-console
  console.log(`\n▶ ${script}`);
  const child = spawn(process.execPath, [script], {
    stdio: 'inherit',
    env: { ...process.env, SMOKE_SKIP_BUILD: 'true' },
  });
  return new Promise((resolve) => {
    child.on('close', (code) => resolve(code));
  });
}

async function run() {
  buildApp();
  let failed = false;
  for (const script of smokeScripts) {
    const code = await runScript(script);
    if (code !== 0) {
      failed = true;
      // eslint-disable-next-line no-console
      console.error(`❌ ${script} failed with exit code ${code}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`✅ ${script} passed`);
    }
    await sleep(1000);
  }
  if (failed) {
    // eslint-disable-next-line no-console
    console.error('\n❌ Smoke suite failed');
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('\n✅ Smoke suite passed');
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Smoke suite crashed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
