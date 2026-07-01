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
