# EVzone Ride Backend 10.0.0

Released: 23 June 2026

Version 10.0.0 is additive. It preserves the complete version 9 backend and introduces the universal driver-selection and dispatch foundation required to match requests against a complete dispatch unit rather than a bare driver ID.

## Universal dispatch additions

- Universal dispatch entities for qualifications, entitlements, vehicle capabilities, fleet rules, driver-vehicle assignments, shifts, schedules, dispatch units, service requests, ordered stops, requirements, offers, assignments, trip sessions, shared bookings, trip stops, policies, decision traces, exclusions, cancellations, idempotency, location signals and a transactional outbox.
- Full service taxonomy spanning passenger, delivery, school, medical/PWD, ambulance, tourism, rental-with-driver, shared ride, courier, food, cargo, partner, fleet-contract and scheduled-roster work.
- Versioned default dispatch policies with eligibility-before-ranking guarantees and prohibited-sensitive-attribute validation.
- Safety, compliance, capacity, accessibility, medical, school and EV-energy requirements remain non-relaxable.
- PostgreSQL or the configured transactionally equivalent durable database remains final assignment authority; Redis/PostGIS are acceleration and fallback layers.
- The complete implementation prompt and normative specification are packaged under `docs/specifications/`.

## Validation

The v10 package passes TypeScript compilation, zero-warning ESLint, all 16 Jest suites and 52 tests, fresh SQL.js startup and the live health/OpenAPI runtime probes.

---

# EVzone Ride Backend 9.0.0

Released: 21 June 2026

Version 9.0.0 preserves the complete version 8 backend and adds the production integration boundary required by the separately deployed CorporatePay backend and application. No Rider, Driver, Fleet Partner, Agent/Dispatcher, Agent Portal, Admin, School Fleet or service-domain capability was removed.

## CorporatePay partner additions

- Dedicated `/api/v1/corporate-pay/partner/*` API for capabilities, catalog, subject mapping, quotations, service requests, authorization, provisioning, status synchronization, cancellation, rebooking, receipts, evidence, disputes, refunds, reconciliation, sustainability metrics and durable events.
- HMAC-SHA256 partner authentication with canonical payload signing, timestamp validation, persisted nonce replay protection and sandbox API-key compatibility.
- Clear bounded-context ownership: CorporatePay remains authoritative for corporate identity, budgets, policies, approvals, wallets and invoicing; EVzone Ride remains authoritative for mobility/logistics quotes, bookings, dispatch, fulfilment, receipts and service evidence.
- Idempotent authorization-driven creation of existing EVzone service records and Agent/Dispatcher manual bookings across Ride Hailing, Deliveries, Car Rental, Tourist Vehicles, Ambulance and School Shuttle references.
- Corporate allocation dimensions including account, member, group, cost centre, budget, reservation, approval, policy, purchase order and external order identifiers.
- Refund execution, service disputes, fulfillment evidence, receipt generation, reconciliation exports and ESG summaries.
- Durable outbound event feed with acknowledgements and optional signed push delivery to CorporatePay.
- SQL.js-compatible entities, a PostgreSQL migration, automated tests, runtime smoke workflow and integration documentation.
- External School Shuttle CorporatePay payment bridging now uses the approved or quoted amount without requiring a duplicate local School booking; a regression test and dedicated live smoke workflow cover this boundary.

## Compatibility and preservation

- The full version 8 Admin Portal contract and `/admin` realtime namespace remain available.
- The complete Agent Portal, Agent/Dispatcher and manual-booking contracts remain available.
- Fleet Partner, Rider, Driver and School Fleet synchronization contracts remain available.
- Existing CorporatePay transaction/webhook adapters remain available alongside the new partner boundary.
- Ride Hailing, Deliveries, Tourist Vehicles, Ambulance, Car Rental and School Shuttle lifecycles remain intact.

## Validation

Final validation includes 16 Jest suites with 52 passing tests, ten live smoke workflows, HMAC replay rejection, clean-start, OpenAPI, archive-integrity and checksum checks. Exact results are recorded in `release-validation.json`, `docs/VALIDATION.md` and the external validation report packaged beside the ZIP.
