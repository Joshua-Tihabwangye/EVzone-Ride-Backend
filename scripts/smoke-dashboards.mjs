const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${path}: ${response.status} ${text}`);
  }
  return text;
}

const metrics = await request('/metrics');
if (!metrics.includes('evzone_')) {
  throw new Error('Metrics endpoint does not expose evzone metrics');
}

console.log(
  JSON.stringify(
    {
      version: '10.0.0',
      metricsPresent: true,
      note: 'Grafana dashboards are provisioned via docker-compose; run `docker compose up -d prometheus grafana` to validate UI.',
    },
    null,
    2,
  ),
);
