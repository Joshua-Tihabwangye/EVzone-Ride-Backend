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
  body: JSON.stringify({ identifier: 'admin@evzone.local', password: 'Password123!' }),
});
expect(login.accessToken, 'Admin login did not return an access token');
const token = login.accessToken;

const suffix = Date.now().toString(36).toUpperCase();
const partner = await request(
  '/admin/partners',
  {
    method: 'POST',
    body: JSON.stringify({ code: `SMOKE-${suffix}`, name: `Smoke Partner ${suffix}`, type: 'CORPORATEPAY' }),
  },
  token,
);
expect(partner.id, 'Partner creation failed');
expect(partner.status === 'ACTIVE', 'Partner should be active');

const list = await request('/admin/partners', {}, token);
expect(Array.isArray(list.items), 'Partner list response is invalid');

const rotated = await request(`/admin/partners/${partner.id}/rotate-key`, {
  method: 'POST',
  body: JSON.stringify({ scopes: ['profile:read', 'webhooks:write', 'actions:write', 'events:write'] }),
}, token);
expect(rotated.rawKey, 'API key rotation did not return a raw key');
const apiKey = rotated.rawKey;

const profile = await request('/partner/v1/profile', {
  headers: { 'x-partner-api-key': apiKey },
});
expect(profile.id === partner.id, 'Partner profile lookup failed');

const webhook = await request(
  '/partner/v1/webhooks',
  {
    method: 'POST',
    body: JSON.stringify({ eventTypes: ['service_request.created'], url: 'https://example.com/webhook' }),
    headers: { 'x-partner-api-key': apiKey },
  },
);
expect(webhook.id, 'Webhook subscription creation failed');

const webhooks = await request('/partner/v1/webhooks', {
  headers: { 'x-partner-api-key': apiKey },
});
expect(Array.isArray(webhooks.items), 'Webhook list response is invalid');
expect(webhooks.items.length >= 1, 'Webhook list should contain the created subscription');

const capabilities = await request('/partner/v1/actions/capabilities', {
  method: 'POST',
  body: JSON.stringify({ payload: {} }),
  headers: { 'x-partner-api-key': apiKey },
});
expect(capabilities && typeof capabilities === 'object', 'Adapter action response is invalid');

const usage = await request('/partner/v1/usage', {
  headers: { 'x-partner-api-key': apiKey },
});
expect(Array.isArray(usage.items), 'Usage response is invalid');

console.log(
  JSON.stringify(
    {
      version: '10.0.0',
      partner: { id: partner.id, code: partner.code },
      webhooks: webhooks.items.length,
      adapterAction: Object.keys(capabilities ?? {}),
    },
    null,
    2,
  ),
);
