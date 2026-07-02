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
  body: JSON.stringify({ identifier: 'driver@evzone.local', password: 'Password123!' }),
});
const token = login.accessToken;

const online = await request('/universal-dispatch/drivers/me/online', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: JSON.stringify({
    marketId: 'default',
    requestedServices: ['STANDARD_RIDE'],
    location: { latitude: 0.3476, longitude: 32.5825, accuracyMeters: 10 },
  }),
});

const location = await request('/universal-dispatch/drivers/me/location', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: JSON.stringify({ latitude: 0.348, longitude: 32.583, accuracyMeters: 10 }),
});

const offline = await request('/universal-dispatch/drivers/me/offline', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: JSON.stringify({}),
});

console.log(
  JSON.stringify(
    {
      health: health.status,
      driver: login.user.email,
      unitStatusOnline: online.status,
      locationUpdated: location.id === online.id,
      unitStatusOffline: offline.status,
    },
    null,
    2,
  ),
);
