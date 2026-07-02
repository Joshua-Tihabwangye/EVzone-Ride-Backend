const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';

async function request(path, options = {}, token, organizationId) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(organizationId ? { 'x-organization-id': organizationId } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok || body?.success === false) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    identifier: 'fleet.partner@evzone.local',
    password: 'Password123!',
  }),
});
const token = login.accessToken;
expect(token, 'Fleet Partner login did not return an access token');

const profile = await request('/fleet/me/profile', {}, token);
expect(profile.fleetId && profile.organizationId, 'Fleet profile is incomplete');
const organizationId = profile.organizationId;
const suffix = Date.now().toString(36).toUpperCase();

const driver = await request(
  '/fleet/drivers',
  {
    method: 'POST',
    body: JSON.stringify({
      displayName: `Readiness Driver ${suffix}`,
      email: `fleet.readiness.${suffix.toLowerCase()}@evzone.local`,
      phone: `+25679${String(Date.now()).slice(-7)}`,
      status: 'ACTIVE',
      serviceCapabilities: ['RIDE'],
    }),
  },
  token,
  organizationId,
);
expect(driver.id, 'Fleet driver creation failed');

const [earningsDetailed, complianceScore, performanceMetrics] = await Promise.all([
  request('/fleet/earnings/detailed', {}, token, organizationId),
  request('/fleet/compliance/score', {}, token, organizationId),
  request('/fleet/performance/metrics', {}, token, organizationId),
]);

expect(Array.isArray(earningsDetailed), 'Earnings detailed response is invalid');
expect(typeof complianceScore.score === 'number', 'Compliance score response is invalid');
expect(typeof performanceMetrics.totals?.completed === 'number', 'Performance metrics response is invalid');

const payoutRequest = await request(
  '/fleet/earnings/payout-requests',
  {
    method: 'POST',
    body: JSON.stringify({
      driverId: driver.id,
      amount: 1000,
      currency: 'UGX',
      reason: 'Smoke test fleet payout request',
      method: { phone: driver.phone ?? '+256700000001' },
    }),
  },
  token,
  organizationId,
);
expect(payoutRequest.id, 'Fleet payout request failed');
expect(payoutRequest.status === 'PENDING', 'Fleet payout request did not start as PENDING');

await request(`/fleet/drivers/${driver.id}`, { method: 'DELETE' }, token, organizationId);

console.log(
  JSON.stringify(
    {
      version: '10.0.0',
      fleet: { id: profile.fleetId, organizationId },
      readiness: {
        earningsStatements: earningsDetailed.length,
        complianceScore: complianceScore.score,
        completedTrips: performanceMetrics.totals.completed,
        payoutRequestId: payoutRequest.id,
      },
    },
    null,
    2,
  ),
);
