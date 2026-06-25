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
  return { data: body.data, requestId: body.requestId, status: response.status };
}

async function login(identifier) {
  return (
    await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password: 'Password123!' }),
    })
  ).data;
}

const [admin, rider] = await Promise.all([login('admin@evzone.local'), login('rider@evzone.local')]);
const contracts = await request('/compat/contracts');
const compatHealth = await request('/compat/health');
const geofence = await request('/geo/geofence/check', {
  method: 'POST',
  body: JSON.stringify({
    point: { latitude: 0.32, longitude: 32.58 },
    polygon: [
      { latitude: 0.2, longitude: 32.4 },
      { latitude: 0.5, longitude: 32.4 },
      { latitude: 0.5, longitude: 32.8 },
      { latitude: 0.2, longitude: 32.8 },
    ],
  }),
});

const suffix = Date.now().toString(36);
const idempotencyKey = `hardening-smoke-${suffix}`;
const flagPayload = {
  key: 'v3_hardening_smoke',
  scope: 'GLOBAL',
  enabled: true,
  description: 'Automated version 3 hardening smoke test',
};
const firstFlag = await request(
  '/governance/feature-flags',
  {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(flagPayload),
  },
  admin.accessToken,
);
const replayFlag = await request(
  '/governance/feature-flags',
  {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(flagPayload),
  },
  admin.accessToken,
);
if (firstFlag.data.id !== replayFlag.data.id) {
  throw new Error('Idempotency replay did not return the original record');
}

const paymentMethod = await request(
  '/payment-methods',
  {
    method: 'POST',
    body: JSON.stringify({
      type: 'MOBILE_MONEY',
      label: `Smoke ${suffix}`,
      provider: 'MTN_MOMO',
      token: `provider-token-${suffix}`,
      maskedValue: '+256***1234',
    }),
  },
  rider.accessToken,
);
const tokenReturned = Object.hasOwn(paymentMethod.data, 'providerToken') || Object.hasOwn(paymentMethod.data, 'token');
if (tokenReturned) throw new Error('Stored provider token was returned by the API');

const commute = await request(
  '/commutes',
  {
    method: 'POST',
    body: JSON.stringify({
      name: `Archive validation ${suffix}`,
      pickup: { address: 'Kampala Central', latitude: 0.315, longitude: 32.58 },
      dropoff: { address: 'Entebbe Airport', latitude: 0.0424, longitude: 32.4435 },
      schedule: { days: ['MONDAY'], time: '08:00' },
      active: true,
    }),
  },
  rider.accessToken,
);
const onboarding = await request(
  '/onboarding/applications',
  {
    method: 'POST',
    body: JSON.stringify({
      applicationType: 'AGENT_DISPATCHER',
      profileData: { source: 'hardening-smoke' },
    }),
  },
  rider.accessToken,
);
const watchdog = await request('/operations/watchdog/run', { method: 'POST', body: '{}' }, admin.accessToken);

console.log(
  JSON.stringify(
    {
      contractsVersion: contracts.data.version,
      contractApps: Object.keys(contracts.data.apps),
      requestTracing: Boolean(compatHealth.requestId && compatHealth.data.requestId),
      geofenceInside: geofence.data.inside,
      idempotencyReplayId: replayFlag.data.id,
      storedPaymentMethodId: paymentMethod.data.id,
      commuteId: commute.data.id,
      onboardingApplicationId: onboarding.data.application?.id ?? onboarding.data.id,
      watchdogRanAt: watchdog.data.ranAt,
    },
    null,
    2,
  ),
);
