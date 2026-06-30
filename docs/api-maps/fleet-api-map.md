# Fleet Portal API Map

## Canonical Base

`/api/v1/fleet`

## Authentication

Bearer JWT. Roles: `FLEET_PARTNER`, `FLEET_MANAGER`.

## Stable Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/fleet/dashboard` | Fleet dashboard |
| GET | `/api/v1/fleet/profile` | Fleet profile |
| GET | `/api/v1/fleet/drivers` | Fleet drivers |
| GET | `/api/v1/fleet/drivers/:id` | Driver detail |
| GET | `/api/v1/fleet/vehicles` | Fleet vehicles |
| GET | `/api/v1/fleet/vehicles/:id` | Vehicle detail |
| GET | `/api/v1/fleet/trips` | Fleet trips |
| GET | `/api/v1/fleet/earnings` | Fleet earnings |
| GET | `/api/v1/fleet/payouts` | Fleet payouts |
| POST | `/api/v1/fleet/payouts` | Request fleet payout |
| GET | `/api/v1/fleet/reports` | Fleet reports |
| GET | `/api/v1/fleet/branches` | Fleet branches |
| GET | `/api/v1/fleet/compliance` | Compliance overview |

## Compatibility (Deprecated) Endpoints

| Method | Path | Migrate To |
|--------|------|------------|
| GET | `/api/v1/fleet/me/*` | `/api/v1/fleet/*` canonical equivalents |

## Scope

Fleet users can only access data for their own fleet/organization. Tenant isolation is enforced at the query level.
