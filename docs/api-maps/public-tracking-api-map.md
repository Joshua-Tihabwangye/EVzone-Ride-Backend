# Public Tracking API Map

## Canonical Base

`/api/v1/deliveries` (public tracking scope)

## Authentication

Public read-only access via short-lived tracking token or public URL token. No JWT required.

## Stable Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/deliveries/:id/tracking` | Public delivery tracking |
| GET | `/api/v1/rides/:id/tracking` | Public ride tracking (where enabled) |

## Response

Public tracking endpoints return a limited, PII-reduced view:
- Status
- ETA
- Route progress
- Vehicle type
- Driver first name only (optional)

## Rate Limits

Public tracking endpoints have strict IP and token-level rate limits to prevent abuse.
