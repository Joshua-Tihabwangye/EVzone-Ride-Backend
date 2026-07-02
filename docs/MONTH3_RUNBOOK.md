# Month 3 Runbook — Observability, Operations & Enterprise Controls

## Scope

This runbook covers the observability and operational controls delivered in Month 3:

- OpenTelemetry traces (Phase 3.1)
- Prometheus metrics and the dedicated metrics server (Phase 3.2)
- Alerting rules, Alertmanager routing, SLOs, and runbooks (Phase 3.3)
- Operations control center endpoints (Phase 3.4)

## Quick validation

```bash
# Build, lint, and run tests
npm run build
npm run lint
npm test

# Validate monitoring configuration
npm run monitoring:validate
```

## Observability endpoints

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /health/live` | Liveness probe | Public |
| `GET /health/ready` | Readiness probe (DB, migrations, Redis, Kafka, storage) | Public |
| `GET /health/dependencies` | Detailed dependency status | Public |
| `GET /health/workers` | Worker heartbeat health | Public |
| `GET /metrics` | Prometheus scrape target | Basic auth (if configured) |
| `GET /operations/control-center` | Aggregated operations dashboard | Admin / Support / Dispatcher |
| `GET /operations/control-center/health` | Health summary only | Admin / Support / Dispatcher |
| `GET /operations/control-center/alerts` | Active alert counts | Admin / Support / Dispatcher |
| `GET /operations/control-center/workers` | Worker heartbeat summary | Admin / Support / Dispatcher |
| `GET /operations/slos` | SLO definitions | Admin / Support / Dispatcher |
| `GET /governance/operational-alerts` | List operational alerts | Admin / Support / Dispatcher |
| `PATCH /governance/operational-alerts/:id/acknowledge` | Acknowledge an alert | Admin / Support / Dispatcher |
| `PATCH /governance/operational-alerts/:id/resolve` | Resolve an alert | Admin / Support |

## Alerting

Prometheus alert rules live in `monitoring/prometheus/alerts.yml`. Alertmanager configuration lives in `monitoring/alertmanager/alertmanager.yml`.

### Severity routing

| Severity | Route | Repeat interval | Typical receiver |
|----------|-------|-----------------|------------------|
| `critical` | Immediate | 30m | PagerDuty + Slack `#alerts-critical` |
| `warning` | Delayed | 2h | Slack `#alerts-warning` |
| `info` | Daily digest | 4h | Email |

### Alert inventory

| Alert | Severity | Summary | Runbook |
|-------|----------|---------|---------|
| `EvzoneHighHttp5xxRate` | critical | HTTP 5xx rate > 5% over 5m | See below |
| `EvzoneHighP99Latency` | warning | p99 latency > 2s for 3m | See below |
| `EvzoneEndpointErrorBudgetBurn` | warning | 1h error rate above 99.9% budget | See below |
| `EvzonePayoutFailures` | critical | A payout failed in the last 5m | See below |
| `EvzonePendingCashoutsHigh` | warning | More than 50 pending cashouts | See below |
| `EvzoneFailedWebhooksBacklog` | warning | More than 20 webhooks awaiting retry | See below |
| `EvzoneStuckRidesOrDeliveries` | warning | New stuck-service alerts from watchdog | See below |
| `EvzoneQueueJobFailures` | warning | More than 5 failed jobs per queue in 5m | See below |
| `EvzoneStaleWorkerHeartbeat` | warning | A critical worker heartbeat is stale | See below |
| `EvzoneDomainEventOutboxBacklog` | warning | More than 1000 domain events in outbox | See below |
| `EvzoneDependencyDown` | critical | A critical dependency is unhealthy | See below |

## Per-alert runbooks

### EvzoneHighHttp5xxRate

1. Check `/health/ready` and `/health/dependencies` for a red dependency.
2. Look at application logs for the request ID/trace ID associated with 5xx responses.
3. Check recent deployments or migrations that could have introduced a regression.
4. If a specific route is responsible, consider a feature-flag disable or rollback.

### EvzoneHighP99Latency

1. Identify slow routes from the `evzone_http_request_duration_seconds` histogram.
2. Check database query logs and slow-query metrics.
3. Verify Redis and external provider latency (`evzone_provider_request_duration_seconds`).
4. Scale workers or database connection pool if load is the cause.

### EvzoneEndpointErrorBudgetBurn

1. Calculate the current 30-day error rate from Prometheus.
2. Determine if the burn is due to a single incident or a sustained degradation.
3. For sustained issues, treat as a reliability incident and schedule a post-mortem.

### EvzonePayoutFailures

1. Inspect `evzone_payouts_failed_total` by provider.
2. Check the provider response in payout logs.
3. Verify provider credentials and API status page.
4. Retry failed payouts via the admin console after root cause is fixed.

### EvzonePendingCashoutsHigh

1. Check the cashout review queue in the admin finance console.
2. Verify payout provider throughput and limits.
3. Escalate to finance operations if manual review is backlogged.

### EvzoneFailedWebhooksBacklog

1. Check `evzone_webhook_events_total{status="FAILED"}` by provider.
2. Verify webhook endpoint URLs and provider status pages.
3. Inspect signature verification logs for misconfiguration.
4. Retry failed events; if widespread, pause ingestion and notify the provider.

### EvzoneStuckRidesOrDeliveries

1. Open `/operations/control-center/alerts` to see stuck-service counts.
2. Check driver location updates and dispatch unit availability.
3. Contact affected drivers or dispatchers.
4. If systemic, run the watchdog manually and review matching worker health.

### EvzoneQueueJobFailures

1. Identify the failing queue from the alert label.
2. Check BullMQ dead-letter queue and worker logs.
3. Fix the underlying failure and re-queue jobs.

### EvzoneStaleWorkerHeartbeat

1. Check `/health/workers` for the stale worker name.
2. Verify the worker process is running and has Redis connectivity.
3. Restart the worker pod/process if necessary.

### EvzoneDomainEventOutboxBacklog

1. Check Kafka connectivity (`/health/dependencies`).
2. Verify the domain-event flush worker is running.
3. If Kafka is down, events fall back to the database outbox; clear backlog once Kafka recovers.

### EvzoneDependencyDown

1. Use `/health/dependencies` to identify the unhealthy dependency.
2. For Postgres: verify connection pool, disk space, and migration state.
3. For Redis: verify connectivity and memory usage.
4. For Kafka: verify broker health and topic availability.
5. For storage: verify Cloudinary credentials or local disk write access.

## SLOs

SLOs are defined in `monitoring/slo/slos.yml` and exposed via `GET /operations/slos`.

| SLO | Target | Window |
|-----|--------|--------|
| API Availability | 99.9% | 30d |
| Payout Completion Success Rate | 99.5% | 7d |
| Dispatch Offer Acceptance Within TTL | 85% | 1d |
| Webhook Delivery Success Rate | 99% | 7d |

## Operations control center

Use `GET /operations/control-center` for a single-pane summary. The payload includes:

- Overall health status
- Worker heartbeat summary
- Watchdog last result
- Active operational alert counts by severity/status
- Domain event outbox backlog
- Failed webhook backlog
- SLO snapshot

Access is restricted to `ADMIN`, `SUPPORT`, and `DISPATCHER` roles.

## Grafana dashboards

Dashboards are provisioned from `monitoring/grafana/dashboards/` and loaded automatically when the Grafana container starts.

| Dashboard | UID | Purpose |
|-----------|-----|---------|
| Infrastructure Overview | `evzone-infra-overview` | HTTP rate/errors/latency, dependency health, drivers online, active services |
| API RED | `evzone-api-red` | 5xx rate, p99 latency, error budget burn, upstream provider errors |
| Dispatch & Matching | `evzone-dispatch-matching` | Dispatch offers, match runs, active services, stuck services |
| Financial Pipeline | `evzone-financial-pipeline` | Payments, refunds, cashouts, payouts, wallet movements |
| Webhooks & Partners | `evzone-webhooks-partners` | Partner requests, webhook backlog/delivery, inbound webhook events |
| Operations Control | `evzone-operations-control` | Operations alerts, worker heartbeats, queue jobs, outbox backlog |

Local URLs:

- Grafana: http://localhost:3000 (`admin` / `evzone`)
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093

Start the stack with:

```bash
docker compose up -d prometheus alertmanager grafana
```

## Partner integration runbooks

### Partner webhook delivery failure

1. Check `evzone_partner_webhook_backlog` and `evzone_partner_webhook_delivered_total{status="failed"}`.
2. Verify the partner subscription URL and secret in `/admin/partners/:id/webhooks`.
3. Inspect the `partner_webhook_outbox` table for `lastError` and `attempts`.
4. Use `POST /partner/v1/events` or the retry mechanism to re-queue failed deliveries.

### CorporatePay adapter failure

1. Check `evzone_partner_requests_total{status="error"}` for the failing action.
2. Verify the partner API key scope includes `actions:write`.
3. Review `CorporateIntegrationService` logs for the mapped CorporatePay action.
4. Confirm the partner `type` is `CORPORATEPAY` and the organization mapping is correct.

## Month 3 smoke tests

Run the full Month 3 smoke suite locally:

```bash
npm run smoke:month3
```

Individual scripts:

```bash
npm run smoke:tracing
npm run smoke:metrics
npm run smoke:ops
npm run smoke:admin-finance
npm run smoke:fleet-readiness
npm run smoke:partners
npm run smoke:dashboards
```

## CI

The Month 3 CI pipeline adds:

- `promtool-check` — validates `prometheus.yml` and `alerts.yml` with Promtool.
- `metrics-smoke` — starts the app with `METRICS_ENABLED=true` and verifies `/metrics`.
- `month3-smoke` — runs the full Month 3 smoke suite against a Postgres/Redis stack.
