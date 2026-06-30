# Admin Web API Map

## Canonical Base

`/api/v1/admin`

## Authentication

Bearer JWT. Roles: `ADMIN`, `SUPPORT` (with permission scoping).

## Stable Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/dashboard` | Dashboard metrics |
| GET | `/api/v1/admin/users` | List users |
| GET | `/api/v1/admin/users/:id` | User detail |
| GET | `/api/v1/admin/drivers` | List drivers |
| GET | `/api/v1/admin/drivers/:id` | Driver detail |
| POST | `/api/v1/admin/drivers/:id/approve` | Approve driver |
| POST | `/api/v1/admin/drivers/:id/reject` | Reject driver |
| GET | `/api/v1/admin/vehicles` | List vehicles |
| GET | `/api/v1/admin/documents` | List documents pending review |
| POST | `/api/v1/admin/documents/:id/approve` | Approve document |
| POST | `/api/v1/admin/documents/:id/reject` | Reject document |
| GET | `/api/v1/admin/trips` | List all trips |
| GET | `/api/v1/admin/trips/:id` | Trip detail |
| POST | `/api/v1/admin/trips/:id/override` | Manual trip override |
| GET | `/api/v1/admin/payments` | List payment intents |
| POST | `/api/v1/admin/payments/:id/refund` | Approve refund |
| GET | `/api/v1/admin/cashouts` | List cashout requests |
| POST | `/api/v1/admin/cashouts/:id/review` | Review cashout |
| GET | `/api/v1/admin/ledger` | Ledger entries |
| GET | `/api/v1/admin/reconciliation` | Reconciliation variances |
| GET | `/api/v1/admin/audit` | Audit trail |
| GET | `/api/v1/admin/system/flags` | Feature flags |
| PATCH | `/api/v1/admin/system/flags/:key` | Update feature flag |
| GET | `/api/v1/infrastructure/status` | System status |
| GET | `/api/v1/infrastructure/route-ownership` | Route ownership registry |

## Compatibility (Deprecated) Endpoints

| Method | Path | Migrate To |
|--------|------|------------|
| GET/POST | `/api/v1/admin/*` legacy aliases | `/api/v1/admin` canonical equivalents |

## Idempotency

All privileged mutations require an `Idempotency-Key` header and are audited.
