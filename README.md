# EVzone Ride Backend — Rides & Logistics

A complete NestJS backend for the EVzone mobility and logistics platform. **Version 10.0.0** preserves every version 9 capability and adds the universal dispatch-unit domain, safety-first policy catalogue, auditable decision data, concurrency-safe assignment schema, and transactional dispatch outbox foundation. It includes:

- Ride-hailing: on-demand, scheduled, round-trip, multi-stop, shared and inter-city rides.
- Deliveries: parcel quotes, receiver approval, driver assignment, QR pickup verification, live tracking and proof of delivery.
- Tourist vehicles: packages, custom itineraries, operators, vehicle/driver assignment and trip lifecycle.
- Ambulance: emergency/scheduled requests, priority pricing, nearest facilities, dispatch and medical transport lifecycle.
- Car rental: vehicle search, availability, quotes, deposits, booking approval, inspections, extensions and returns.
- Fleet Partner: multi-service fleet ownership, drivers, vehicles, assignments, maintenance, compliance, performance and school-shuttle fleet synchronization.
- Agent/Dispatcher: dispatch desks, agent permissions, shifts, customer creation, manual bookings, multi-service assignment and operational timelines.
- Administration: unified platform, organization, fleet, dispatch, integrations, payments, compliance, settings and audit oversight.
- CorporatePay integration: linked corporate identities and accounts, HMAC-authenticated partner APIs, quotations, authorization-driven booking, fulfilment evidence, disputes, refunds, reconciliation, ESG metrics and durable event delivery.
- Cross-platform capabilities: authentication, users, saved addresses/contacts, drivers, vehicles, documents, onboarding/KYC, pricing, promos, surge, wallets, encrypted stored payment methods, cashout approvals, notifications, chat, WebSockets, safety/SOS, trip sharing, support and file uploads.
- Production hardening: persisted idempotency, request correlation IDs, governance/risk queues, operational watchdogs, runtime feature flags, optional Redis Socket.IO scaling, geolocation adapters and canonical compatibility contracts.
- Report-driven infrastructure: PostGIS/Redis/Haversine location fallbacks, durable matching jobs, multi-stop delivery routes, double-entry accounting, Kafka/outbox events, Cloudinary/local storage, push devices, password recovery and namespaced realtime gateways.

The repository runs immediately with a local SQL.js database and local payment/notification adapters. PostgreSQL deployment is provided through Docker Compose.

## Version 10 universal dispatch additions

Version 10 introduces a single service-agnostic dispatch model for all ride, delivery, school, medical, tourism, rental-with-driver, courier, cargo, fleet and partner work. The matcher is designed around a dispatch unit combining the driver, active vehicle, qualifications, verified capabilities, compliance, fleet/partner relationship, shift and live state.

The additive schema includes dispatch certifications, entitlements, vehicle capabilities, fleet rules, assignments, shifts, schedules, dispatch units, normalized requests, ordered stops, requirements, offers, assignments, trip sessions, shared bookings, policy versions, decision traces, exclusions, cancellation records, idempotency records, location-risk signals and a transactional outbox. The normative prompt and implementation specification are included in `docs/specifications/`.

## Version 9 CorporatePay partner integration additions

CorporatePay remains a separately deployed backend and the financial system of record for corporate organizations, members, budgets, policies, approvals, wallets, invoices and collections. Version 9 adds the secure service-fulfilment boundary that lets CorporatePay purchase and monitor EVzone mobility and logistics services without duplicating either backend's ownership.

- Dedicated `/api/v1/corporate-pay/partner/*` contract for capabilities, service catalog, identity mapping, quotes, service requests, authorization, provisioning, status synchronization, cancellation and rebooking.
- HMAC-SHA256 server-to-server authentication over timestamp, nonce, HTTP method, full request path and canonical request-body hash, with clock-skew validation and persisted replay protection.
- Local sandbox API-key mode for immediate development, while remote/production mode requires signed partner requests.
- Corporate organization/member-to-EVzone organization/user mapping and automatic linked CorporatePay account creation.
- Authorization-driven, idempotent provisioning into EVzone's existing Agent/Dispatcher manual-booking and service lifecycles for rides, deliveries, rentals, tourist vehicles, ambulances and school-shuttle references.
- Fulfilment synchronization, sanitized service detail, receipts, proof/evidence records, dispute workflows, refund execution and rebooking.
- Reconciliation exports with cost-centre, budget, group, approval, policy, purchase-order and external-order dimensions.
- Sustainability/ESG summaries based on completed EVzone fulfilment and vehicle energy type.
- Durable outbound integration events with pull, acknowledgement and optional signed push delivery.
- PostgreSQL migration plus SQL.js-compatible local schema, focused automated tests and a runtime partner smoke workflow.

The integration boundary is documented in [`docs/CORPORATEPAY_APP_CONTRACT_AUDIT.md`](docs/CORPORATEPAY_APP_CONTRACT_AUDIT.md). A ready-to-run collection is included as [`EVzone-CorporatePay-Partner-v9.postman_collection.json`](EVzone-CorporatePay-Partner-v9.postman_collection.json).

## Version 8 Admin Portal application additions

- Complete Admin application contract for dashboards, users, riders, drivers, administrators, companies, approvals, risk, safety, pricing, taxes, policies, training, localization, integrations, payouts and analytics.
- Authenticated session hydration, password recovery compatibility, administrator self-service profile, settings and regional-access preferences.
- Granular role/permission definitions and Admin-compatible route protection without removing existing role-based controls.
- Service configuration and tariff management across Ride Hailing, Deliveries, Car Rental, Ambulance, Tourist Vehicles and School Shuttles.
- Pricing zones, geofences, vehicle categories, fare previews, promotions, experiments and feature flags.
- Company payout settings, CorporatePay visibility, financial analytics, risk/fraud queues, compliance approvals and audit history.
- Authenticated `/admin` Socket.IO events and compatibility endpoints for the attached Admin application.
- Dedicated Admin Portal runtime smoke workflow, source-to-contract audit and Postman collection.

The application-to-backend mapping is documented in [`docs/ADMIN_PORTAL_APP_CONTRACT_AUDIT.md`](docs/ADMIN_PORTAL_APP_CONTRACT_AUDIT.md).

## Version 7 Agent Portal application additions

- Complete `/api/v1/agent/*` portal contract for authentication, bootstrap, dashboards, analytics, profiles, preferences, tasks, drafts, chat, dispatch, manual bookings, live operations, onboarding review, support, safety, search, training, QA, teams, roles and shifts.
- Role-aware workspaces for Agent, Dispatcher, Support and Administrator users, with seeded `dispatch`, `support_t2` and `supervisor` role definitions and fine-grained permissions.
- Manual booking workflows for ride-hailing, deliveries, car rental, ambulance, tourist vehicles and school-shuttle references, while preserving all pre-existing Dispatcher APIs.
- Live operations views for service records, trips and drivers plus an authenticated `/agent` Socket.IO namespace for dashboard, task, support, safety, dispatch and notification updates.
- SLA-aware support queues, conversation history, ownership changes, escalation, status transitions and persisted Agent Portal tickets.
- Driver onboarding review queues with document review, verification decisions, rejection reasons and auditable actions.
- Safety and SOS queues with incident creation, acknowledgement, escalation, resolution and realtime administrative visibility.
- Agent tasks, resumable drafts, teams, shifts, check-in/check-out, role definitions, QA/coaching reviews, training modules, assessments, progress and certificates.
- Agent-facing global search, company/rider/driver profile hydration, analytics and supervisor controls.
- PostgreSQL migration and SQL.js-compatible schema for all new Agent Portal records, plus demo roles, teams, shifts, tasks and training content.
- Agent Portal Postman collection, source-to-contract audit, automated tests and dedicated runtime smoke workflow.

The application-to-backend mapping is documented in [`docs/AGENT_PORTAL_APP_CONTRACT_AUDIT.md`](docs/AGENT_PORTAL_APP_CONTRACT_AUDIT.md).

## Version 6 Fleet Partner application additions

- Complete `/api/v1/fleet/*` portal contract matching the attached Fleet Partner application, including profile, organizations, branches, drivers, vehicles, dispatches, rentals, tours, school shuttles, compliance, earnings, settings and rider-service visibility.
- OIDC/JWT coexistence: local EVzone JWT sessions remain supported while RS256/RS384/RS512 OIDC tokens are validated through discovery and JWKS caching.
- Just-in-time OIDC account, organization, membership, wallet and fleet-profile provisioning.
- Compatibility for the app's `evzone.principal`, `evzone_principal`, `fleet_roles`, `evzone.organizations`, `evzone_organizations`, `org_memberships` and tenant-style claim shapes.
- Multi-organization selection using `X-Organization-Id`; the identifier may be an internal organization ID, external OIDC organization ID, Fleet Profile ID or fleet code.
- Authenticated `/fleet` Socket.IO namespace with tenant rooms, automatic subscriptions, canonical events and the app's legacy aliases (`dispatch.create`, `dispatch.update`, `notification.new`).
- Fleet branches, portal/security/integration settings, role definitions, invitations, notifications and activity logs.
- Vehicle document, accessory and maintenance management with matching metadata for accessibility, school, rental, ambulance, delivery and tourism fleets.
- School-shuttle routes, students, attendance, feedback, trips, attendants, payments, safety records, rosters and reminders, while retaining the separate School App synchronization backend.
- Fleet-facing earnings summaries, payouts, statements, operational dashboards, map data, support cases and cross-service Rider requests.
- A PostgreSQL migration and SQL.js-compatible schema for all new Fleet Partner portal records.

The application-to-backend mapping is documented in [`docs/FLEET_PARTNER_APP_CONTRACT_AUDIT.md`](docs/FLEET_PARTNER_APP_CONTRACT_AUDIT.md).

## Version 5 mobile-app contract additions

- Versioned mobile bootstrap, public configuration and capability negotiation with minimum-app-version checks.
- Rider recent places, pinned places and saved-location usage tracking without replacing existing saved addresses.
- A unified, atomic driver job feed across rides, deliveries, tourist vehicles, ambulances, car rentals and school shuttles.
- Structured driver service preferences, interaction preferences, schedules and pickup-distance settings.
- Driver learning modules, assessment attempts, progress, certificates and public certificate verification.
- Generic cross-service reviews, responses, reporting, moderation and rating summaries.
- Rental branches, vehicle-class discovery and custom rental requests with partner quotations.
- Mobile device registration aliases and stable Socket.IO namespace discovery.
- PostgreSQL migration support for the seven new persistent models, while SQL.js remains zero-setup locally.
- Compatibility-safe routes: legacy Rider and Driver APIs remain available and no version 4 route was removed.

The application analysis and endpoint mapping are documented in [`docs/MOBILE_APP_CONTRACT_AUDIT.md`](docs/MOBILE_APP_CONTRACT_AUDIT.md).

## Version 4 production additions

- Durable matching jobs, expiring offers, search-radius expansion and redispatch.
- PostGIS-first driver discovery with Redis GEO and Haversine fallbacks.
- Multi-order delivery routes with sequenced stops, QR pickup and OTP drop-off verification.
- Double-entry accounting, trial-balance checks and a dedicated earnings ledger.
- Kafka domain events with durable database outbox and console fallback.
- Cloudinary storage with local filesystem fallback.
- Push-device registration with Firebase-compatible delivery and local fallback.
- OTP-based password recovery with short-lived reset tokens.
- JWT-authenticated `/driver`, `/rider` and `/admin` Socket.IO namespaces, while retaining `/realtime` compatibility.
- Two-party temporary trip pauses, safety events and infrastructure status endpoints.

Versions 3 and 4 compatibility, idempotency, governance, onboarding, cashout, commutes, durable dispatch and watchdog capabilities remain intact. See [`docs/LEGACY_TRANSFER_MATRIX.md`](docs/LEGACY_TRANSFER_MATRIX.md) and [`docs/VALIDATION.md`](docs/VALIDATION.md).

## Start immediately

### Option A — local, no database setup

Requirements: Node.js 20+ and npm.

```bash
npm ci
npm run start:dev
```

One-command launchers are also included:

```bash
./start-local.sh          # macOS/Linux
./start-local.ps1         # PowerShell
```

The API creates `data/evzone.sqlite`, synchronizes its schema and loads demo data automatically.

- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs-json`
- Health: `http://localhost:3000/api/v1/health`
- Socket.IO namespaces: `/realtime`, `/driver`, `/rider`, `/fleet`, `/agent` and `/admin`

### Option B — Docker + PostgreSQL

```bash
docker compose up --build
```

No file changes are required. The compose stack creates PostgreSQL, starts the API, synchronizes the schema and seeds demo data.

## Demo accounts

All demo accounts use password `Password123!`.

| Role                           | Email                           |
| ------------------------------ | ------------------------------- |
| Rider/customer                 | `rider@evzone.local`            |
| Ride-hailing driver            | `driver@evzone.local`           |
| Delivery driver                | `delivery.driver@evzone.local`  |
| Ambulance driver               | `ambulance.driver@evzone.local` |
| Tourist driver                 | `tour.driver@evzone.local`      |
| Fleet Partner owner            | `fleet.partner@evzone.local`    |
| Agent / manual booking officer | `agent@evzone.local`            |
| Dispatcher / dispatch manager  | `dispatcher@evzone.local`       |
| School-shuttle driver          | `school.driver@evzone.local`    |
| Tour operator                  | `tour.operator@evzone.local`    |
| Rental partner                 | `rental.partner@evzone.local`   |
| Administrator                  | `admin@evzone.local`            |

Login example:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"rider@evzone.local","password":"Password123!"}'
```

Use the returned access token as `Authorization: Bearer <token>`.

## Included modules

### Identity and customer profile

- Registration and email/phone login.
- JWT access tokens and rotating opaque refresh tokens.
- OTP request/verification with a development response adapter.
- Password change, logout and token revocation.
- User profile, saved addresses, saved contacts and emergency contacts.
- Structured ride/service preferences.
- Role-based access control and account suspension.

### Driver and fleet operations

- Driver onboarding and verification status.
- Driver/vehicle document upload and review workflows.
- Online, offline, busy and paused availability states.
- GPS location updates, online sessions and driving-hour limits.
- Vehicle CRUD, active-vehicle switching, accessories and service capabilities.
- Driver dashboards, earnings, weekly goals and training progress.
- Ride, delivery, tourist and ambulance service capabilities.

### Fleet Partner platform

- Fleet Partner web-portal API rooted at `/api/v1/fleet`, with an authenticated `/fleet` realtime namespace.
- Organization onboarding, OIDC federation, multi-organization selection, approval status, ownership and member permissions.
- One fleet can manage vehicles and drivers across ride-hailing, deliveries, car rental, ambulance, tourist vehicles and school shuttles.
- Fleet asset linking, activation/suspension, capabilities, external IDs and school-managed flags.
- Driver/vehicle assignments, service linkage, shift windows and assignment status.
- Maintenance scheduling, costs, attachments and overdue compliance alerts.
- Operational dashboard covering assets, active services, assignments, maintenance, school integration and paid volume.
- School App integration through encrypted connection credentials, HMAC-signed webhooks, inbound/outbound/bidirectional synchronization, mirrored resources and sync-job history.

### Agent and Dispatcher platform

- Dedicated Agent Portal REST API rooted at `/api/v1/agent` and authenticated realtime namespace at `/agent`.
- Portal login, refresh, logout, password recovery, profile hydration and mandatory-training gate support.
- Role-aware dashboards for Agent, Dispatcher, Support and Administrator users.
- Multi-desk operations with service capabilities, zones, timezone and desk settings.
- Agent/dispatcher profiles with granular permissions for manual booking, assignment, price override, refunds, support, onboarding and safety workflows.
- Manual customer resolution by EVzone user ID, phone or email; a shadow customer account is created when necessary.
- Manual bookings provision a real underlying ride, delivery, tourist booking, ambulance request or rental booking; school-shuttle jobs can reference the School backend trip ID.
- Assignment to verified fleet drivers and vehicles with capability checks.
- Internal/customer notes, cancellation, service-status synchronization, audit timeline and real-time update events.
- Live operations map, cross-service detail views and driver/rider/company profile hydration.
- Persisted tasks, resumable drafts, team chat, notifications and global search.
- Support tickets with SLA status, messages, assignment, escalation and resolution actions.
- Driver onboarding queues, document decisions and auditable approval/rejection actions.
- Safety/SOS incident queues with acknowledgement, escalation and resolution.
- Training modules, assessments, progress, certificates, QA/coaching reviews, teams, roles and shifts.
- Dispatch shifts, check-in/check-out and dashboard metrics by service, priority and lifecycle status.

### CorporatePay integration

CorporatePay remains a separate backend. This backend contains a complete adapter and local mirror needed to work with it:

- Organization or user account linking and spending limits.
- Idempotent service payment intents linked to EVzone's payment record.
- Working local sandbox with automatic approval by default, requiring no external service.
- Remote REST adapter, signed requests, signed webhook verification and event deduplication.
- Paid/declined/failed/refunded state synchronization into the underlying service.
- Refunds, settlement reconciliation, variance review and a retryable integration outbox.
- HMAC-authenticated partner endpoints for CorporatePay-originated quotes, authorized bookings, status synchronization, receipts, evidence, disputes, ESG reporting and event acknowledgement.

### Ride-hailing

- Fare estimates with distance, time, extras, promos and surge.
- Immediate or scheduled requests.
- One-way, round-trip and up to six stops.
- Personal/contact/manual beneficiary bookings.
- Standard, premium, airport, school, event, senior and medical/PWD categories.
- Nearby verified driver matching and expiring ride offers.
- Driver accept/reject, navigation, arrival, waiting and no-show handling.
- Six-digit rider verification code before trip start.
- Live trip location/events over Socket.IO.
- Shared passenger allocation and fare shares.
- Cancellation/rescheduling with state validation.
- Final fare, payment, driver earnings, tips and feedback.
- Ride history, upcoming/past filtering and shareable trip proof.

### Deliveries

- Bike, EV, truck, courier and food delivery modes.
- Package size, weight, declared value, fragile handling and item manifests.
- Immediate or scheduled pickup.
- Sender/receiver details and optional receiver acceptance.
- Tracking codes and public tracking.
- Driver matching, assignment and delivery state machine.
- QR token pickup verification and proof-of-delivery URL.
- Pickup/drop-off stop timeline and location events.
- Tracking invitations: accept, reject and withdraw.
- Delivery cancellation, payment, tips and feedback.

### Tourist vehicles

- Public tour package catalogue.
- Operator package management.
- Package-based or custom-distance quote.
- Passenger count, language, itinerary and preferences.
- Vehicle/driver assignment by tour operator.
- Driver accept, start and complete lifecycle.
- Cancellation and payment integration.

### Ambulance

- Medical facility directory and nearest-facility lookup.
- Criticality levels: low, moderate, high and critical.
- Medical needs, patient details and consent flags.
- Immediate or scheduled requests.
- Automatic matching or dispatcher-controlled assignment.
- Ambulance driver accept, arrive, start and complete lifecycle.
- Emergency events, status history and payment/insurance support.

### Car rental

- Search active rental vehicles by dates, type and seat count.
- Availability conflict checks and rental blocks.
- Daily rate, included kilometres, excess-kilometre rate, deposit and optional driver.
- Partner approval/rejection.
- Pickup and return inspections with odometer, battery/fuel, photos and damages.
- Rental activation, extension, return and completion.
- Damage/final-charge calculation and payment state.

### Platform services

- Rule-based pricing for every service.
- Promos, per-user limits and redemption records.
- Surge zones and multipliers.
- EVzone wallet, top-up, transfer, payout and transaction ledger.
- Local payment intent/confirm/refund adapter for cash, wallet, card, mobile money, bank transfer and insurance.
- In-app notifications and read/unread state.
- One-to-one/service-linked chat threads and messages.
- Socket.IO user/service rooms and real-time updates.
- Local file upload storage served from `/uploads`.
- SOS/emergency incidents, map reports, Follow My Ride links and proof of trip status.
- Support tickets with threaded messages and support assignment.
- Admin dashboard, user status, document reviews, vehicle reviews and audit logs.
- Rate limiting, Helmet security headers, validation, CORS, structured error responses and response envelopes.

## Core endpoint groups

The canonical contract is in [`docs/openapi.json`](docs/openapi.json) and the live Swagger UI.

| Prefix                                   | Purpose                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `/auth`                                  | Registration, login, refresh, OTP and password operations                     |
| `/users`                                 | Profile, addresses, contacts and preferences                                  |
| `/drivers`                               | Driver onboarding, availability, location, dashboard, goals and training      |
| `/vehicles`                              | Vehicles, documents, accessories and active vehicle                           |
| `/pricing`                               | Quotes and admin pricing rules                                                |
| `/rides`                                 | Rider and driver ride-hailing flows                                           |
| `/deliveries`                            | Delivery ordering, tracking, driver flow and invitations                      |
| `/tourist`                               | Tour packages and tourist vehicle bookings                                    |
| `/ambulance`                             | Facilities, estimates, emergency transport and dispatch                       |
| `/rentals`                               | Rental search, bookings, inspections and returns                              |
| `/wallets`                               | Wallet balances, transactions, top-up, transfer and withdrawal                |
| `/payments`                              | Payment intents, confirmation, history and refunds                            |
| `/organizations`                         | Business organizations, members, invitations and approvals                    |
| `/fleet-partners`                        | Fleet assets, assignments, maintenance, compliance and school synchronization |
| `/dispatch`                              | Agent/dispatcher desks, shifts, manual bookings and assignments               |
| `/corporate-pay`                         | CorporatePay accounts, transactions, webhooks, refunds and reconciliation     |
| `/notifications`                         | Notification inbox and read state                                             |
| `/chat`                                  | Service-linked chat threads and messages                                      |
| `/files`                                 | Authenticated multipart upload and file metadata                              |
| `/safety`                                | SOS, emergency assistance, trip shares, proof and support                     |
| `/admin`                                 | Operations dashboard, compliance and audit logs                               |
| `/compat`                                | Machine-readable client contracts, runtime flags and compatible sign-in       |
| `/riders/me`, `/drivers/me`, `/fleet/me` | Canonical application compatibility aliases                                   |
| `/commutes`                              | Reusable Rider commute schedules and one-tap booking                          |
| `/onboarding`                            | Partner/driver applications, checklists and review workflow                   |
| `/payment-methods`, `/cashouts`          | Encrypted provider methods and cashout approval                               |
| `/governance`                            | Feature flags, approvals, risk cases, configuration and alerts                |
| `/operations/watchdog`                   | Watchdog status and administrative execution                                  |
| `/geo`                                   | Places, reverse geocoding, route estimates and geofence checks                |

## Real-time events

The backend exposes JWT-authenticated namespaces for each operational client:

- `/driver` for location heartbeats, job offers and driver actions.
- `/rider` for live tracking, booking status and delivery updates.
- `/admin` for operations, safety and infrastructure alerts.
- `/realtime` as the retained compatibility gateway for existing clients.

Pass the JWT through the Socket.IO handshake:

```js
io('http://localhost:3000/rider', {
  auth: { token: accessToken },
});
```

Clients subscribe to authorized trip or service rooms after connecting and again after reconnecting. Server event families include new job offers, matching updates, location changes, status transitions, chat messages, payments, notifications and safety incidents. Multi-replica broadcasting uses the Redis adapter when configured and falls back to in-process delivery for a single replica.

## Configuration

A working `.env` is included. Important variables:

| Variable                         | Default                 | Purpose                                                  |
| -------------------------------- | ----------------------- | -------------------------------------------------------- |
| `DB_TYPE`                        | `postgres`              | PostgreSQL only (`postgres`)                             |
| `DATABASE_URL`                   | local PostgreSQL URL    | PostgreSQL connection                                    |
| `DB_SYNCHRONIZE`                 | `false`                 | Must be `false` in production; migrations are required   |
| `SEED_DEMO`                      | `true`                  | Load demo users, drivers, vehicles and pricing           |
| `JWT_SECRET`                     | included local secret   | JWT signing secret                                       |
| `JWT_ACCESS_TTL`                 | `15m`                   | Access token lifetime                                    |
| `JWT_REFRESH_TTL_DAYS`           | `30`                    | Refresh token lifetime                                   |
| `MATCH_RADIUS_KM`                | `25`                    | Driver matching radius                                   |
| `OFFER_TTL_SECONDS`              | `120`                   | Driver offer timeout                                     |
| `MAX_DAILY_DRIVING_MINUTES`      | `600`                   | Driving-hour safety limit                                |
| `STORAGE_PATH`                   | `./storage`             | Uploaded file directory                                  |
| `CORS_ORIGINS`                   | `*`                     | Allowed web/mobile origins                               |
| `CORPORATEPAY_MODE`              | `sandbox`               | `sandbox` or `remote` CorporatePay adapter               |
| `CORPORATEPAY_MOCK_AUTO_APPROVE` | `true`                  | Auto-settle sandbox CorporatePay transactions            |
| `CORPORATEPAY_BASE_URL`          | empty                   | Remote CorporatePay API base URL                         |
| `CORPORATEPAY_API_KEY`           | empty                   | Remote CorporatePay API credential                       |
| `CORPORATEPAY_WEBHOOK_SECRET`    | included local secret   | HMAC verification for CorporatePay callbacks             |
| `CORPORATEPAY_PARTNER_CLIENT_ID` | `corporatepay`          | Expected CorporatePay server client identifier            |
| `CORPORATEPAY_PARTNER_SHARED_SECRET` | included local secret | HMAC secret for signed partner requests                 |
| `CORPORATEPAY_PARTNER_API_KEY`   | included local key      | Sandbox-only partner API key                              |
| `CORPORATEPAY_PARTNER_ALLOW_API_KEY_ONLY` | `true`       | Allow simple API-key auth outside remote mode             |
| `SCHOOL_WEBHOOK_SECRET`          | included local secret   | HMAC verification for School App callbacks               |
| `INTEGRATION_ENCRYPTION_KEY`     | included local key      | Encrypt stored School integration credentials            |
| `API_PUBLIC_URL`                 | `http://localhost:3000` | Callback URL advertised to external services             |
| `IDEMPOTENCY_TTL_SECONDS`        | `86400`                 | Retention for persisted idempotency records              |
| `GEO_LOOKUP_BASE_URL`            | Nominatim               | Place/reverse-geocode provider                           |
| `ROUTE_LOOKUP_BASE_URL`          | OSRM                    | Route provider; deterministic fallback remains available |
| `REDIS_SOCKET_ADAPTER_ENABLED`   | `false`                 | Enable Redis-backed Socket.IO scaling                    |
| `REDIS_URL`                      | empty                   | Redis cache, GEO index and Socket.IO adapter URL         |
| `REDIS_DISABLED`                 | `false`                 | Force deterministic in-memory fallback                   |
| `KAFKA_DISABLED`                 | `true`                  | Disable Kafka and use durable outbox/console fallback    |
| `KAFKA_BROKERS`                  | empty                   | Comma-separated Kafka brokers                            |
| `CLOUDINARY_DISABLED`            | `true`                  | Use local storage instead of Cloudinary                  |
| `FIREBASE_SERVICE_ACCOUNT_JSON`  | empty                   | Firebase service-account JSON for push delivery          |
| `OPERATIONS_WATCHDOG_ENABLED`    | `true`                  | Run operational timeout and expiry checks                |
| `CASHOUT_AUTO_APPROVE`           | `false`                 | Require Admin review for cashout requests                |

For a public production deployment, replace the included secrets, set explicit CORS origins, set `DB_SYNCHRONIZE=false`, use controlled migrations, connect real payment/SMS/push/map adapters and place the API behind TLS.

## Local integration adapters

The repository is executable without vendor credentials:

- Payments other than wallet/cash are confirmed by the local adapter outside production.
- Wallet top-up uses the local ledger.
- OTP is generated and returned in development responses.
- Notifications are stored in-app and also emitted over Socket.IO.
- Uploads use local persistent storage.
- Place and route lookup use Nominatim/OSRM when available; route estimation falls back to deterministic geospatial calculations.
- CorporatePay runs in an auto-approving local sandbox unless `CORPORATEPAY_MODE=remote`.
- School fleet synchronization runs in a local sandbox when a connection has no remote `baseUrl`.

The domain services isolate these boundaries so production adapters can replace them without changing booking controllers or state machines.

## Commands

```bash
npm run build       # Compile TypeScript
npm test            # Unit tests
npm run test:cov    # Coverage
npm run lint        # ESLint
npm run format      # Prettier
npm run start:dev   # Watch mode
npm run start:prod  # Run compiled API
npm run smoke       # Health, authentication and quote smoke check
npm run smoke:platform # Fleet, manual booking, CorporatePay, dispatch and School sync
npm run smoke:hardening # Compatibility, idempotency, onboarding and watchdogs
npm run smoke:report-upgrade # Infrastructure fallback and accounting checks
npm run smoke:report # Full report-specific delivery/payment/ledger lifecycle
npm run smoke:fleet # Fleet Partner application contract
npm run smoke:agent # Agent Portal application contract
npm run smoke:admin # Admin Portal application contract
npm run smoke:corporatepay # CorporatePay partner ride lifecycle
npm run smoke:corporatepay:school # CorporatePay external School Shuttle bridge
```

Equivalent Make targets are available: `make dev`, `make build`, `make test`, `make docker-up`.

## Data and state integrity

- UUID primary keys throughout.
- Soft deletion on platform entities.
- Indexed identifiers, tracking codes, plate numbers and tokens.
- Explicit booking state transitions and cancellation guards.
- Refresh and verification secrets stored as hashes.
- Persisted global request idempotency plus payment-specific idempotency keys.
- Correlation IDs in success responses, errors and audit events.
- Wallet ledger with post-transaction balance.
- Double-entry accounting with trial-balance verification and earnings ledger.
- Audit records for mutating HTTP operations.
- Provider payment tokens encrypted at rest and excluded from API responses.
- Operational watchdog alerts for stale or stuck records.
- Paginated list responses.
- UTC timestamps; application default timezone is Africa/Kampala.
- UGX is the default currency, with per-user currency fields.

## Project layout

```text
src/
  accounting/     double-entry journal, trial balance and earnings ledger
  admin/          unified operations, settings, integrations and compliance
  ambulance/      ambulance request/dispatch
  auth/           JWT, refresh and OTP
  chat/           service-linked messaging
  common/         guards, filters, encryption utilities and enums
  commutes/       reusable Rider routes and schedules
  compatibility/ canonical client contracts and alias APIs
  corporate-pay/  CorporatePay adapter, webhooks and reconciliation
  database/       TypeORM entities, configuration and comprehensive demo seed
  deliveries/     parcel logistics lifecycle
  dispatch/       agent, dispatcher and manual booking operations
  drivers/        onboarding, presence and earnings
  files/          upload storage
  financial-operations/ stored methods and cashout approvals
  geolocation/     places, routing and geofences
  governance/      flags, approvals, risk and operational alerts
  idempotency/     persisted mutation replay protection
  infrastructure/  Redis, Kafka/outbox and runtime provider status
  matching/        durable dispatch jobs and expiring driver offers
  fleet-partners/ multi-service fleet and School App synchronization
  health/         liveness/readiness
  notifications/  inbox and event notifications
  onboarding/     applications, checklist and user documents
  operations/     watchdog automation
  organizations/  organization tenancy and membership
  payments/       service payment orchestration
  pricing/        fares, promos and surge
  realtime/       Socket.IO gateway
  rentals/        car-rental lifecycle
  rides/          ride-hailing lifecycle
  safety/         SOS, sharing, proof and support
  tourist/        tourist vehicles and packages
  users/          profile and saved data
  vehicles/       fleet and compliance
  wallets/        ledger, transfer and payout
```

Additional detail is available in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API_FLOWS.md`](docs/API_FLOWS.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/VALIDATION.md`](docs/VALIDATION.md).
