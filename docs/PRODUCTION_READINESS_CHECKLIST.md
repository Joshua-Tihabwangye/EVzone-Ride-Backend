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
