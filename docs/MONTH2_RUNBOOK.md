# Month 2 Runbook — Hardened Audit Trail & Production Readiness

## Scope

This runbook covers the changes delivered in Phase 2.9 (Hardened Audit Trail) and Phase 2.10 (Month 2 Integration Tests & Production Readiness).

- Append-only audit logs with HMAC checksums for every state-changing service call.
- Admin audit-log query and verification endpoints.
- Month 2 integration tests for financial, dispatch, and tenant-permission lifecycles.
- Smoke scripts and CI pipeline for automated validation.

---

## Quick validation

```bash
# Local sqljs test suite (excludes Postgres-only concurrency tests)
npm test -- --testPathIgnorePatterns='financial-concurrency|idempotency-critical|webhook-security'

# Full test suite against Postgres
DATABASE_URL=postgresql://evzone:evzone@localhost:5432/evzone npm test

# Build and lint
npm run build
npm run lint
```

---

## Audit trail

### What is recorded

State-changing methods in the following services write an `AuditLog` row:

- `OrganizationsService` — create, update, member invite/accept/update/remove, admin review.
- `GovernanceService` — feature flags, approvals, risk cases, service configurations, operational alerts.
- `UniversalOfferService` / `UniversalRequestService` — request create/cancel, offer accept/decline, request assignment, unit reservation.
- `PaymentsService` — payment intent create, confirm, refund.
- `FinancialOperationsService` — payment method create/update, cashout request/cancel/review.

Each row stores:

- `actorUserId`, `action`, `entityType`, `entityId`
- `before` / `after` JSON snapshots
- `changedFields` (computed diff)
- `reason`, `requestId`, `route`, `ipAddress`
- `checksum` — HMAC-SHA256 of a canonical JSON payload

### Secret management

Audit checksums use `AUDIT_HMAC_SECRET` with a fallback to `JWT_SECRET`. If both are missing a warning is logged and a deterministic fallback is used (development only).

Set `AUDIT_HMAC_SECRET` to a strong, production-only value:

```bash
AUDIT_HMAC_SECRET=$(openssl rand -hex 32)
```

### Postgres append-only enforcement

Migration `1784000007000-HardenedAuditTrail.ts` adds a trigger that rejects `UPDATE` and `DELETE` on `audit_logs`. This is skipped for sqljs test runs.

### Admin endpoints

- `GET /admin/audit-logs` — paginated list with filters (`action`, `entityType`, `entityId`, `actorUserId`).
- `GET /admin/audit-logs/:id/verify` — recomputes the checksum and returns `{ valid, audit }`.

---

## Month 2 integration tests

| Test file | Coverage |
|-----------|----------|
| `test/audit-trail.spec.ts` | Audit service record/verify, changed fields, tamper detection, service-level audit wiring. |
| `test/integration/month2-financial-lifecycle.spec.ts` | Payment intent → confirm → refund, cashout request → review, with audit verification. |
| `test/integration/month2-dispatch-lifecycle.spec.ts` | Dispatch unit online → request → match → offer accept → cancel, with audit verification. |
| `test/integration/month2-tenant-permissions.spec.ts` | Organization creation, tenant isolation, member lifecycle, permission resolution, audit verification. |

Run a single suite:

```bash
npm test -- test/integration/month2-financial-lifecycle.spec.ts
```

---

## Smoke tests

Smoke scripts live in `scripts/` and run against `BASE_URL` (default `http://localhost:3000/api/v1`).

```bash
npm run smoke:month2:audit
npm run smoke:month2:financial
npm run smoke:month2:dispatch
npm run smoke:month2:tenant
```

Use a custom endpoint:

```bash
BASE_URL=https://api-staging.evzone.local/api/v1 npm run smoke:month2:audit
```

---

## Deployment checklist

1. Run migrations: `npm run db:migration:run`.
2. Verify `AUDIT_HMAC_SECRET` is set in production.
3. Confirm `JWT_SECRET` is strong and distinct from `AUDIT_HMAC_SECRET`.
4. Run smoke tests against the deployed environment.
5. Verify admin audit endpoints return rows and `/verify` returns `valid: true`.

---

## Rollback

If a critical issue is detected:

1. Stop traffic to the affected service.
2. Revert to the previous release image.
3. Do **not** revert the audit migration; the new columns are additive and the append-only trigger is safe to leave in place.
4. Investigate using the `audit_logs` table and `GET /admin/audit-logs`.

---

## Monitoring & alerts

- Watch for `Audit error:` logs — they indicate the audit service failed to persist a row.
- Alert on admin `/admin/audit-logs/:id/verify` returning `valid: false` outside of known test data.
- Monitor Postgres disk growth; `audit_logs` is append-only and should be retained according to your compliance policy.
