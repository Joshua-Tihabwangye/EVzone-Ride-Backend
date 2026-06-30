# EVzone API Client Maps

This directory contains audience-specific maps of the stable `/api/v1` contract.

Each map documents:
- The canonical base path for the audience.
- Stable endpoints the audience should use.
- Compatibility (legacy) endpoints that are deprecated and will be removed.
- Authentication requirements.
- Common response envelope format.

## Envelope Format

All JSON responses follow the global envelope:

```json
{
  "success": true,
  "data": { ... },
  "requestId": "req_...",
  "timestamp": "2026-06-30T12:00:00.000Z"
}
```

Paginated list responses use:

```json
{
  "success": true,
  "data": [ ... ],
  "meta": { "page": 1, "limit": 20, "total": 100, "pageCount": 5 },
  "requestId": "req_...",
  "timestamp": "2026-06-30T12:00:00.000Z"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "message": "Validation failed",
    "path": "/api/v1/rides",
    "method": "POST",
    "requestId": "req_...",
    "timestamp": "2026-06-30T12:00:00.000Z"
  }
}
```

## Maps

- [Rider App](./rider-api-map.md)
- [Driver App](./driver-api-map.md)
- [Admin Web](./admin-api-map.md)
- [Fleet Portal](./fleet-api-map.md)
- [Agent / Dispatcher](./agent-api-map.md)
- [Corporate Partner](./partner-api-map.md)
- [Public Tracking](./public-tracking-api-map.md)

## Versioning

- Stable endpoints are under `/api/v1`.
- Compatibility endpoints are marked `deprecated: true` in OpenAPI and include `Deprecation`, `Sunset`, and `X-Compatibility-Status` headers at runtime.
- New major versions will be introduced as `/api/v2` with a minimum 6-month migration window.
