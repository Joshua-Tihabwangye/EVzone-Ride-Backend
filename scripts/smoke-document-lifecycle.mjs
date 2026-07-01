import { buildApp, startApp, waitForReady, request, post, shutdown } from './smoke-utils.mjs';

const port = 13004;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;

function pngBuffer() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
}

async function run() {
  buildApp();
  const child = startApp(port, {
    FILE_SCAN_PROVIDER: 'NONE',
    PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
  });
  let passed = false;

  try {
    await waitForReady(baseUrl);

    const login = await post(baseUrl, '/auth/login', {
      identifier: 'admin@evzone.local',
      password: 'Password123!',
    });
    const token = login.accessToken;

    const idempotencyKey = `smoke-doc-${Date.now()}`;
    const form = new FormData();
    form.append('file', new Blob([pngBuffer()], { type: 'image/png' }), 'smoke-test.png');

    const upload = await request(baseUrl, '/files/upload', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': idempotencyKey,
      },
      body: form,
    });

    if (upload.status !== 'CLEAN') {
      throw new Error(`Expected uploaded file status CLEAN, got ${upload.status}`);
    }
    if (!upload.downloadUrl) {
      throw new Error('Upload response did not include a downloadUrl');
    }

    const downloadResponse = await fetch(upload.downloadUrl, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!downloadResponse.ok) {
      throw new Error(`Download failed with status ${downloadResponse.status}`);
    }

    passed = true;
    // eslint-disable-next-line no-console
    console.log('✅ Document lifecycle smoke test passed');
  } finally {
    await shutdown(child);
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Document lifecycle smoke test failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
