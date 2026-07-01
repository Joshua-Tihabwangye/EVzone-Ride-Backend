# Driver App API Map

## Canonical Base

`/api/v1/driver/jobs`

## Authentication

Bearer JWT. Roles: `DRIVER`.

## Stable Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/users/me` | Current driver profile |
| GET | `/api/v1/drivers/me` | Driver profile and onboarding status |
| PATCH | `/api/v1/drivers/me` | Update driver profile |
| GET | `/api/v1/drivers/me/vehicles` | List driver vehicles |
| POST | `/api/v1/drivers/me/vehicles` | Add a vehicle |
| GET | `/api/v1/drivers/me/documents` | List driver documents |
| POST | `/api/v1/drivers/me/documents` | Upload driver document |
| POST | `/api/v1/drivers/me/online` | Go online |
| POST | `/api/v1/drivers/me/offline` | Go offline |
| POST | `/api/v1/drivers/me/location` | Submit location heartbeat |
| GET | `/api/v1/driver/jobs` | List available jobs/offers |
| POST | `/api/v1/driver/jobs/:id/accept` | Accept a job offer |
| POST | `/api/v1/driver/jobs/:id/decline` | Decline a job offer |
| GET | `/api/v1/driver/jobs/active` | Active job |
| POST | `/api/v1/rides/:id/arrive` | Mark arrival |
| POST | `/api/v1/rides/:id/start` | Start trip |
| POST | `/api/v1/rides/:id/complete` | Complete trip |
| POST | `/api/v1/rides/:id/verify-rider` | Verify rider OTP |
| GET | `/api/v1/driver/earnings` | Earnings summary |
| GET | `/api/v1/wallets` | Wallet balance |
| GET | `/api/v1/wallets/transactions` | Wallet transactions |
| POST | `/api/v1/cashouts` | Request cashout |

## Compatibility (Deprecated) Endpoints

| Method | Path | Migrate To |
|--------|------|------------|
| POST | `/api/v1/locations/heartbeat` | `/api/v1/drivers/me/location` |
| GET/POST | `/api/v1/drivers/me/*` | `/api/v1/drivers/me` canonical equivalents |

## Idempotency

All `POST/PUT/PATCH` endpoints require an `Idempotency-Key` header for mutations.
