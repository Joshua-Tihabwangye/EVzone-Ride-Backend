# CorporatePay Partner API Map

## Canonical Base

`/api/v1/corporate-pay/partner`

## Authentication

Partner API key + HMAC-SHA256 signed requests.

## Stable Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/corporate-pay/partner/capabilities` | Partner capabilities |
| POST | `/api/v1/corporate-pay/partner/trips` | Create corporate trip |
| GET | `/api/v1/corporate-pay/partner/trips` | List partner trips |
| GET | `/api/v1/corporate-pay/partner/trips/:id` | Trip detail |
| POST | `/api/v1/corporate-pay/partner/trips/:id/cancel` | Cancel trip |
| GET | `/api/v1/corporate-pay/partner/billing` | Billing summary |
| GET | `/api/v1/corporate-pay/partner/reconciliation` | Reconciliation report |
| POST | `/api/v1/corporate-pay/partner/webhooks` | Receive CorporatePay webhook events |

## Webhooks

Partners may subscribe to webhook events:
- `trip.created`
- `trip.completed`
- `trip.cancelled`
- `payment.confirmed`
- `payment.failed`

All inbound webhooks to EVzone must include a valid HMAC-SHA256 signature and a unique event ID for replay protection.

## Scope

Partner credentials can only access their own corporate account data and trips.
