
# Production Readiness Checklist — Month 2

Use this checklist before promoting the Month 2 release to staging or production.

## Infrastructure

- [ ] Postgres 16+ is provisioned and reachable.
- [ ] Redis 7+ is provisioned and reachable (for queues, sessions, real-time).
- [ ] Kafka / BullMQ workers are running if the deployment relies on them.
- [ ] All required secrets are set and are at least 32 characters long:
  - `JWT_SECRET`
  - `AUDIT_HMAC_SECRET` (production-specific, not equal to `JWT_SECRET`)
  - `INTEGRATION_ENCRYPTION_KEY`
  - `CORPORATEPAY_WEBHOOK_SECRET`
  - `CORPORATEPAY_SIGNING_SECRET`
  - `PAYTOTA_SECRET_KEY`
  - `PAYTOTA_WEBHOOK_PUBLIC_KEY`
  - `FLUTTERWAVE_WEBHOOK_SECRET`
  - `FILE_SIGNATURE_SECRET`
- [ ] `NODE_ENV` is set to `production` in production.
- [ ] `DB_SYNCHRONIZE=false` and `DB_MIGRATIONS_RUN=true` in production.

## Database

- [ ] All migrations have been run successfully.
- [ ] Migration `1784000007000-HardenedAuditTrail.ts` created the append-only trigger in Postgres.
- [ ] A backup strategy exists for `audit_logs` and other critical tables.
- [ ] Long-term retention policy for `audit_logs` is documented.

## Application

- [ ] `npm run build` passes.
- [ ] `npm run lint` passes with zero warnings.
- [ ] Full test suite passes against Postgres:
  ```bash
  DATABASE_URL=<prod-like-url> npm test
  ```
- [ ] Audit checksums verify successfully (`GET /admin/audit-logs/:id/verify` returns `valid: true`).
- [ ] Audit errors are not present in application logs after a smoke run.

## Security

- [ ] CORS origins are restricted in production (`CORS_ORIGINS`).
- [ ] Rate limiting is enabled and tuned (`RATE_LIMIT_TTL_MS`, `RATE_LIMIT_REQUESTS`).
- [ ] Helmet and compression middleware are active.
- [ ] Webhook secrets are rotated and stored in a secrets manager.
- [ ] Default/demo credentials are removed or disabled.

## Observability

- [ ] Health checks (`GET /health`) return 200.
- [ ] Application logs are collected and searchable.
- [ ] Error alerting is configured for 5xx responses and unhandled exceptions.
- [ ] Audit log verification failures trigger a security alert.

## Smoke tests

Run all Month 2 smoke scripts against the target environment:

```bash
BASE_URL=https://api-staging.evzone.local/api/v1 \
  npm run smoke:month2:audit && \
  npm run smoke:month2:financial && \
  npm run smoke:month2:dispatch && \
  npm run smoke:month2:tenant
```

- [ ] `smoke:month2:audit` passes and checksum verification returns `true`.
- [ ] `smoke:month2:financial` passes.
- [ ] `smoke:month2:dispatch` passes.
- [ ] `smoke:month2:tenant` passes.

## Documentation

- [ ] `docs/MONTH2_RUNBOOK.md` is current and reviewed by on-call.
- [ ] Incident runbook references the `audit_logs` table and admin endpoints.
- [ ] Rollback procedure is documented and tested in a non-production environment.

## Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Engineering Lead | | | |
| Security / Compliance | | | |
| SRE / Platform | | | |

# Production Readiness Checklist

Use this checklist before deploying EVzone Ride Backend to production or staging.

A runnable version of these checks is available at:

```bash
NODE_ENV=production \
  DATABASE_URL=postgresql://... \
  node scripts/production-readiness-check.mjs
```

The script exits with a non-zero code if any hard requirement is not met.

---

## 1. Environment & Secrets

- [ ] `NODE_ENV` is set to `production` (or `staging`).
- [ ] `JWT_SECRET` is set, at least 32 characters, and not a default/weak value.
- [ ] `INTEGRATION_ENCRYPTION_KEY` is set, at least 32 characters, and rotated.
- [ ] `FILE_SIGNATURE_SECRET` is set, at least 32 characters, and rotated.
- [ ] All other provider secrets (`FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`, `PAYTOTA_WEBHOOK_PUBLIC_KEY`, `CORPORATEPAY_WEBHOOK_SECRET`, etc.) are configured for the selected `PAYMENT_PROVIDER`.
- [ ] No `.env` files containing secrets are committed to the repository.

## 2. Database

- [ ] `DATABASE_URL` points to a managed PostgreSQL instance (not `localhost`).
- [ ] PostGIS extension is enabled on the database.
- [ ] `DB_SYNCHRONIZE` is `false` in production.
- [ ] `DB_MIGRATIONS_RUN` is `true` in production.
- [ ] Latest migrations have been run (`npm run db:migration:run:prod`).
- [ ] Backups and point-in-time recovery are configured.

## 3. Networking & Security

- [ ] `CORS_ORIGINS` is explicitly set to allowed origins (no wildcard `*`).
- [ ] `PUBLIC_BASE_URL` is set to the public HTTPS URL of the deployment.
- [ ] TLS termination is enabled and HSTS headers are active.
- [ ] Rate limiting and Helmet security headers are enabled (default in the app).
- [ ] Webhook signature secrets are rotated and stored in a secrets manager.

## 4. Infrastructure Dependencies

- [ ] Redis is enabled and reachable (`REDIS_DISABLED` is not `true`).
- [ ] `REDIS_URL` or `REDIS_HOST` + `REDIS_PORT` are configured.
- [ ] Kafka is enabled for durable domain events (`KAFKA_DISABLED` is not `true`) or the database fallback is acceptable for the deployment tier.
- [ ] Object/file storage provider is configured (Cloudinary, S3-compatible, etc.).

## 5. Logging & Observability

- [ ] `LOG_LEVEL` is `info`, `warn`, or `error` (avoid `debug`/`trace` in production).
- [ ] `LOG_PRETTY` is `false` in production so logs are emitted as JSON.
- [ ] Health endpoints (`/health/live`, `/health/ready`, `/health/dependencies`) are reachable.
- [ ] Worker heartbeat monitoring is configured (see `/health/workers`).
- [ ] Prometheus `/metrics` endpoint is scraped and returns default + custom metrics.
- [ ] Alert rules (`monitoring/prometheus/alerts.yml`) have been reviewed and validated with `npm run monitoring:alerts:validate`.
- [ ] Alertmanager config (`monitoring/alertmanager/alertmanager.yml`) has been validated with `npm run monitoring:alertmanager:validate`.
- [ ] `docs/MONTH3_RUNBOOK.md` has been reviewed by on-call and every alert has a runbook section.

## 6. Payments & Ledger

- [ ] `PAYMENT_PROVIDER` is set to a real provider (`FLUTTERWAVE` or `PAYTOTA`), not `MOCK`.
- [ ] Provider API keys and webhook secrets are configured.
- [ ] Webhook URLs are registered with the payment provider.
- [ ] A smoke test of `payment webhook → ledger journal` has passed (`npm run smoke:payment-webhook-to-ledger`).

## 7. Application Smoke Tests

Run the focused smoke tests against a production-like environment before release:

```bash
DATABASE_URL=postgresql://... npm run smoke:health
DATABASE_URL=postgresql://... npm run smoke:logging
DATABASE_URL=postgresql://... npm run smoke:cors
DATABASE_URL=postgresql://... npm run smoke:document-lifecycle
DATABASE_URL=postgresql://... npm run smoke:ride-to-offer
DATABASE_URL=postgresql://... npm run smoke:payment-webhook-to-ledger
```

## 8. Deployment Checklist

- [ ] Docker image is built and tagged.
- [ ] Migrations run as an init container or deployment step before app start.
- [ ] `HOST` and `PORT` are set for the runtime environment.
- [ ] Graceful shutdown timeout is sufficient for in-flight requests.
- [ ] Secrets are injected from a secrets manager, not plain environment files.

## 9. Post-Deployment Verification

- [ ] `/health/ready` returns `ok`.
- [ ] `/health/dependencies` reports `database`, `migrations`, `redis`, and `storage` healthy.
- [ ] A test ride can be created, matched, accepted, and paid end-to-end.
- [ ] Trial balance (`GET /accounting/trial-balance`) is balanced.

