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
  body: JSON.stringify({ identifier: 'rider@evzone.local', password: 'Password123!' }),
});
const token = login.accessToken;
const quote = await request('/rides/estimate', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: JSON.stringify({
    pickup: { address: 'Kampala Central', latitude: 0.315, longitude: 32.58 },
    destination: { address: 'Entebbe Airport', latitude: 0.0424, longitude: 32.4435 },
    vehicleType: 'SUV',
    mode: 'ON_DEMAND',
    category: 'STANDARD',
    tripType: 'ONE_WAY',
    passengerCount: 1,
  }),
});

console.log(
  JSON.stringify(
    {
      health: health.status,
      authenticatedUser: login.user.email,
      quote: { currency: quote.currency, total: quote.total, distanceKm: quote.distanceKm },
    },
    null,
    2,
  ),
);
