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

const health = await request('/health');
const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ identifier: 'admin@evzone.local', password: 'Password123!' }),
});
const token = login.accessToken;

const flags = await request('/governance/flags', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: JSON.stringify({ key: `smoke-flag-${Date.now()}`, enabled: true }),
});

const logs = await request('/admin/audit-logs?action=FEATURE_FLAG_CREATED', {
  headers: { authorization: `Bearer ${token}` },
});

const latest = logs.items[0];
if (!latest) throw new Error('No audit log entry found');

const verified = await request(`/admin/audit-logs/${latest.id}/verify`, {
  headers: { authorization: `Bearer ${token}` },
});

console.log(
  JSON.stringify(
    {
      health: health.status,
      adminUser: login.user.email,
      createdFlag: flags.key,
      auditLogsFound: logs.meta.total,
      latestAuditLogId: latest.id,
      checksumValid: verified.valid,
    },
    null,
    2,
  ),
);
