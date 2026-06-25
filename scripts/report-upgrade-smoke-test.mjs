const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';

async function request(path, options = {}, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function login(identifier) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password: 'Password123!' }),
  });
}

const [admin, driver, rider] = await Promise.all([
  login('admin@evzone.local'),
  login('driver@evzone.local'),
  login('rider@evzone.local'),
]);

const [infrastructure, storage, trialBalance, readiness, matchingJobs] = await Promise.all([
  request('/infrastructure/status', {}, admin.accessToken),
  request('/files/storage/status', {}, rider.accessToken),
  request('/accounting/trial-balance', {}, admin.accessToken),
  request('/drivers/me/readiness', {}, driver.accessToken),
  request('/matching/jobs?limit=5', {}, admin.accessToken),
]);

const deviceToken = `report-upgrade-smoke-${Date.now()}`;
const device = await request(
  '/notifications/devices',
  {
    method: 'POST',
    body: JSON.stringify({
      token: deviceToken,
      platform: 'WEB',
      provider: 'LOCAL',
      deviceId: deviceToken,
      metadata: { source: 'v4-smoke' },
    }),
  },
  rider.accessToken,
);
const devices = await request('/notifications/devices', {}, rider.accessToken);
await request(`/notifications/devices/${device.id}`, { method: 'DELETE' }, rider.accessToken);

const forgotPassword = await request('/auth/forgot-password', {
  method: 'POST',
  body: JSON.stringify({ identifier: 'rider@evzone.local' }),
});
const outbox = await request('/infrastructure/domain-events?limit=5', {}, admin.accessToken);

if (!trialBalance.balanced) throw new Error('Double-entry trial balance is not balanced');
if (!devices.some((item) => item.id === device.id))
  throw new Error('Push device registration was not persisted');

console.log(
  JSON.stringify(
    {
      redisFallback: infrastructure.redis.fallback,
      eventStreaming: infrastructure.eventStreaming,
      storageProvider: storage.primaryProvider,
      doubleEntryBalanced: trialBalance.balanced,
      driverReady: readiness.canGoOnline,
      matchingJobsObserved: matchingJobs.length,
      pushDeviceRegistered: true,
      passwordRecoveryAccepted: forgotPassword.sent,
      outboxEventsObserved: outbox.length,
    },
    null,
    2,
  ),
);
