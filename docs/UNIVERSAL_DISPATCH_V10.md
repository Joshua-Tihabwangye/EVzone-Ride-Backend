# EVzone Ride Backend v10 — Universal Dispatch

Version 10 preserves the complete v9 backend and adds an additive universal-dispatch foundation based on a runtime dispatch unit rather than a bare driver identifier.

A dispatch unit combines the driver, active vehicle, qualifications, vehicle capabilities, compliance, fleet or partner relationship, shift state, live availability, location, and EV energy state. The added TypeORM model covers certifications, service entitlements, vehicle capabilities, fleet rules, driver-vehicle assignments, shifts, schedules, dispatch units, normalized service requests, ordered stops, requirements, offers, assignments, trip sessions, shared bookings, route stops, policy versions, decision traces, exclusions, cancellation records, idempotency records, location signals, and transactional outbox events.

The default policy catalogue supports standard, premium, private-driver, business, airport, inter-city, tourism, nightlife, senior, medical/PWD, ambulance, school, rental-with-driver, shared, parcel, courier, food, cargo, partner, fleet-contract, and scheduled-roster services. Policy validation rejects sensitive attributes and prevents safety, compliance, capacity, school, medical, accessibility, and energy requirements from being relaxed.

PostgreSQL or the configured transactionally equivalent durable database remains assignment authority. Redis and PostGIS are acceleration and fallback layers, not ownership authorities. Existing v9 Rider, Driver, Fleet Partner, Agent/Dispatcher, Admin, CorporatePay, deliveries, rentals, tourism, ambulance, school-fleet, accounting, realtime, notification, and operational modules remain intact.

The normative implementation documents are included under `docs/specifications/`.
