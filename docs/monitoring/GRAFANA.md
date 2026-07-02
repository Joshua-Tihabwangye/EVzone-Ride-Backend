# Grafana Dashboards as Code

This directory provisions Grafana dashboards and datasources for the EVzone Ride Backend Month 3 observability stack.

## Local stack

Start Prometheus, Alertmanager and Grafana alongside the API:

```bash
docker compose up -d prometheus alertmanager grafana
```

| Service | URL | Default credentials |
|---------|-----|---------------------|
| Grafana | http://localhost:3000 | `admin` / `evzone` |
| Prometheus | http://localhost:9090 | n/a |
| Alertmanager | http://localhost:9093 | n/a |

The API metrics endpoint is exposed on `http://localhost:9090/metrics` and scraped by Prometheus every 15s.

## Dashboards

Dashboards are stored as JSON in `monitoring/grafana/dashboards/` and loaded automatically by Grafana provisioning:

- **Infrastructure Overview** (`infra-overview.json`) — HTTP rate/errors/latency, dependency health, online drivers, active services.
- **API RED** (`api-red.json`) — 5xx rate, p99 latency, 1h error budget burn, upstream provider errors.
- **Dispatch & Matching** (`dispatch-matching.json`) — dispatch offers, match runs, active services, stuck-service alerts.
- **Financial Pipeline** (`financial-pipeline.json`) — payments, refunds, cashouts, payouts, wallet movements, pending cashouts.
- **Webhooks & Partners** (`webhooks-partners.json`) — partner adapter requests, partner webhook backlog/delivery, inbound webhook events, failed webhooks.
- **Operations Control** (`operations-control.json`) — operations alerts, worker heartbeats, queue job events, outbox backlog, audit logs.

All dashboards are tagged with `month3` and use the provisioned `Prometheus` datasource.

## Editing dashboards

1. Make changes in the Grafana UI.
2. Export the dashboard as JSON (choose **Export for sharing externally** to inline the datasource).
3. Replace the matching file under `monitoring/grafana/dashboards/`.
4. Keep `schemaVersion` current, preserve the `uid`, and keep the `month3` tag.
5. Run the smoke test to confirm provisioning still loads:

```bash
npm run smoke:dashboards
```

## Validation

Validate the Prometheus config and alert rules before committing:

```bash
npm run monitoring:validate
docker run --rm -v $(pwd):/wd prom/prometheus:v3.0.1 promtool check config /wd/monitoring/prometheus/prometheus.yml
docker run --rm -v $(pwd):/wd prom/prometheus:v3.0.1 promtool check rules /wd/monitoring/prometheus/alerts.yml
```
