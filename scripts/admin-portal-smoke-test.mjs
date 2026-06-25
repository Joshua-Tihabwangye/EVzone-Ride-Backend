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

const [session, overview, riders, roles, services, finance, operations, compatibility] = await Promise.all([
  request('/auth/session', {}, token),
  request('/admin/system/overview', {}, token),
  request('/admin/riders', {}, token),
  request('/admin/roles', {}, token),
  request('/admin/services', {}, token),
  request('/admin/analytics/finance?period=month', {}, token),
  request('/admin/analytics/operations?period=month', {}, token),
  request('/compat/contracts'),
]);

expect(session, 'Admin session is missing');
expect(Array.isArray(riders), 'Admin riders response is invalid');
expect(Array.isArray(roles), 'Admin roles response is invalid');
expect(Array.isArray(services), 'Admin services response is invalid');
expect(compatibility.version === '9.0.0', 'Compatibility contract is not version 9.0.0');

const suffix = Date.now().toString(36).toUpperCase();
const created = await request(
  '/admin/riders',
  {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Admin',
      lastName: 'Smoke',
      email: `admin.smoke.${suffix.toLowerCase()}@example.test`,
      phone: `+25670${String(Date.now()).slice(-7)}`,
    }),
  },
  token,
);
const rider = await request(`/admin/riders/${created.userId}`, {}, token);
const patched = await request(
  `/admin/riders/${created.userId}`,
  { method: 'PATCH', body: JSON.stringify({ firstName: 'Validated' }) },
  token,
);
expect(rider.id === created.userId, 'Created rider could not be read');
expect(patched.firstName === 'Validated', 'Rider update did not persist');

const roleCreated = await request(
  '/admin/roles',
  {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Role ${suffix}`,
      description: 'Admin Portal regression validation in v9',
      permissions: ['users.read'],
    }),
  },
  token,
);
const role = await request(`/admin/roles/${roleCreated.roleId}`, {}, token);
expect(role.name.includes('Smoke Role'), 'Admin role creation failed');

const zone = await request(
  '/admin/pricing-zones',
  {
    method: 'POST',
    body: JSON.stringify({
      name: `Kampala Smoke ${suffix}`,
      city: 'Kampala',
      country: 'UG',
      currency: 'UGX',
      status: 'active',
      boundaries: { type: 'Polygon', coordinates: [] },
      services: ['ride'],
    }),
  },
  token,
);
expect(zone.id, 'Admin pricing-zone creation failed');

const [profile, settings] = await Promise.all([
  request('/admins/me/profile', {}, token),
  request('/admins/me/settings', {}, token),
]);

console.log(
  JSON.stringify(
    {
      version: '9.0.0',
      adminUser: profile.email ?? profile.id,
      counts: { riders: riders.length, roles: roles.length, services: services.length },
      created: { riderId: created.userId, roleId: roleCreated.roleId, zoneId: zone.id },
      analytics: { finance, operations },
      systemOverview: Boolean(overview),
      settings: Boolean(settings),
    },
    null,
    2,
  ),
);
