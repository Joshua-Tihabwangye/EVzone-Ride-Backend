# Rider App API Map

## Canonical Base

`/api/v1/rides`

## Authentication

Bearer JWT. Roles: `RIDER`, `CUSTOMER`.

## Stable Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/users/me` | Current rider profile |
| GET | `/api/v1/users/me/places` | Saved and recent places |
| POST | `/api/v1/rides` | Request a ride |
| GET | `/api/v1/rides` | List rider trips |
| GET | `/api/v1/rides/:id` | Trip detail |
| POST | `/api/v1/rides/:id/cancel` | Cancel a trip |
| POST | `/api/v1/rides/:id/rate` | Rate driver/trip |
| POST | `/api/v1/deliveries` | Request a delivery |
| GET | `/api/v1/deliveries` | List deliveries |
| GET | `/api/v1/deliveries/:id` | Delivery detail |
| GET | `/api/v1/deliveries/:id/tracking` | Public tracking info |
| GET | `/api/v1/wallets` | Wallet balance |
| GET | `/api/v1/wallets/transactions` | Wallet transactions |
| POST | `/api/v1/payments/intents` | Create payment intent |
| POST | `/api/v1/payments/:id/confirm` | Confirm payment |
| GET | `/api/v1/notifications` | List notifications |
| POST | `/api/v1/safety/sos` | Trigger emergency SOS |
| GET | `/api/v1/mobile/v1/bootstrap` | Mobile bootstrap |

## Compatibility (Deprecated) Endpoints

| Method | Path | Migrate To |
|--------|------|------------|
| GET/POST | `/api/v1/riders/me/*` | `/api/v1/users/me`, `/api/v1/rides`, `/api/v1/wallets` |

## Idempotency

All `POST/PUT/PATCH` endpoints require an `Idempotency-Key` header for mutations.
