# EVzoneRide Backend Implementation Prompt

Use this prompt together with the attached file:

`EVzoneRide_Universal_Driver_Dispatch_Backend_Implementation.md`

---

You are the lead backend engineer responsible for implementing EVzoneRide's universal driver-selection and dispatch system inside the existing backend repository you have been given.

The attached **EVzoneRide Universal Driver Dispatch Backend Implementation Specification** is the normative product and architecture specification. Read it completely before modifying code. Implement the system end to end; do not merely describe an architecture or produce a plan.

## Primary objective

Implement a production-ready, fast, safe, fair, auditable, and extensible dispatch engine that works for every EVzoneRide driver and vehicle category, including:

- EV scooters, motorcycles, bicycles, mini cars, standard cars, premium vehicles, SUVs, minivans, buses, vans, trucks, and other configured classes.
- Individual drivers, private drivers, chauffeurs, partner drivers, business/fleet drivers, school drivers, inter-city drivers, medical/PWD drivers, delivery riders, and couriers.
- Immediate rides, scheduled rides, recurring school routes, round trips, multi-stop trips, airport transfers, inter-city trips, senior assistance, medical/PWD trips, shared rides, parcel delivery, food delivery, courier work, cargo routes, and fleet contracts.

The core runtime match must be:

```text
Driver + Active Vehicle + Qualifications + Vehicle Capabilities
+ Compliance + Fleet/Partner Relationship + Shift + Live State
```

Do not match a request to a bare `driver_id`.

## Mandatory engineering behavior

1. Inspect the current repository, understand its architecture, and map all existing driver, vehicle, ride, trip, delivery, schedule, fleet, payment, location, notification, and document-verification components.
2. Preserve the repository's current language, framework, naming, dependency-injection style, test framework, linting rules, API conventions, and deployment patterns unless a change is essential for correctness.
3. Do not stop after the audit or implementation plan. Continue to create the migrations, domain code, infrastructure adapters, APIs, workers, tests, configuration, and documentation.
4. Do not leave placeholder methods, pseudo-code, unimplemented interfaces, empty handlers, commented-out production logic, or TODO markers for required functionality.
5. Do not invent successful test results. Run the available formatter, linter, type checker, unit tests, integration tests, and build commands. Report exact outcomes and any genuine blockers.
6. Do not make destructive schema changes during the first rollout. Use additive migrations, backfills, compatibility adapters, feature flags, shadow mode, and reversible activation.
7. Do not weaken safety, legal, capacity, accessibility, school, medical, document, insurance, inspection, route, schedule, or energy requirements to force a match.
8. Do not use ethnicity, religion, cultural background, or other sensitive personal attributes in automated matching or ranking.
9. Do not reward unsafe or fast driving. Use traffic-aware route ETA, not driver speeding behavior.
10. PostgreSQL or the repository's transactionally equivalent durable store must be the final assignment authority. Redis or another cache may improve speed but must not be the sole source of ride ownership.

## First task: repository audit and mapping

Before changing behavior, inspect and document in your working notes:

- Application language and framework.
- Current modules/services and boundaries.
- Databases and migration system.
- Cache, queue, event broker, background worker, and scheduler.
- Existing WebSocket, server-sent-event, FCM, and APNs integration.
- Current driver and rider authentication.
- Driver, vehicle, fleet, ride, request, offer, trip, delivery, stop, schedule, payment, rating, and document models.
- Current online/offline and location-update flow.
- Current matching or nearest-driver code.
- Current status enums and state transitions.
- Current idempotency and concurrency protection.
- Current observability and deployment setup.
- Existing public APIs and mobile compatibility constraints.

Create a concise mapping from existing components to the target components in the specification. Reuse existing code when it is correct. Refactor or wrap it when necessary. Avoid creating duplicate sources of truth.

## Required architecture

Implement these logical components, adapting package names to the repository:

```text
dispatch/domain
  Driver
  Vehicle
  DispatchUnit
  ServiceRequest
  Requirement
  Offer
  Assignment
  TripSession
  TripBooking
  Stop
  DispatchPolicy
  DecisionTrace

dispatch/application
  CreateServiceRequest
  ActivateScheduledRequest
  MatchServiceRequest
  EvaluateEligibility
  CalculateRouteFeasibility
  RankCandidates
  PlanOfferWave
  AcceptOffer
  DeclineOffer
  ExpireOffer
  CancelRequest
  ReleaseAssignment
  TransitionTrip
  InsertSharedBooking
  OptimizeDeliveryRoute

dispatch/infrastructure
  DurableRepositories
  RedisLiveState
  RedisGeoIndex
  PostGISFallback
  RouteMatrixAdapter
  RouteOptimizerAdapter
  WebSocketPublisher
  PushNotificationPublisher
  TransactionalOutbox

dispatch/workers
  MatchingWorker
  OfferExpiryWorker
  ScheduledDispatchWorker
  StaleDispatchUnitCleanupWorker
  SnapshotRefreshWorker
  OutboxPublisherWorker
```

Prefer a modular monolith with separate worker processes unless the repository is already a well-operated service architecture. Do not create unnecessary microservices.

## Data model requirements

Implement or adapt durable models for:

- Drivers.
- Driver certifications.
- Driver service entitlements.
- Vehicles.
- Vehicle capabilities/accessories.
- Vehicle documents.
- Fleets and fleet contracts/rules.
- Driver-vehicle assignments.
- Driver shifts and schedules.
- Dispatch units.
- Service requests.
- Ordered request stops.
- Request requirements.
- Offers.
- Assignments.
- Trip sessions.
- Trip bookings for shared rides.
- Trip-session stops.
- Versioned dispatch policies.
- Dispatch decision traces.
- Idempotency records.
- Transactional outbox events.

Use the schema in the specification as the reference. Map it to existing tables when possible. Add database constraints that guarantee:

```text
one winning assignment per request
one conflicting active assignment per dispatch unit
one active normal dispatch unit per driver
unique idempotent request creation
unique offer identity per request/dispatch-unit/wave
valid ordered stops
```

Use PostGIS geography/geometry indexes where supported. Add the required database indexes and explain each performance-sensitive index in a migration comment or repository documentation.

## Dispatch-unit construction

Create a dispatch-unit builder or snapshot service that combines:

- Driver verification and safety state.
- Active vehicle.
- Driver certifications.
- Service entitlements.
- Vehicle class and verified capabilities.
- Document, insurance, registration, and inspection validity.
- Fleet relationship and fleet operating rules.
- Shift and remaining driving time.
- Online state.
- Current location and freshness.
- EV battery and usable range where applicable.
- Active request and offer conflicts.

Only one active vehicle may be used for a driver's normal live dispatch session. Changing the active vehicle must immediately rebuild eligibility and geospatial-index membership.

## Live location and availability

Implement:

- Authenticated location ingestion.
- Monotonic sequence handling.
- Out-of-order update rejection.
- Timestamp and clock-skew validation.
- Coordinate and accuracy validation.
- Impossible-jump and unrealistic-speed signals.
- Redis live snapshot update.
- Redis GEO membership update.
- Freshness sorted set or equivalent.
- Stale-unit cleanup worker.
- Periodic durable last-location snapshot.
- Safe PostGIS fallback when Redis is unavailable.

Use adaptive client guidance consistent with the specification:

```text
active navigation/trip: 2-4 seconds
online and moving:      5-10 seconds
online and stationary: 20-30 seconds
```

Make freshness thresholds configurable by service policy.

## Request normalization

Create one normalized internal request contract for passenger, school, shared, delivery, and cargo work. It must support:

- Service family and service type.
- Immediate, scheduled, and recurring modes.
- Pickup, ordered stops, and dropoff.
- Time windows and service duration.
- Passenger count.
- Cargo weight and volume.
- Mandatory vehicle/driver capabilities.
- Optional functional preferences.
- Beneficiary/rider booked on behalf of another person.
- Fare quote and payment authorization references.
- Sharing permission.
- Round-trip and multi-stop information.

All request-creation endpoints must support idempotency keys. Equivalent retries return the original result; a reused key with a different payload returns an idempotency conflict.

## Eligibility engine

Implement eligibility as deterministic true/false rules with explicit reason codes. It must evaluate all applicable requirements before scoring.

At minimum include:

- Driver active, verified, safe, entitled, and unsuspended.
- Required certification present and unexpired.
- Active vehicle verified and allowed.
- Passenger capacity.
- Cargo weight and volume.
- Required accessibility, medical, child-seat, premium, school, safety, food, and cargo equipment.
- Document, insurance, inspection, and registration validity.
- Fresh location and current availability.
- No assignment or offer conflict.
- Operating-zone eligibility.
- Rider-driver block/exclusion.
- Shift and driving-time feasibility.
- Schedule conflict checks.
- Full-route and time-window feasibility.
- EV range and reserve.
- Shared-route insertion feasibility.
- Fleet contractual restrictions.

Return structured reason codes and facts. Persist aggregate exclusion counts in the decision trace.

Safety and legal constraints must never be represented merely as scoring weights.

## Candidate discovery and ETA

Implement two-stage discovery:

1. Redis GEO or equivalent nearby shortlist using expanding policy radiuses.
2. Realistic road ETA for the best small eligible shortlist through a route-matrix abstraction.

Requirements:

- Support separate service indexes by market and category.
- Deduplicate units present in several indexes.
- Default shortlist and route-matrix limits must be configurable.
- Use car, motorcycle/scooter, bicycle, or truck mode according to the active vehicle.
- Add a strict route-provider timeout.
- Cache short-lived H3/grid-cell ETA estimates.
- On route-provider failure, use a conservative approximate ETA with an uncertainty penalty.
- Never let fallback ETA make an otherwise infeasible route eligible.
- Implement PostGIS nearest-neighbor fallback for safe degraded operation.

Keep the route vendor behind an interface. Do not leak vendor response objects into the domain layer.

## Ranking and fairness

Implement normalized scoring using versioned policy weights. Include:

- Pickup ETA.
- Reliability.
- Bounded idle/waiting fairness.
- Service quality.
- Route fit.
- EV energy margin where relevant.
- Functional preferences only.

Use service-specific weights from the specification as initial defaults. Implement deterministic tie-breaking.

Reliability must use decayed and bounded metrics. Rating must use a prior/Bayesian adjustment so new drivers are not unfairly advantaged or starved. Maintain separate fairness pools by service family.

Fairness must never override safety, capability, capacity, schedule, energy, or an extreme ETA difference.

## Service policies to implement

Create validated, immutable, versioned policies for all of these categories:

1. Standard instant passenger ride.
2. EV scooter/motorcycle/bicycle/minicar.
3. Premium ride.
4. Private driver/chauffeur.
5. Business/corporate ride.
6. Airport transfer.
7. Inter-city ride.
8. Round trip.
9. Multi-stop passenger ride.
10. Scheduled passenger ride.
11. Recurring school transport.
12. Senior assistance.
13. Medical/PWD transport.
14. Tourism/event/nightlife.
15. Rental with driver.
16. Shared/pooled ride.
17. Parcel bike/scooter/car.
18. Courier and food delivery.
19. Cargo van.
20. Cargo truck.
21. Multi-stop delivery route.
22. Fleet/partner contract work.

Each policy must define:

- Mandatory rules.
- Allowed vehicle classes.
- Required certifications and capabilities.
- Candidate indexes.
- Search radiuses.
- Route-matrix limit.
- Scoring weights.
- Offer wave sizes and timeouts.
- Location freshness.
- Energy reserve.
- Schedule lead time.
- Allowed fallbacks.
- Requirements that may never be relaxed.
- Substitution rules.

Add JSON-schema or equivalent validation and golden test fixtures. Policies must be pinned to requests and recorded on assignments.

## EV range implementation

For electric dispatch units implement:

```text
required range =
  distance to pickup
  + complete request route
  + expected detour/stops
  + distance to a safe compatible charger or operating base
  + reserve
```

Use the greater of configured percentage reserve, fixed reserve, and charger contingency. Re-evaluate before offer, on acceptance, before shared insertion, at scheduled activation, and after material route change.

Exclude charging vehicles from immediate dispatch unless a scheduled policy explicitly supports availability after charging and the completion estimate is reliable.

## Shared rides

Implement shared rides using one trip session with several rider bookings and ordered pickup/dropoff stops.

The insertion algorithm must check:

- Pickup before corresponding dropoff.
- Seat occupancy on every segment.
- Added vehicle time.
- Existing-passenger detour.
- New-passenger wait.
- Pickup and arrival windows.
- Driver shift.
- EV range.
- Route direction and maximum detour policy.

Use route-version locking or optimistic concurrency so simultaneous insertions cannot corrupt the route. Recompute when the route version changes.

## Delivery and cargo routing

Implement single-order delivery matching and a route optimizer abstraction for multi-order work. Support:

- Weight and volume constraints.
- Package category and restricted goods.
- Pickup-delivery precedence.
- Same-vehicle constraint.
- Time windows.
- Loading/unloading service duration.
- Vehicle/road restrictions.
- Driver shift limits.
- Optional equipment such as insulation, refrigeration, partition, large trunk, or lifting equipment.
- QR/photo verification and replay protection.
- Route re-optimization with stability penalties.

Use OR-Tools or the repository's existing equivalent behind an adapter. Apply a strict solver time budget and accept only feasible solutions.

## Scheduled and school dispatch

Implement a scheduler worker that:

- Generates concrete requests from recurrence templates.
- Activates matching at configured lead times.
- Preselects eligible pools.
- Sends reservation offers.
- Rechecks driver, vehicle, location, traffic, compliance, shift, and EV range before pickup.
- Keeps backup candidates.
- Reassigns at-risk reservations.
- Prevents conflicting immediate jobs.

School transport must require approval, child-safety qualifications, vehicle capacity, authorized roster/route, and schedule continuity. Never mix unrelated passengers into a school route.

## Offer manager

Implement short, controlled offer waves. Initial defaults:

```text
standard instant: 1 driver for 8-12 seconds, then 2, then 3
premium/private:  1 driver for 10-15 seconds
medical/PWD:      qualified drivers only, 10-15 seconds
scheduled:        policy-specific longer confirmation
shared insertion: only after route feasibility
complex delivery: policy-specific longer window
```

Use an expiring Redis lease to reduce conflicting offers, but never depend on it for final correctness. Persist every offer before or atomically with publication. Expire offers through a worker and continue matching when appropriate.

Protect rider privacy in pre-accept offer payloads.

## Atomic acceptance

Implement a single durable transaction that locks and validates:

- Service request.
- Offer.
- Dispatch unit.
- Any shared trip session/route version when applicable.

The transaction must:

- Confirm the request is still searching/offering and unassigned.
- Confirm the offer is pending, belongs to the authenticated driver, and is not expired.
- Confirm the dispatch unit is available and has no active conflicting request.
- Re-evaluate time-sensitive critical eligibility facts.
- Reserve the dispatch unit.
- Assign the request.
- Insert the assignment.
- Accept the winning offer.
- Cancel losing offers.
- Insert the outbox event.

Check affected row counts. Roll back on any failed guard.

Add database uniqueness constraints and concurrency tests. Redis locks alone are unacceptable.

## State machines

Implement explicit backend-owned transitions for:

### Dispatch unit

```text
OFFLINE -> AVAILABLE -> OFFERED -> RESERVED
-> EN_ROUTE_PICKUP -> WAITING -> ON_TRIP/ON_DELIVERY_ROUTE
-> AVAILABLE
```

With exceptional states:

```text
CHARGING
BREAK_REQUIRED
DOCUMENT_BLOCKED
SUSPENDED
```

### Request

```text
CREATED -> SCHEDULED/SEARCHING -> OFFERING -> ASSIGNED
-> DRIVER_EN_ROUTE -> ARRIVED -> ACTIVE -> COMPLETED
```

Terminal alternatives:

```text
CANCELLED
NO_QUALIFIED_DRIVER
EXPIRED
```

### Offer

```text
PENDING -> ACCEPTED/DECLINED/EXPIRED/CANCELLED/LOST_RACE
```

Reject invalid transitions consistently and test them.

## Arrival, OTP, QR, cancellation, and no-show

Implement:

- Configurable arrival geofence and GPS accuracy checks.
- Audited outside-geofence override where product policy permits it.
- Server-generated rider OTP, protected storage, attempt limits, and binding to request/driver/time.
- Package QR binding, replay prevention, assigned-driver verification, scan location, and fallback evidence flow.
- Waiting timer that starts only after validated arrival.
- Configurable no-show grace period.
- Structured cancellation reasons and required comments for safety/behavior/other categories.
- Transaction-safe cancellation versus acceptance.
- Change-driver flow with previous-driver exclusion and rematch count.
- Driver disconnect and stale-assignment recovery.

## APIs

Implement or adapt versioned APIs for:

- Active vehicle selection.
- Go online/offline.
- Location updates.
- Create/get/cancel/reschedule service request.
- Active offers.
- Accept/decline offer.
- Arrival.
- OTP verification.
- Trip start, stop arrival/completion, trip completion, cancellation.
- Delivery pickup/delivery QR verification and confirmation.
- Admin policy validation/creation/activation/retirement.
- Admin decision-trace retrieval.

Use a consistent error envelope and the error codes in the specification. Document APIs using the repository's OpenAPI/Swagger mechanism.

## Real-time events and notifications

Implement versioned WebSocket or equivalent real-time events for:

- Searching.
- Offer creation/expiry.
- Assignment.
- Driver location.
- Driver en route/arrived.
- Trip start/progress/completion.
- Cancellation and no-driver result.

Use FCM/APNs as wake-up and fallback only. On reconnect, clients fetch authoritative state and reconcile by version/sequence.

## Transactional outbox

Every important state-changing transaction must insert an outbox event in the same database transaction. Implement an idempotent publisher worker using safe row claiming such as `FOR UPDATE SKIP LOCKED` where supported.

Consumers must deduplicate by `event_id`. Add retries with exponential backoff and an operator-visible failed state/dead-letter path.

## Decision trace and audit

Persist enough information to explain every match:

- Policy version.
- Search rounds and radiuses.
- Candidate and eligible counts.
- Exclusion reason counts.
- ETA source and fallback state.
- Top candidate score components.
- Selected dispatch unit.
- Offer waves.
- Assignment transaction result.
- Overrides and support actions.

Redact unnecessary PII.

## Security and privacy

Implement:

- Strong authorization on every driver, fleet, request, trip, and admin operation.
- Rate limits for request creation, online/offline toggling, accept, OTP, QR, cancellation, and change-driver actions.
- Pre-accept location/privacy minimization.
- OTP/QR replay protection.
- PII-safe structured logs.
- Secrets through existing secret management.
- Admin policy audit trail.
- GPS spoofing/risk hooks.

## Reliability and degradation

Implement tested fallback behavior:

- Redis unavailable -> recent PostGIS fallback.
- Route provider unavailable -> cached/conservative approximate ETA with penalty.
- WebSocket unavailable -> push plus state refresh.
- Event publisher unavailable -> outbox retains events.
- Worker crash -> durable request/offer recovery.
- Redis restart -> rebuild live indexes.
- Duplicate mobile request -> idempotent original response.
- Stale GPS -> exclude candidate.
- Optimizer timeout -> best feasible result or safe heuristic.

Do not finalize new assignments when the durable transactional database is unavailable.

## Observability

Use the repository's observability stack; add OpenTelemetry-compatible tracing if absent. Propagate:

```text
trace_id
request_id
offer_id
assignment_id
dispatch_unit_id
trip_session_id
policy_version
```

Add metrics for:

- Location-ingestion latency.
- Geo search latency.
- Eligibility latency.
- Route-matrix latency.
- Ranking latency.
- First-offer latency.
- Assignment latency.
- Candidate and eligible counts.
- No-qualified-driver rate.
- Acceptance/timeout/cancellation/reassignment rates.
- Pickup ETA versus actual pickup time.
- Duplicate-assignment attempts and successes.
- Route-version conflicts.
- Outbox backlog.

Successful duplicate assignments must always remain zero and trigger a critical alert if detected.

## Performance targets

Design and test toward:

```text
location ingestion p95:       under 100 ms server processing
Redis candidate lookup p95:   under 50 ms
first offer dispatched p95:   under 1 second
acceptance transaction p95:   under 150 ms
state propagation p95:        under 500 ms
duplicate assignment success: zero
```

Use bounded queues, worker concurrency, route-provider limits, and backpressure. Never create unbounded offer fan-out.

## Testing requirements

Create and run:

### Unit tests

- Every eligibility rule and reason code.
- Scoring, normalization, tie-breakers, and fairness bounds.
- EV range.
- Schedule conflicts.
- State machines.
- Idempotency.
- Shared capacity across route segments.
- Delivery precedence and time windows.
- Policy validation.

### Golden policy fixtures

At minimum:

```text
ordinary car rejected for wheelchair-required request
qualified accessible vehicle accepted
unapproved driver rejected for school route
EV rejected for insufficient inter-city reserve
shared insertion rejected when detour exceeded
standard vehicle rejected for premium-only request
scooter rejected for overweight parcel
```

### Integration tests

Use real database/cache containers where possible:

- Request creation plus outbox.
- Redis GEO and stale cleanup.
- PostGIS fallback.
- Offer creation/expiry.
- Assignment transaction.
- Cancellation race.
- Scheduled activation.
- WebSocket event ordering.

### Concurrency tests

- Many drivers accept one request: one winner.
- One driver accepts two requests: at most one active assignment.
- Cancellation races acceptance: deterministic result.
- Two shared insertions race: valid route and no lost update.
- Duplicate idempotent accepts: same result.
- Expiry races acceptance: deterministic policy result.

### Load and failure tests

- Peak immediate rides.
- Morning school activation.
- Shared-ride insertion load.
- Large driver reconnect storm.
- Route-provider slowdown.
- Redis failure/rebuild.
- Matching-worker restart.
- WebSocket disconnect.

## Migration and rollout

Implement behind feature flags. Required sequence:

1. Add schema and indexes.
2. Backfill dispatch units and eligibility snapshots.
3. Dual-write live state where necessary.
4. Run the new matcher in shadow mode.
5. Compare selections and exclusions against the legacy path.
6. Canary one low-risk market/service.
7. Expand by service and market.
8. Keep rollback to the previous policy or matcher.
9. Remove legacy behavior only after evidence and approval.

Do not migrate active trips destructively. Pin in-progress requests to the behavior/version that created them unless a safe migration path is explicitly implemented.

## Configuration and environment documentation

Document every new configuration value, including:

- Redis keys/namespaces and connection.
- Database/PostGIS requirements.
- Route provider credentials, timeout, and quota controls.
- H3/grid resolution.
- Location freshness.
- Search radiuses and candidate limits.
- Offer timeouts/waves.
- Scheduled lead times.
- EV reserve.
- Shared detour limits.
- Worker concurrency.
- Outbox retry settings.
- WebSocket and push settings.
- Feature flags.
- Data retention.

Never commit production credentials.

## Required final output from you

After implementing, provide:

1. A concise repository audit and architecture mapping.
2. A list of all files added or changed.
3. Database migrations and how to apply/rollback them.
4. New configuration/environment variables.
5. API and event changes.
6. Policy files and how they are validated/activated.
7. Exact test/build/lint commands run and their actual results.
8. Performance or load-test results available in the environment.
9. Remaining genuine blockers, limited to items requiring external credentials, unavailable infrastructure, or unresolved product/legal approval.
10. A rollout and rollback procedure.

Do not claim completion when required code or tests are missing. Conversely, do not stop merely because the repository differs from the reference structure: adapt the design while preserving its guarantees.

## Definition of completion

The work is complete only when:

- The code builds and passes the available quality gates.
- Standard immediate matching works end to end.
- Policies exist for all EVzoneRide service categories.
- Safety and capability requirements are enforced before scoring.
- Offers expire and progress through waves.
- Acceptance is atomic and concurrency-tested.
- Redis live discovery and PostGIS fallback work.
- Scheduled, school, medical/PWD, inter-city, shared, delivery, fleet, and EV requirements have implemented paths or fully working policy-driven modules as defined by the specification.
- Events, observability, security, documentation, migrations, and rollout controls are present.
- No required production behavior is left as a TODO or placeholder.

Begin by reading the attached specification and auditing the repository. Then implement the complete system.
