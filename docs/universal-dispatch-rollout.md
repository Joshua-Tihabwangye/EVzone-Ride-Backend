# Universal Dispatch Rollout Guide

## Overview

The `src/universal-dispatch` module implements a production-ready universal driver-selection and dispatch engine for EVzoneRide. It is wired into `AppModule` and runs as a modular monolith with independent workers.

## What was implemented

### Domain foundation (already present)

- 24 TypeORM entities: dispatch units, requests, offers, assignments, trip sessions, policies, traces, outbox, etc.
- Enums, state-machine guards, DTOs, and default policies for all 28 service types.
- Policy service with validation, activation, and seeding.
- Transactional outbox service.

### Runtime layer (added)

- `UniversalDispatchModule` wired into `AppModule`.
- Application services:
  - `DispatchUnitService`: active vehicle, online/offline, location updates, eligibility snapshots.
  - `UniversalRequestService`: idempotent request creation, cancellation, reschedule.
  - `EligibilityEngineService`: deterministic eligibility with reason codes.
  - `RankingEngineService`: weighted scoring with deterministic tie-breaking.
  - `UniversalMatchingService`: Redis GEO/PostGIS discovery, route-matrix fallback, offer waves, decision traces.
  - `UniversalOfferService`: atomic acceptance with row locking, decline, expiry.
  - `UniversalTripService`: trip transitions and QR verification.
- Infrastructure adapters:
  - `DispatchGeoIndexService`: Redis GEO with PostGIS and Haversine fallbacks.
  - `DispatchLiveStateService`: Redis live snapshots and freshness index.
  - `RouteMatrixService`: provider adapter with conservative ETA fallback.
  - `RouteOptimizerService`: heuristic route optimizer.
  - `DispatchRealtimeService`: WebSocket/push event publisher.
- Workers:
  - `MatchingWorker`: every 5 seconds processes SEARCHING/OFFERING requests.
  - `OfferExpiryWorker`: every 10 seconds expires stale offers.
  - `OutboxWorker`: every 10 seconds flushes the transactional outbox.
  - `StaleCleanupWorker`: every 30 seconds marks stale units offline.
  - `ScheduledDispatchWorker`: every minute activates scheduled requests.
- Controllers:
  - `DispatchDriverController`: driver online/offline, location, offers, trips.
  - `DispatchRiderController`: request creation/cancel/reschedule.
  - `DispatchAdminController`: policies, matching triggers, route optimization.
- Tests:
  - Unit tests for eligibility engine and ranking engine.
  - Smoke test script at `scripts/universal-dispatch-smoke-test.mjs`.

## API endpoints

### Driver endpoints

- `PUT /api/v1/universal-dispatch/drivers/me/active-vehicle`
- `POST /api/v1/universal-dispatch/drivers/me/online`
- `POST /api/v1/universal-dispatch/drivers/me/offline`
- `POST /api/v1/universal-dispatch/drivers/me/location`
- `GET /api/v1/universal-dispatch/drivers/me/offers/active`
- `POST /api/v1/universal-dispatch/drivers/offers/:offerId/accept`
- `POST /api/v1/universal-dispatch/drivers/offers/:offerId/decline`
- `POST /api/v1/universal-dispatch/drivers/trips/:tripId/arrive-pickup`
- `POST /api/v1/universal-dispatch/drivers/trips/:tripId/verify-rider`
- `POST /api/v1/universal-dispatch/drivers/trips/:tripId/start`
- `POST /api/v1/universal-dispatch/drivers/trips/:tripId/arrive-stop`
- `POST /api/v1/universal-dispatch/drivers/trips/:tripId/complete-stop`
- `POST /api/v1/universal-dispatch/drivers/trips/:tripId/complete`
- `POST /api/v1/universal-dispatch/drivers/trips/:tripId/cancel`
- Delivery QR endpoints under `/api/v1/universal-dispatch/drivers/deliveries/...`

### Rider endpoints

- `POST /api/v1/universal-dispatch/service-requests`
- `GET /api/v1/universal-dispatch/service-requests/:requestId`
- `POST /api/v1/universal-dispatch/service-requests/:requestId/cancel`
- `POST /api/v1/universal-dispatch/service-requests/:requestId/reschedule`

### Admin endpoints

- `POST /api/v1/universal-dispatch/admin/dispatch-policies/validate`
- `POST /api/v1/universal-dispatch/admin/dispatch-policies`
- `GET /api/v1/universal-dispatch/admin/dispatch-policies`
- `POST /api/v1/universal-dispatch/admin/dispatch-policies/:id/activate`
- `POST /api/v1/universal-dispatch/admin/dispatch-policies/:id/retire`
- `POST /api/v1/universal-dispatch/admin/service-requests/:requestId/match`
- `POST /api/v1/universal-dispatch/admin/service-requests/:requestId/release-assignment`
- `POST /api/v1/universal-dispatch/admin/service-requests/:requestId/change-driver`
- `POST /api/v1/universal-dispatch/admin/trip-sessions/:tripSessionId/shared-bookings`
- `POST /api/v1/universal-dispatch/admin/routes/optimize`
- `GET /api/v1/universal-dispatch/admin/dispatch-decisions/:requestId`
- `PUT /api/v1/universal-dispatch/admin/dispatch-units/:unitId/state`

## Configuration

Key environment variables:

```text
DISPATCH_DEFAULT_MARKET=default
DISPATCH_LOCATION_FRESHNESS_SECONDS=45
DISPATCH_LOCATION_MAX_AGE_SECONDS=120
DISPATCH_STALE_LOCATION_SECONDS=300
DRIVER_GEO_TTL_SECONDS=300
DISPATCH_ROUTE_PROVIDER=fallback
ROUTE_LOOKUP_BASE_URL=
REDIS_URL=
REDIS_DISABLED=true
```

## Migration

The module uses TypeORM entities already merged into the main `ENTITIES` array. With `DB_SYNCHRONIZE=true` (development) the tables are created automatically. For production, generate a migration:

```bash
npm run db:migration:generate
npm run db:migration:run
```

## Rollout procedure

1. Deploy behind feature flags (`dispatch_v2_enabled`, `dispatch_v2_service_*`, `dispatch_v2_market_*`).
2. Run matcher in shadow mode first and compare decision traces against legacy matching.
3. Enable for one low-risk service/market.
4. Expand gradually while monitoring no-driver rate, first-offer latency, and duplicate assignments.
5. Keep rollback by activating the previous policy version or disabling the feature flag.

## Remaining work

The following features have policy and data-model support but require additional runtime implementation:

- Full shared-ride insertion algorithm with atomic route versioning.
- Multi-stop delivery/cargo route optimizer using OR-Tools or equivalent.
- Scheduled/school reservation backup-candidate and reassignment workflow.
- EV range re-evaluation on route changes.
- Complete admin decision-trace retrieval endpoint.
- Load and chaos tests.
- Full WebSocket event integration with existing realtime gateways.

## Running tests

```bash
npm run test:dispatch
npm run smoke:dispatch
npm run lint
npm run build
```
