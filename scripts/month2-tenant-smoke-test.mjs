const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function login(email) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: email, password: 'Password123!' }),
  });
}

const health = await request('/health');
const rider = await login('rider@evzone.local');
const admin = await login('admin@evzone.local');

const organization = await request('/organizations', {
  method: 'POST',
  headers: { authorization: `Bearer ${rider.accessToken}` },
  body: JSON.stringify({
    name: `Smoke Tenant ${Date.now()}`,
    type: 'FLEET_PARTNER',
  }),
});

const mine = await request('/organizations/mine', {
  headers: { authorization: `Bearer ${rider.accessToken}` },
});

const reviewed = await request(`/organizations/admin/${organization.id}/review`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${admin.accessToken}` },
  body: JSON.stringify({ status: 'ACTIVE', reason: 'Smoke test approval' }),
});

const auditLogs = await request('/admin/audit-logs?entityType=Organization', {
  headers: { authorization: `Bearer ${admin.accessToken}` },
});

console.log(
  JSON.stringify(
    {
      health: health.status,
      organizationId: organization.id,
      myOrganizations: mine.length,
      reviewedStatus: reviewed.status,
      organizationAuditEntries: auditLogs.meta.total,
    },
    null,
    2,
  ),
);
