---
pagetitle: "EVzoneRide Universal Driver Dispatch Backend Implementation Specification"
lang: en
---

<div class="cover">

# EVzoneRide Universal Driver Dispatch Backend Implementation Specification

## Production-ready design for fast, safe, fair, and extensible driver selection

**Version:** 1.0  
**Status:** Implementation baseline  
**Prepared for:** EVzoneRide Backend Engineering  
**Date:** 23 June 2026  
**Primary operating timezone:** Africa/Kampala  

This specification consolidates the complete driver-selection and dispatch design for EVzoneRide. It is intended to be used directly by backend engineers and coding agents when implementing the system in an existing codebase.

</div>

<div class="page-break"></div>

# Document control

| Item | Value |
|---|---|
| Document purpose | Define the complete backend design for selecting, offering, assigning, and managing drivers and vehicles across all EVzoneRide services. |
| Source product artifacts | `Ride Hailing- Rider.pptx`, `Ride Hailing- Driver.pptx`, and `EVzone Colours.pdf`. |
| Source design decisions | The universal dispatch-unit model, eligibility-first matching, ETA-based ranking, policy-driven service handling, Redis live-state indexing, PostgreSQL assignment authority, and route optimization described in the EVzoneRide planning discussion. |
| Intended readers | Backend engineers, solution architects, QA engineers, DevOps/SRE, mobile integration engineers, data teams, safety/compliance teams, and implementation agents. |
| Required outcome | A working dispatch system with no duplicate assignments, low matching latency, full auditability, configurable service policies, and safe support for every EVzoneRide driver and vehicle category. |
| Change policy | All matching rules and score weights must be versioned. Any production change must be measurable, reversible, and attributable to a policy version. |

# Table of contents

The PDF version contains a generated table of contents. The Markdown headings are also suitable for repository navigation and documentation sites.

# 1. Executive summary

EVzoneRide must use **one universal dispatch engine** rather than separate matching systems for every ride or delivery category. The engine does not match a request to a bare `driver_id`. It matches a request to a **dispatch unit**:

```text
Dispatch Unit =
    Driver
  + Active Vehicle
  + Driver Qualifications
  + Vehicle Capabilities
  + Compliance State
  + Fleet/Partner Relationship
  + Current Shift
  + Live Location and Availability
```

This model supports all EVzoneRide operating categories without rewriting the core matcher:

- EV scooters, motorcycles, bicycles, mini cars, sedans, SUVs, minivans, premium vehicles, buses, vans, trucks, and other approved vehicle classes.
- Individual drivers, private drivers, chauffeurs, partner drivers, business/fleet drivers, school drivers, inter-city drivers, medical/PWD drivers, delivery riders, and couriers.
- Instant rides, scheduled rides, round trips, multi-stop trips, airport transfers, inter-city trips, school transport, senior assistance, medical/PWD transport, shared rides, parcel delivery, food delivery, courier jobs, cargo routes, and fleet work.

The matching process is divided into two non-interchangeable stages:

1. **Eligibility:** determine whether a dispatch unit can legally, safely, physically, and operationally perform the request. The result is true or false.
2. **Ranking:** among fully eligible units, select the unit that provides the best combination of pickup ETA, reliability, fairness, quality, route fit, and operational efficiency according to the service policy.

The production architecture uses:

- **PostgreSQL and PostGIS** as the durable source of truth and the final assignment authority.
- **Redis geospatial indexes and live snapshots** for fast nearby-unit discovery and short-lived offer coordination.
- **A route-matrix provider** for realistic pickup ETA after a geographic shortlist.
- **A route optimizer** for shared rides, school routes, multi-stop deliveries, vans, and trucks.
- **WebSockets** for real-time state and offer delivery, with push notifications as a wake-up and fallback mechanism.
- **A transactional outbox** for reliable event publication.
- **Versioned service policies** for mandatory rules, scoring weights, offer behavior, search expansion, and fallback restrictions.

The most important correctness rule is:

> PostgreSQL decides the assignment winner atomically. Redis improves speed but never becomes the final authority for ride ownership.

# 2. Scope

## 2.1 Included

This specification covers:

- Driver and vehicle registration data needed by dispatch.
- Active vehicle selection and dispatch-unit construction.
- Online/offline state and live location ingestion.
- Immediate and scheduled request normalization.
- Candidate discovery, eligibility, ETA enrichment, ranking, and offer waves.
- Atomic driver acceptance and duplicate-assignment prevention.
- Passenger rides, shared rides, school transport, medical/PWD trips, inter-city trips, private/premium service, parcel delivery, courier work, cargo routes, and fleets.
- EV battery and usable-range checks.
- Cancellations, no-shows, reassignment, timeout, and recovery.
- State machines, APIs, database structures, events, observability, testing, deployment, migration, and operational runbooks.

## 2.2 Not replaced by this document

The following remain separate domains but integrate with dispatch:

- Fare calculation, taxes, commissions, tolls, discounts, surge pricing, and settlement accounting.
- Identity-verification vendor internals.
- Payment gateway internals.
- Turn-by-turn navigation rendering in mobile clients.
- Emergency response center procedures.
- Local transport-law interpretation.

The dispatch system consumes authoritative outputs from those domains, such as `fare_quote_id`, `payment_authorization_state`, `document_valid_until`, `driver_safety_status`, and `surge_zone_id`.

# 3. Product requirements derived from EVzoneRide designs

The supplied rider and driver designs establish several backend requirements that the matcher must support.

## 3.1 Rider-side requirements

The rider flow includes:

- Ride now and ride later.
- Personal, business, school, delivery, and rides booked for another person.
- One-way, round-trip, and multi-stop journeys.
- Passenger counts and vehicle selection.
- Standard and premium services.
- EV scooter and EV car options.
- Airport, inter-city, senior, medical/PWD, rental, tourism/event, nightlife, and shared-ride use cases.
- Accessibility equipment, child seats, luggage/cargo needs, and language or communication preferences.
- Driver search, driver assignment, OTP verification, live tracking, trip progress, payment, ratings, tips, history, and shared passengers.
- Parcel delivery with service type, box size, weight, schedule, route tracking, QR verification, and delivery confirmation.

## 3.2 Driver-side requirements

The driver flow includes:

- Multiple registered vehicles with one active vehicle for the current operating session.
- Individual and business/fleet vehicles.
- Driver identity, license, medical, insurance, vehicle, inspection, work-permit, certificate-of-good-conduct, and other document states.
- Vehicle accessories and specialist capabilities, including wheelchair access, ramps, reclining seats, child seats, large trunk, partitions, premium interiors, storage equipment, first-aid kits, fire extinguishers, and GPS tracking.
- Online/offline state, live map, driving-hour alerts, earnings, schedules, ride requests, shared-passenger requests, delivery orders, surge areas, and safety tools.
- Incoming requests with acceptance timeout, contact actions, navigation to pickup, arrival, waiting/no-show, rider OTP verification, trip start, in-trip navigation, arrival, completion, cancellation reasons, and support evidence.
- Delivery pickup and destination routes, multiple stops, recipient contact, QR scanning, pickup confirmation, and delivery completion.

## 3.3 Product rule corrections for backend safety

Some UI mockups contain behavior that should not be implemented literally:

- Instant ride offers should normally expire in about 8-12 seconds, not remain blocked for approximately 1 minute 36 seconds. Longer windows are appropriate for scheduled, inter-city, medical, school, or complex delivery work.
- The rider search screen should use WebSocket or server-sent real-time events. Polling may remain only as reconnection fallback.
- A rider preference such as `fast_and_efficient` must never cause the system to reward speeding. Safe route ETA is allowed; unsafe driving behavior is not.
- Ethnicity, religion, cultural background, and similar sensitive attributes must not be used in automated ranking.
- Passenger and driver apps request state transitions, but the backend validates and owns every transition.
- Driving-hour values shown in the designs are configurable platform policies and must not be assumed to be the law in every jurisdiction.

# 4. Non-negotiable design principles

1. **Match dispatch units, not bare drivers.**
2. **Eligibility always precedes scoring.**
3. **Safety and legal requirements are never soft preferences.**
4. **Use realistic pickup ETA after a cheap geographic shortlist.**
5. **The database performs the final atomic assignment.**
6. **All write endpoints are idempotent.**
7. **All matching policies are versioned and auditable.**
8. **No synchronous matching dependency may fan out to many remote services.** Cache an eligibility snapshot.
9. **Push notifications are not the source of truth.** Mobile clients refresh authoritative state after waking.
10. **Fallbacks may expand distance or time, but never weaken safety, capacity, medical, school, document, or energy requirements.**
11. **Fairness may influence ranking only after eligibility is satisfied.**
12. **Every assignment must be explainable from candidate facts, policy version, scores, and decision logs.**
13. **Existing EVzoneRide backend conventions should be preserved where they do not violate correctness.**
14. **Start as a modular monolith plus independent workers unless current scale or architecture clearly justifies more services.**

# 5. Domain model

## 5.1 Driver

A person authorized to perform one or more service types. Important attributes include:

```json
{
  "driver_id": "drv_702",
  "account_status": "ACTIVE",
  "verification_status": "VERIFIED",
  "safety_status": "CLEAR",
  "home_market_id": "market_kampala",
  "languages": ["en", "lg"],
  "certifications": [
    "PASSENGER_TRANSPORT",
    "INTERCITY_APPROVED",
    "PARCEL_DELIVERY"
  ],
  "rating": 4.82,
  "completed_jobs": 842,
  "acceptance_rate_30d": 0.86,
  "driver_cancel_rate_30d": 0.025
}
```

## 5.2 Vehicle

A registered physical vehicle with verified capabilities and operating constraints.

```json
{
  "vehicle_id": "veh_320",
  "vehicle_class": "SUV",
  "powertrain": "ELECTRIC",
  "passenger_capacity": 5,
  "payload_kg": 400,
  "cargo_volume_m3": 2.5,
  "wheelchair_accessible": false,
  "child_seat_count": 1,
  "large_trunk": true,
  "premium_approved": true,
  "school_transport_approved": false,
  "inspection_valid_until": "2026-12-31",
  "insurance_valid_until": "2027-03-15"
}
```

## 5.3 Dispatch unit

The runtime object used by the matching engine.

```json
{
  "dispatch_unit_id": "du_10023",
  "driver_id": "drv_702",
  "active_vehicle_id": "veh_320",
  "owner_type": "FLEET",
  "fleet_id": "fleet_17",
  "enabled_services": [
    "STANDARD_RIDE",
    "PREMIUM_RIDE",
    "INTERCITY",
    "AIRPORT_TRANSFER",
    "PARCEL_DELIVERY"
  ],
  "driver_certifications": [
    "PASSENGER_TRANSPORT",
    "INTERCITY_APPROVED",
    "PARCEL_DELIVERY"
  ],
  "vehicle_capabilities": {
    "class": "SUV",
    "powertrain": "ELECTRIC",
    "passenger_capacity": 5,
    "wheelchair_accessible": false,
    "child_seat_count": 1,
    "cargo_weight_kg": 400,
    "cargo_volume_m3": 2.5,
    "large_trunk": true
  },
  "compliance": {
    "driver_verified": true,
    "vehicle_verified": true,
    "insurance_valid": true,
    "inspection_valid": true,
    "documents_valid": true,
    "safety_clear": true
  },
  "live_state": {
    "status": "AVAILABLE",
    "latitude": 0.3476,
    "longitude": 32.5825,
    "last_seen_at": "2026-06-23T14:45:10Z",
    "battery_soc": 71,
    "usable_range_km": 240,
    "remaining_shift_minutes": 320
  },
  "snapshot_version": 48129
}
```

A driver can have multiple registered vehicles, but only one normal dispatch unit may be active at a time unless the business model explicitly supports supervised multi-vehicle fleet operations where each vehicle has a different assigned driver.

## 5.4 Service request

A normalized request that can represent a passenger ride, shared insertion, school job, delivery, or cargo route.

```json
{
  "request_id": "req_90231",
  "service_family": "PASSENGER",
  "service_type": "MEDICAL_PWD_RIDE",
  "schedule_type": "IMMEDIATE",
  "requested_at": "2026-06-23T14:45:00Z",
  "scheduled_at": null,
  "pickup": {
    "latitude": 0.3476,
    "longitude": 32.5825,
    "h3_cell": "87765...",
    "address": "Kampala"
  },
  "stops": [],
  "dropoff": {
    "latitude": 0.3136,
    "longitude": 32.5811,
    "address": "Kampala"
  },
  "passenger_requirements": {
    "passengers": 2,
    "minimum_seats": 2,
    "wheelchair_ramp": true,
    "pwd_trained_driver": true
  },
  "cargo_requirements": null,
  "preferences": {
    "quiet_ride": true,
    "preferred_languages": ["en", "lg"]
  },
  "payment": {
    "method": "EVZONE_PAY",
    "authorization_state": "AUTHORIZED",
    "fare_quote_id": "fq_921"
  }
}
```

## 5.5 Offer

A time-bound invitation sent to one dispatch unit for one request.

```json
{
  "offer_id": "off_8821",
  "request_id": "req_90231",
  "dispatch_unit_id": "du_10023",
  "wave_number": 1,
  "status": "PENDING",
  "offered_at": "2026-06-23T14:45:02Z",
  "expires_at": "2026-06-23T14:45:12Z",
  "pickup_eta_seconds": 240,
  "pickup_distance_m": 2100,
  "score": 0.8732,
  "policy_version": "medical_pwd_v4"
}
```

## 5.6 Assignment

The durable record that proves which dispatch unit won.

```json
{
  "assignment_id": "asg_7782",
  "request_id": "req_90231",
  "dispatch_unit_id": "du_10023",
  "offer_id": "off_8821",
  "status": "ACTIVE",
  "assigned_at": "2026-06-23T14:45:06Z",
  "policy_version": "medical_pwd_v4",
  "decision_trace_id": "dtr_9203"
}
```

## 5.7 Trip session and booking

For a normal ride, one request generally maps to one booking and one trip session. For shared rides, several rider bookings map to one trip session. For delivery routes, several orders may map to one route session.

```text
Normal ride:
Request -> Assignment -> Trip Session -> One Booking

Shared ride:
Several Requests/Bookings -> One Trip Session -> Ordered Stops

Delivery route:
Several Delivery Orders -> One Route Session -> Pickup/Delivery Stops
```

# 6. Service taxonomy

Use a stable service taxonomy rather than free-form strings. A recommended structure is:

```text
PASSENGER
  STANDARD_RIDE
  PREMIUM_RIDE
  PRIVATE_DRIVER
  BUSINESS_RIDE
  AIRPORT_TRANSFER
  INTERCITY
  TOURISM_EVENT
  NIGHTLIFE
  SENIOR_ASSISTANCE
  MEDICAL_PWD_RIDE
  SCHOOL_RIDE
  RENTAL_WITH_DRIVER
  SHARED_RIDE

DELIVERY
  PARCEL_BIKE
  PARCEL_SCOOTER
  PARCEL_CAR
  COURIER
  FOOD_DELIVERY
  CARGO_VAN
  CARGO_TRUCK
  MULTI_STOP_ROUTE

SPECIAL
  PARTNER_VEHICLE
  FLEET_CONTRACT
  SCHEDULED_ROSTER
```

Each service type points to a versioned policy containing:

- Mandatory driver certifications.
- Mandatory vehicle capabilities.
- Allowed vehicle classes.
- Operating zones.
- Capacity and accessibility constraints.
- Energy reserve rules.
- Scoring weights.
- Search radiuses and expansion sequence.
- Offer wave sizes and timeouts.
- Substitution rules.
- Scheduled lead time.
- Cancellation and no-show behavior.
- Fairness pool.
- Required audit fields.

# 7. Reference architecture

```text
Driver App
   | location, active vehicle, online state, capabilities
   v
Location Gateway ----------------------+
   |                                    |
   +--> Redis GEO indexes               |
   +--> Redis live snapshots            |
   +--> location event stream           |
                                        |
Rider / School / Delivery Client        |
   | create or schedule request         |
   v                                    |
Request API --> PostgreSQL/PostGIS --> Transactional Outbox
                         |                      |
                         |                      v
                         |                 Event Workers
                         v
                  Universal Matcher
                  + Policy Loader
                  + Candidate Finder
                  + Eligibility Engine
                  + ETA Matrix Adapter
                  + Route Feasibility
                  + Service Ranker
                  + Fairness Controller
                         |
                         v
                    Offer Manager
                  + WebSocket delivery
                  + Push fallback
                  + Redis short lease
                         |
                         v
              Atomic Assignment Transaction
                         |
          +--------------+----------------+
          v                               v
      Rider events                    Driver events
```

## 7.1 Recommended deployment shape

At launch or moderate scale, use a modular monolith with separate processes:

- API process.
- Location-ingestion process.
- Matching worker pool.
- Offer-expiry worker.
- Scheduled-dispatch worker.
- Outbox/event worker.
- Notification worker.
- Analytics/decision-log worker.

This structure is easier to operate and keeps transactions local. Split services only when profiling, team ownership, or independent scaling justifies the added distributed-systems complexity.

## 7.2 Synchronous critical path

The synchronous path must contain only operations needed to create an offer or finalize an assignment:

```text
Request persisted
-> policy loaded from memory/cache
-> Redis candidate shortlist
-> local eligibility evaluation
-> route matrix for small shortlist
-> scoring
-> offer persisted and delivered
```

Do not synchronously call separate KYC, wallet, profile, fleet, vehicle, rating, and document services for every candidate. Those services publish changes that update a compact eligibility snapshot.

## 7.3 Asynchronous path

Use the outbox/event system for:

- Notifications.
- Analytics.
- Search-demand metrics.
- Supply heatmaps.
- Driver earnings projections.
- Policy experiment metrics.
- Compliance snapshot refresh.
- Location history storage.
- Data warehouse ingestion.
- Fraud signals.

# 8. Storage responsibilities

## 8.1 PostgreSQL

PostgreSQL is authoritative for:

- Drivers and accounts.
- Vehicles, fleets, assignments, and capabilities.
- Verification and compliance records.
- Service entitlements.
- Requests, offers, assignments, bookings, trip sessions, stops, and route sessions.
- Policy versions.
- Idempotency records.
- Cancellations and no-shows.
- Decision traces and audit logs.
- Transactional outbox.

## 8.2 PostGIS

Use PostGIS for:

- Durable driver-location fallback.
- Service zones and restricted polygons.
- Nearest-neighbor fallback queries.
- Pickup/dropoff point validation.
- Geofence calculations.
- Route/market analytics.

## 8.3 Redis

Use Redis for:

- Live geospatial candidate indexes.
- Current driver/dispatch-unit snapshots.
- Heartbeat freshness indexes.
- Short-lived offer leases.
- Request search state.
- Hot policy cache.
- H3 supply counters.
- Short-lived ETA cache.
- WebSocket presence.

Redis must be treated as rebuildable. Durable ride ownership never depends solely on a Redis key.

## 8.4 Analytics store

High-volume historical GPS and event data should be written asynchronously to a suitable analytics store or warehouse. Do not synchronously insert every GPS point into the main transactional database.

# 9. PostgreSQL schema

The following schema is a reference implementation. Adapt names to the existing backend while preserving its constraints and semantics.

## 9.1 Extensions

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## 9.2 Core enums

```sql
CREATE TYPE dispatch_unit_status AS ENUM (
  'OFFLINE',
  'AVAILABLE',
  'OFFERED',
  'RESERVED',
  'EN_ROUTE_PICKUP',
  'WAITING',
  'ON_TRIP',
  'ON_DELIVERY_ROUTE',
  'CHARGING',
  'BREAK_REQUIRED',
  'DOCUMENT_BLOCKED',
  'SUSPENDED'
);

CREATE TYPE request_status AS ENUM (
  'CREATED',
  'SCHEDULED',
  'SEARCHING',
  'OFFERING',
  'ASSIGNED',
  'DRIVER_EN_ROUTE',
  'ARRIVED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'NO_QUALIFIED_DRIVER',
  'EXPIRED'
);

CREATE TYPE offer_status AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'LOST_RACE'
);

CREATE TYPE schedule_type AS ENUM ('IMMEDIATE', 'SCHEDULED', 'RECURRING');
CREATE TYPE owner_type AS ENUM ('INDIVIDUAL', 'FLEET', 'PARTNER');
```

## 9.3 Drivers and capabilities

```sql
CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE,
  account_status text NOT NULL,
  verification_status text NOT NULL,
  safety_status text NOT NULL DEFAULT 'CLEAR',
  home_market_id uuid NOT NULL,
  rating numeric(3,2),
  completed_jobs integer NOT NULL DEFAULT 0,
  acceptance_rate_30d numeric(5,4),
  driver_cancel_rate_30d numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE driver_certifications (
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  certification_code text NOT NULL,
  status text NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (driver_id, certification_code)
);

CREATE INDEX driver_certifications_active_idx
  ON driver_certifications (certification_code, valid_until)
  WHERE status = 'ACTIVE';

CREATE TABLE driver_service_entitlements (
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  market_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  valid_until timestamptz,
  policy_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (driver_id, service_type, market_id)
);
```

## 9.4 Vehicles and fleets

```sql
CREATE TABLE fleets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  market_id uuid NOT NULL,
  operating_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type owner_type NOT NULL,
  owner_account_id uuid,
  fleet_id uuid REFERENCES fleets(id),
  registration_number text NOT NULL UNIQUE,
  vehicle_class text NOT NULL,
  powertrain text NOT NULL,
  passenger_capacity integer NOT NULL CHECK (passenger_capacity >= 0),
  payload_kg numeric(10,2) CHECK (payload_kg IS NULL OR payload_kg >= 0),
  cargo_volume_m3 numeric(10,3) CHECK (cargo_volume_m3 IS NULL OR cargo_volume_m3 >= 0),
  status text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_capabilities (
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  capability_code text NOT NULL,
  boolean_value boolean,
  numeric_value numeric,
  text_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  PRIMARY KEY (vehicle_id, capability_code)
);

CREATE TABLE vehicle_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  status text NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  verification_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (vehicle_id, document_type)
);

CREATE TABLE driver_vehicle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  fleet_id uuid REFERENCES fleets(id),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  status text NOT NULL,
  UNIQUE (driver_id, vehicle_id, valid_from)
);
```

## 9.5 Shifts and schedules

```sql
CREATE TABLE driver_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  market_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  driving_seconds integer NOT NULL DEFAULT 0,
  online_seconds integer NOT NULL DEFAULT 0,
  break_required_at timestamptz,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX driver_shifts_active_idx
  ON driver_shifts (driver_id, status)
  WHERE status IN ('OPEN', 'BREAK_REQUIRED');

CREATE TABLE driver_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  vehicle_id uuid REFERENCES vehicles(id),
  service_type text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  recurrence_rule text,
  reserved_capacity jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  CHECK (ends_at > starts_at)
);
```

## 9.6 Dispatch units

```sql
CREATE TABLE dispatch_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  active_vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  fleet_id uuid REFERENCES fleets(id),
  shift_id uuid REFERENCES driver_shifts(id),
  market_id uuid NOT NULL,
  status dispatch_unit_status NOT NULL DEFAULT 'OFFLINE',
  active_request_id uuid,
  live_snapshot_version bigint NOT NULL DEFAULT 0,
  eligibility_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_location geography(Point, 4326),
  last_seen_at timestamptz,
  available_since timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_open_dispatch_unit_per_driver
  ON dispatch_units (driver_id)
  WHERE status NOT IN ('OFFLINE', 'SUSPENDED', 'DOCUMENT_BLOCKED');

CREATE INDEX dispatch_units_location_gist
  ON dispatch_units USING gist (last_location);

CREATE INDEX dispatch_units_available_idx
  ON dispatch_units (market_id, status, last_seen_at)
  WHERE status = 'AVAILABLE';
```

## 9.7 Requests and requirements

```sql
CREATE TABLE service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_request_id text NOT NULL,
  requester_account_id uuid NOT NULL,
  beneficiary_account_id uuid,
  service_family text NOT NULL,
  service_type text NOT NULL,
  schedule_type schedule_type NOT NULL,
  scheduled_at timestamptz,
  market_id uuid NOT NULL,
  status request_status NOT NULL DEFAULT 'CREATED',
  pickup geography(Point, 4326) NOT NULL,
  dropoff geography(Point, 4326),
  pickup_address text,
  dropoff_address text,
  passenger_count integer CHECK (passenger_count IS NULL OR passenger_count > 0),
  fare_quote_id uuid,
  payment_method text,
  payment_authorization_state text,
  policy_version text,
  assigned_dispatch_unit_id uuid REFERENCES dispatch_units(id),
  assigned_at timestamptz,
  search_started_at timestamptz,
  completed_at timestamptz,
  cancellation_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_account_id, client_request_id)
);

CREATE INDEX service_requests_search_idx
  ON service_requests (market_id, service_type, status, scheduled_at);

CREATE TABLE request_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  sequence_no integer NOT NULL,
  stop_type text NOT NULL,
  location geography(Point, 4326) NOT NULL,
  address text,
  earliest_at timestamptz,
  latest_at timestamptz,
  service_duration_seconds integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PLANNED',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (request_id, sequence_no)
);

CREATE TABLE request_requirements (
  request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  requirement_code text NOT NULL,
  boolean_value boolean,
  numeric_value numeric,
  text_value text,
  json_value jsonb,
  mandatory boolean NOT NULL DEFAULT true,
  PRIMARY KEY (request_id, requirement_code)
);
```

## 9.8 Offers and assignments

```sql
CREATE TABLE ride_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  dispatch_unit_id uuid NOT NULL REFERENCES dispatch_units(id),
  wave_number integer NOT NULL,
  status offer_status NOT NULL DEFAULT 'PENDING',
  score numeric(9,8),
  pickup_eta_seconds integer,
  pickup_distance_m integer,
  score_components jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_version text NOT NULL,
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  response_reason text,
  idempotency_key text,
  UNIQUE (request_id, dispatch_unit_id, wave_number)
);

CREATE INDEX ride_offers_pending_expiry_idx
  ON ride_offers (expires_at)
  WHERE status = 'PENDING';

CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  dispatch_unit_id uuid NOT NULL REFERENCES dispatch_units(id),
  offer_id uuid REFERENCES ride_offers(id),
  status text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  policy_version text NOT NULL,
  decision_trace_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX one_active_assignment_per_dispatch_unit
  ON assignments (dispatch_unit_id)
  WHERE status IN ('ACTIVE', 'EN_ROUTE_PICKUP', 'WAITING', 'ON_TRIP');
```

## 9.9 Trip sessions, bookings, and routes

```sql
CREATE TABLE trip_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_unit_id uuid NOT NULL REFERENCES dispatch_units(id),
  service_type text NOT NULL,
  status text NOT NULL,
  route_version bigint NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE trip_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_session_id uuid NOT NULL REFERENCES trip_sessions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  requester_account_id uuid NOT NULL,
  beneficiary_account_id uuid,
  seat_count integer,
  cargo_weight_kg numeric,
  cargo_volume_m3 numeric,
  fare_allocation jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL
);

CREATE TABLE trip_session_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_session_id uuid NOT NULL REFERENCES trip_sessions(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES trip_bookings(id),
  sequence_no integer NOT NULL,
  stop_type text NOT NULL,
  location geography(Point, 4326) NOT NULL,
  planned_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (trip_session_id, sequence_no)
);
```

## 9.10 Policies, decisions, idempotency, and outbox

```sql
CREATE TABLE dispatch_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL,
  version integer NOT NULL,
  market_id uuid,
  service_type text NOT NULL,
  status text NOT NULL,
  policy_document jsonb NOT NULL,
  checksum text NOT NULL,
  activated_at timestamptz,
  retired_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_key, version)
);

CREATE TABLE dispatch_decision_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests(id),
  policy_version text NOT NULL,
  candidate_count integer NOT NULL,
  eligible_count integer NOT NULL,
  selected_dispatch_unit_id uuid,
  search_radii_km numeric[] NOT NULL DEFAULT '{}',
  decision_summary jsonb NOT NULL,
  candidate_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_records (
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  resource_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, idempotency_key)
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX outbox_unpublished_idx
  ON outbox_events (occurred_at)
  WHERE published_at IS NULL;
```

# 10. Redis model

## 10.1 Geospatial keys

Recommended key pattern:

```text
geo:{market}:{service-index}
```

Examples:

```text
geo:kampala:standard
geo:kampala:premium
geo:kampala:scooter
geo:kampala:school
geo:kampala:medical
geo:kampala:intercity
geo:kampala:parcel-bike
geo:kampala:parcel-car
geo:kampala:cargo-van
geo:kampala:truck
```

A dispatch unit can appear in several indexes when it is eligible for several services. Membership must be updated whenever any of the following changes:

- Online/offline state.
- Active vehicle.
- Service entitlement.
- Compliance state.
- Vehicle capability.
- Shift state.
- Break requirement.
- Active assignment.
- Location freshness.

## 10.2 Live snapshot

```text
du:live:{dispatch_unit_id}
```

Recommended fields:

```text
status
market_id
vehicle_id
fleet_id
last_seen_epoch_ms
lat
lon
heading
speed_mps
accuracy_m
sequence
available_since_epoch_ms
snapshot_version
battery_soc
usable_range_km
remaining_shift_minutes
service_bitmap
capability_bitmap
compliance_bitmap
active_request_id
```

Use a hash or compact serialized structure. Set a TTL longer than the heartbeat threshold but short enough to self-clean after failures.

## 10.3 Freshness index

```text
du:last_seen:{market}
```

Use a sorted set where score is the last-seen epoch time. A cleanup worker removes stale units from GEO keys and marks them unavailable in durable state when appropriate.

## 10.4 Offer lease

```text
offer:du:{dispatch_unit_id}
```

Acquire using an atomic `SET key value NX PX timeout` operation. This prevents sending conflicting offers to the same driver, but the PostgreSQL transaction still determines the winner.

## 10.5 Request search state

```text
match:req:{request_id}
```

Suggested fields:

```text
policy_version
search_round
current_radius_km
wave_number
status
started_at
last_offer_at
candidate_hash
```

## 10.6 H3 supply counters

```text
supply:{market}:{service}:{h3_cell}
demand:{market}:{service}:{h3_cell}
```

Use short windows for operational heatmaps, surge inputs, relocation suggestions, and zone balancing. Do not use H3 alone for final route ETA.

## 10.7 ETA cache

```text
eta:{travel_mode}:{origin_h3}:{destination_h3}:{traffic_bucket}
```

TTL should normally be 10-30 seconds for live traffic-sensitive pickup estimates. Cache only approximate cell-to-cell values. Never let stale cached ETA override obvious route infeasibility.

# 11. Live location ingestion

## 11.1 Driver location payload

```json
{
  "dispatch_unit_id": "du_10023",
  "driver_id": "drv_702",
  "vehicle_id": "veh_320",
  "latitude": 0.3476,
  "longitude": 32.5825,
  "accuracy_m": 8,
  "heading": 120,
  "speed_mps": 7.5,
  "sequence": 9382,
  "captured_at": "2026-06-23T12:30:04Z",
  "battery_soc": 68,
  "usable_range_km": 224
}
```

## 11.2 Validation

Reject or quarantine updates that fail:

- Authentication and dispatch-unit ownership.
- Active vehicle consistency.
- Monotonic sequence check.
- Timestamp age and excessive clock skew.
- Coordinate range.
- Accuracy threshold.
- Impossible speed or teleport detection.
- Market/geofence reasonableness.

Out-of-order updates must not overwrite newer positions.

## 11.3 Adaptive frequency

Recommended mobile targets:

```text
Navigating or active trip:       every 2-4 seconds
Online and moving, no trip:      every 5-10 seconds
Online and stationary:           every 20-30 seconds
Offline:                         no continuous dispatch tracking
```

The server may instruct the client to change frequency based on battery, connectivity, trip state, or safety requirements.

## 11.4 Freshness rule

A candidate is eligible only when its live location is sufficiently fresh. A typical immediate-ride threshold is 15-30 seconds. Scheduled and low-speed service policies may use a different threshold. The threshold must be a policy value.

# 12. Request creation and normalization

## 12.1 Idempotent creation

Clients send an idempotency key:

```http
POST /v1/service-requests
Idempotency-Key: 38ee3e12-6a34-4145-b255-d65fa61f34f3
```

The server:

1. Authenticates the requester.
2. Validates pickup, dropoff, stops, time, beneficiary, passenger/cargo data, and payment state.
3. Resolves the service type.
4. Stores a normalized request and requirements.
5. Stores the policy version selected for this request.
6. Creates an outbox event.
7. Returns the durable request immediately.

Repeated calls with the same idempotency key and equivalent payload return the original response. A different payload with the same key returns a conflict.

## 12.2 Normalization rules

Normalize all request inputs into:

- Market and service type.
- Schedule type and time windows.
- Ordered geographic points.
- Passenger capacity.
- Cargo weight and volume.
- Mandatory capabilities.
- Optional preferences.
- Payment/fare references.
- Beneficiary identity and contact rules.
- Sharing/pooling permission.
- Route constraints.
- Safety and privacy flags.

## 12.3 Multi-stop and round-trip handling

Store all waypoints in sequence. A round trip is represented as an outbound request plus return constraints or as one route session, depending on product behavior. Do not flatten the return leg into unstructured metadata.

## 12.4 Scheduled requests

A scheduled request must contain:

- Requested pickup window, not just a formatted local time.
- Timezone.
- Expected service duration.
- Reservation lead time.
- Reassignment cutoff.
- Driver confirmation deadline.
- Whether pre-assignment is required.

# 13. Universal matching pipeline

```text
1. Receive or activate normalized request
2. Load active versioned service policy
3. Determine permitted driver and vehicle classes
4. Find nearby dispatch units in Redis
5. Load compact live snapshots
6. Apply all mandatory eligibility rules
7. Calculate pickup ETA for a small shortlist
8. Evaluate route, capacity, schedule, and energy feasibility
9. Compute service-specific ranking score
10. Apply bounded fairness adjustment
11. Persist decision trace and offers
12. Deliver short offer wave
13. Accept first valid winner atomically in PostgreSQL
14. Cancel all losing offers
15. Notify rider, driver, fleet, and downstream systems
16. If no acceptance, expand according to policy and repeat
17. Finish as assigned, scheduled for retry, or no qualified driver
```

## 13.1 Reference matcher pseudocode

```pseudo
function matchRequest(requestId):
    request = requestRepository.loadForMatching(requestId)
    assert request.status in [SEARCHING, OFFERING]

    policy = policyCache.getActive(
        marketId=request.marketId,
        serviceType=request.serviceType,
        pinnedVersion=request.policyVersion
    )

    for searchRound in policy.searchRounds:
        geoCandidates = redisGeo.find(
            indexes=policy.candidateIndexes,
            pickup=request.pickup,
            radiusKm=searchRound.radiusKm,
            limit=searchRound.geoLimit
        )

        snapshots = liveSnapshotStore.multiGet(geoCandidates)
        eligible = []

        for snapshot in snapshots:
            result = eligibilityEngine.evaluate(request, snapshot, policy)
            decisionLog.recordEligibility(snapshot.id, result)
            if result.allowed:
                eligible.append(snapshot)

        if eligible.isEmpty():
            continue

        coarseRanked = coarseRank(eligible, request.pickup)
        etaCandidates = take(coarseRanked, policy.routeMatrixCandidateLimit)
        etaResults = routeMatrix.compute(etaCandidates, request.pickup, policy.travelMode)

        feasible = routeFeasibility.evaluateAll(
            request=request,
            candidates=etaCandidates,
            etaResults=etaResults,
            policy=policy
        )

        ranked = rankingEngine.rank(request, feasible, policy)
        wave = offerPlanner.nextWave(ranked, searchRound, policy)

        if wave.isEmpty():
            continue

        persistOffersAndSend(wave)
        winner = waitForWinnerOrWaveExpiry(request.id, wave.expiry)

        if winner.exists:
            return winner

    markNoQualifiedDriver(request)
    return none
```

# 14. Eligibility engine

Eligibility is deterministic. It returns:

```json
{
  "allowed": false,
  "reason_codes": [
    "VEHICLE_CAPACITY_INSUFFICIENT",
    "EV_RANGE_INSUFFICIENT"
  ],
  "facts": {
    "required_seats": 5,
    "available_seats": 4,
    "required_range_km": 148,
    "available_range_km": 122
  }
}
```

## 14.1 Universal checks

A dispatch unit must pass all applicable checks:

### Driver checks

- Account active.
- Identity verified.
- Safety status clear.
- Required certification active and unexpired.
- Not suspended or blocked.
- No active conflicting assignment.
- Not blocked by the rider and no platform-level exclusion.
- Remaining driving/shift time sufficient.
- Current service opt-in enabled.

### Vehicle checks

- Active vehicle matches the live dispatch unit.
- Vehicle verified and operational.
- Required class allowed.
- Passenger capacity sufficient.
- Payload and volume sufficient.
- Required accessories/equipment verified.
- Maintenance, inspection, insurance, and registration valid.
- Vehicle not reserved for another fleet task.

### Live-state checks

- Status available.
- Heartbeat and location fresh.
- Accuracy acceptable.
- Not currently charging unless scheduled policy allows post-charge availability.
- No conflicting offer lease.
- Inside or allowed to serve the operating zone.

### Request checks

- Pickup reachable.
- Route not prohibited for vehicle class.
- Schedule feasible.
- Time windows feasible.
- Energy/fuel feasible.
- Existing shared or delivery route can accept the insertion.

## 14.2 Requirement matching

Use explicit capability codes. Examples:

```text
WHEELCHAIR_RAMP
PWD_SECURE_SEATING
MEDICAL_ASSISTANCE_TRAINING
OXYGEN_TANK
STRETCHER
FIRST_AID_KIT
CHILD_SEAT
BABY_SEAT
TODDLER_SEAT
PREMIUM_INTERIOR
CHAUFFEUR_SERVICE
LARGE_TRUNK
PARTITION_SHIELD
REFRIGERATED_STORAGE
FOOD_INSULATED_BAG
SCHOOL_TRANSPORT_APPROVAL
INTERCITY_APPROVAL
```

Mandatory request requirements compare to verified dispatch-unit facts. Optional preferences never turn an otherwise safe match into an unsafe one.

## 14.3 Explainable reason-code catalog

At minimum support:

```text
DRIVER_OFFLINE
DRIVER_NOT_AVAILABLE
DRIVER_LOCATION_STALE
DRIVER_NOT_VERIFIED
DRIVER_SUSPENDED
DRIVER_CERTIFICATION_MISSING
DRIVER_CERTIFICATION_EXPIRED
DRIVING_TIME_INSUFFICIENT
VEHICLE_NOT_ACTIVE
VEHICLE_NOT_VERIFIED
VEHICLE_CLASS_NOT_ALLOWED
VEHICLE_CAPACITY_INSUFFICIENT
CARGO_WEIGHT_EXCEEDED
CARGO_VOLUME_EXCEEDED
CAPABILITY_MISSING
DOCUMENT_EXPIRED
INSURANCE_INVALID
INSPECTION_INVALID
OUTSIDE_SERVICE_ZONE
ROUTE_RESTRICTED
SCHEDULE_CONFLICT
OFFER_CONFLICT
ACTIVE_ASSIGNMENT_CONFLICT
EV_RANGE_INSUFFICIENT
POOL_INSERTION_INFEASIBLE
TIME_WINDOW_INFEASIBLE
RIDER_DRIVER_BLOCK
FLEET_RULE_BLOCK
```

# 15. Candidate discovery

## 15.1 Two-stage discovery

Use:

1. Cheap geospatial shortlist.
2. Accurate route ETA for a smaller set.

Typical immediate-ride sequence:

```text
Radius 2 km -> 4 km -> 8 km -> 15 km
Geo shortlist per round: up to 30-50
ETA calculation: top 8-15 eligible units
```

The exact numbers are policy values and should be tuned per market and service.

## 15.2 Redis GEO search

Search one or more relevant service indexes. Return distance and coordinates when useful. Deduplicate dispatch units appearing in multiple indexes.

## 15.3 PostGIS fallback

If Redis is unavailable or rebuilding, use the durable last-location field and an index-assisted nearest-neighbor or distance query. Only units with sufficiently recent durable snapshots may be considered.

Example fallback:

```sql
SELECT id,
       ST_Distance(last_location, $1::geography) AS distance_m
FROM dispatch_units
WHERE market_id = $2
  AND status = 'AVAILABLE'
  AND last_seen_at > now() - interval '30 seconds'
ORDER BY last_location <-> $1::geography
LIMIT 50;
```

## 15.4 Zone-aware expansion

Use H3 or an equivalent grid for:

- Market partitioning.
- Adjacent-zone expansion.
- Supply and demand counts.
- Surge inputs.
- Driver relocation suggestions.

Do not assume cell distance equals road travel time.

# 16. ETA calculation

## 16.1 Why ETA matters

A driver 2 km away can be slower than a driver 3 km away because of road direction, traffic, restricted turns, bridges, or vehicle-specific routing. Final ranking should therefore use road travel time whenever available.

## 16.2 Route matrix adapter

Define an internal interface:

```typescript
interface RouteMatrixProvider {
  computePickupEtas(input: {
    origins: Coordinate[];
    destination: Coordinate;
    travelMode: 'CAR' | 'MOTORCYCLE' | 'BICYCLE' | 'TRUCK';
    departureTime: Date;
    trafficAware: boolean;
    timeoutMs: number;
  }): Promise<RouteMatrixResult[]>;
}
```

Support provider replacement. The matching domain must not directly depend on one vendor response model.

## 16.3 Timeout and fallback

Recommended behavior:

- Strict route-matrix timeout, normally 300-800 ms depending on market/network.
- Partial results accepted when provider supports streaming or per-origin status.
- Missing ETA falls back to cached H3 estimate or distance divided by a conservative historical speed.
- Apply an uncertainty penalty to approximate ETA.
- Never use a fallback that incorrectly makes an infeasible route feasible.

## 16.4 Travel mode

Use mode appropriate to the active vehicle:

```text
CAR
MOTORCYCLE_OR_SCOOTER
BICYCLE
TRUCK
```

Where a provider lacks truck constraints, apply local restricted-road rules before accepting the route.

# 17. Ranking engine

## 17.1 General score

After eligibility:

```text
final_score =
    w_eta         * pickup_eta_score
  + w_reliability * reliability_score
  + w_fairness    * fairness_score
  + w_quality     * service_quality_score
  + w_route_fit   * route_fit_score
  + w_energy      * energy_margin_score
  + w_preference  * functional_preference_score
  - penalties
```

All components are normalized to `0.0-1.0`. Weights sum to 1.0 before penalties.

## 17.2 ETA score

One suitable monotonic transformation:

```text
pickup_eta_score = exp(-pickup_eta_seconds / eta_scale_seconds)
```

Or a bounded linear form:

```text
pickup_eta_score = clamp(
    1 - (pickup_eta_seconds - best_eta_seconds) / eta_tolerance_seconds,
    0,
    1
)
```

Use the same function within a policy experiment so scores remain comparable.

## 17.3 Reliability score

Build from bounded, decayed metrics:

```text
reliability_score =
    0.40 * acceptance_reliability
  + 0.35 * completion_reliability
  + 0.25 * punctuality_reliability
```

Do not permanently punish old incidents. Use time decay and minimum sample sizes.

## 17.4 Service quality score

Use Bayesian shrinkage so a new driver with one five-star trip does not outrank an experienced driver solely because of sample size.

Example:

```text
adjusted_rating =
  (driver_trip_count * driver_average + prior_weight * market_average)
  / (driver_trip_count + prior_weight)
```

Quality inputs can include:

- Adjusted rating.
- Validated complaints.
- Service-specific completion quality.
- Cleanliness or premium audit where applicable.
- School/medical punctuality.

## 17.5 Fairness score

Potential inputs:

- Time waiting since available.
- Jobs received in the current shift.
- Recent earnings relative to comparable eligible drivers.
- Deadhead distance already travelled.
- Recent offer exposure.
- Fleet contractual allocation where lawful and transparent.

Fairness must be bounded. For example, it may shift rank among similarly suitable units but must not select a 20-minute pickup over a 3-minute pickup without an explicit service rule.

Maintain separate fairness pools by service family. A delivery assignment should not unfairly reduce a driver's opportunity for passenger rides unless the driver actually consumed equivalent operating capacity.

## 17.6 Functional preference score

Allowed examples:

- Preferred language when both parties explicitly provide it.
- Quiet/conversational preference.
- Child seat beyond a mandatory minimum.
- Luggage preference.
- Vehicle category preference.

Forbidden ranking attributes:

- Ethnicity.
- Religion.
- Cultural background.
- Nationality when not legally required for service authorization.
- Other sensitive or protected characteristics.

## 17.7 Tie-breakers

Use deterministic tie-breakers to make tests and audits reproducible:

1. Higher final score.
2. Lower pickup ETA.
3. Longer available waiting time.
4. Lower recent offer exposure.
5. Stable hash of request ID and dispatch-unit ID.

Do not use random ordering without logging the seed.

# 18. Default policy weights

These are safe starting values, not permanent business truth.

| Service | ETA | Reliability | Fairness | Quality/fit | Route/energy | Notes |
|---|---:|---:|---:|---:|---:|---|
| Standard instant ride | 0.50 | 0.15 | 0.15 | 0.10 | 0.10 | Fast pickup with bounded fairness. |
| EV scooter/minicar | 0.50 | 0.15 | 0.15 | 0.05 | 0.15 | Higher energy/route compatibility. |
| Premium/private | 0.30 | 0.20 | 0.10 | 0.30 | 0.10 | Vehicle and service quality matter more. |
| Medical/PWD | 0.45 | 0.25 | 0.10 | 0.15 | 0.05 | Specialist eligibility is mandatory before scoring. |
| School | 0.15 | 0.25 | 0.10 | 0.35 | 0.15 | Roster continuity and schedule reliability dominate. |
| Airport/inter-city | 0.25 | 0.20 | 0.10 | 0.15 | 0.30 | Range, luggage, route fit, and shift capacity. |
| Parcel/courier | 0.30 | 0.20 | 0.10 | 0.10 | 0.30 | Deadline and route addition cost. |
| Shared insertion | 0.15 | 0.15 | 0.10 | 0.10 | 0.50 | Insertion feasibility and total detour dominate. |
| Cargo van/truck | 0.10 | 0.20 | 0.05 | 0.15 | 0.50 | Capacity, time windows, route constraints, cost. |

Weights belong in policy documents and must be testable and changeable without recompiling the matching engine.

# 19. Service-specific implementation policies

## 19.1 Standard instant passenger ride

### Mandatory eligibility

- Driver and vehicle verified.
- Driver online and available.
- Fresh location.
- Correct market and operating zone.
- Passenger capacity sufficient.
- Vehicle class allowed by selected fare product.
- Documents, insurance, and inspection valid.
- Remaining shift and energy sufficient.
- No conflicting assignment or offer.

### Ranking priorities

- Pickup ETA.
- Reliability.
- Driver waiting-time fairness.
- Service quality.
- Zone balance and route fit.

### Offer behavior

```text
Wave 1: top 1 driver, 8 seconds
Wave 2: next 2 drivers, 8 seconds
Wave 3: next 3 drivers, 8 seconds
Then expand radius and repeat
```

In low-connectivity areas, the policy may begin with two drivers. Only the first atomically accepted offer wins.

## 19.2 EV scooter, motorcycle, bicycle, and mini-car rides

### Additional eligibility

- Correct travel mode and vehicle class.
- Road and zone allow the vehicle type.
- Passenger count and luggage fit.
- Helmet or safety-equipment requirements satisfied where applicable.
- Battery/range margin sufficient.

### Ranking notes

- Use a motorcycle/scooter or bicycle route mode rather than car ETA.
- Apply weather or road restrictions when supplied by a trusted operational policy.
- Avoid long inter-city trips unless the product and vehicle are explicitly approved.

## 19.3 Premium ride and private driver

### Mandatory eligibility

- Premium/private service entitlement.
- Approved vehicle class and age/condition policy.
- Minimum service-quality threshold.
- Required chauffeur or professional certification.
- Correct dress/service audit where the business formally tracks it.

### Ranking priorities

- Vehicle/service quality.
- Reliability.
- Pickup ETA.
- Preference fit.
- Driver fairness.

### Scheduled behavior

Premium reservations should pre-assign earlier than standard rides and require explicit driver confirmation. Maintain a backup-candidate pool before pickup time.

## 19.4 Business rides and corporate contracts

Additional policy inputs may include:

- Corporate account eligibility.
- Allowed vehicle class.
- Cost center and billing method.
- Approved driver/fleet list.
- Confidentiality or branding requirement.
- Service-level agreement.

Contract restrictions are hard eligibility rules when required by the customer agreement.

## 19.5 Airport transfers

### Eligibility

- Airport operating permission where required.
- Luggage capacity.
- Flight-time or scheduled-window feasibility.
- Meet-and-greet capability if purchased.
- Remaining range and shift time.

### Matching behavior

- Use terminal-specific pickup zones.
- Account for airport access queues and restricted roads in ETA.
- Begin scheduled matching early enough for the service-level target.
- Keep a backup driver until the primary driver is reliably en route.

## 19.6 Inter-city travel

### Eligibility

- Inter-city certification or entitlement.
- Vehicle inspection and condition valid.
- Sufficient usable range/fuel including reserve.
- Remaining shift time and legal rest compliance.
- Luggage/passenger capacity.
- Route permitted for vehicle class.
- Return plan or destination-market policy satisfied.

### Ranking priorities

- Full-route feasibility.
- Energy margin.
- Driver route familiarity when measured safely and lawfully.
- Reliability.
- Vehicle comfort.
- Pickup ETA.
- Destination alignment or paid return compatibility.

A nearby driver without enough range or remaining driving time is not eligible.

## 19.7 Round trips and multi-stop passenger rides

Evaluate the entire route, not only the first leg:

```text
pickup -> ordered stops -> destination -> optional return
```

Check:

- Full passenger capacity across every segment.
- Stop time windows.
- Total expected duration.
- Driver shift availability.
- EV range and charging options.
- Vehicle/service compatibility for all stops.
- Schedule conflicts.

When stops can be reordered, use a route optimizer only if the rider permits reordering. Preserve explicit rider order by default.

## 19.8 Scheduled passenger rides

Scheduled jobs require a scheduler rather than only a live nearest-driver search.

### Recommended lifecycle

```text
T-24h or configured lead time: create reservation search task
T-6h: preselect eligible pool
T-2h: send primary offers if policy requires early assignment
T-45m: verify driver online/ready and vehicle unchanged
T-20m: activate backup or reassign if at risk
Pickup window: standard live monitoring and arrival workflow
```

The exact times are policy values by service and market.

### Reservation protections

- Prevent the driver from accepting a conflicting trip that would make the reservation infeasible.
- Recalculate feasibility when traffic, location, vehicle, or battery changes.
- Allow a configurable buffer before and after the reservation.
- Keep backup candidates but do not expose several confirmed drivers to the rider.

## 19.9 School transport

School transport must use a scheduled roster and route-continuity model rather than ordinary nearest-driver matching.

### Mandatory eligibility

- School-service approval.
- Child-safety training and any required background checks.
- Appropriate vehicle and seat capacity.
- Child/baby/toddler seats when required.
- Assigned school, contract, or operating area.
- Verified recurring schedule.
- Driver-hours and vehicle-maintenance compliance.
- Guardian/student roster permission.

### Ranking priorities

- Existing route/roster assignment.
- Continuity with the same approved driver.
- Schedule reliability and punctuality.
- Vehicle capacity and stop fit.
- Route efficiency.
- Fairness within the school-driver pool.

### Operational rules

- Preserve guardian-authorized pickup and dropoff points.
- Support attendance/boarding state and optional OTP/QR verification.
- Do not expose student data beyond operational need.
- Precompute routes and backup drivers.
- Do not add unrelated shared passengers to school routes.

## 19.10 Senior assistance

Mandatory or weighted capabilities may include:

- Easy-entry vehicle.
- Reclining seat.
- Extra boarding time.
- Assistance-trained driver.
- Quiet ride preference.
- Companion capacity.

The service-duration model must include boarding and assistance time rather than using only drive time.

## 19.11 Medical and PWD transport

### Mandatory eligibility examples

- PWD-assistance or medical-assistance training.
- Wheelchair ramp or lift.
- Secure PWD seating.
- Stretcher, oxygen tank, first-aid kit, or other requested equipment.
- Easy-entry configuration.
- Vehicle capacity for passenger, companion, and mobility equipment.

### Safety rule

An ordinary nearby driver must never replace a required specialist driver merely to reduce ETA.

### Ranking priorities after eligibility

- Pickup ETA.
- Reliability.
- Relevant service-quality history.
- Assistance experience.
- Fairness.

### Fallback

Allowed fallbacks include a larger radius, adjacent service zones, or a later time. The system may not silently remove medical/accessibility requirements.

## 19.12 Tourism, event, and nightlife transport

Possible additional checks:

- Event-zone access.
- Late-night opt-in.
- Vehicle capacity.
- Group/luggage fit.
- Scheduled availability.
- Safety restrictions and destination-zone coverage.

Do not use a driver personality profile as a safety or legal substitute. Functional language and communication preferences may be scored only after eligibility.

## 19.13 Rental with driver

Evaluate the reserved duration and geographic allowance:

- Driver and vehicle available for the whole rental block.
- Expected route/area permitted.
- Break and shift constraints.
- Fuel/energy plan.
- Replacement or backup policy.
- Overtime pricing reference.

The assignment consumes time capacity even when the vehicle is waiting between stops.

## 19.14 Shared and pooled rides

Shared rides are not a normal nearest-driver match. A candidate may be:

- An available empty vehicle.
- A vehicle already serving a compatible shared route.

For every insertion, calculate:

- Seats available after each pickup/dropoff.
- Added pickup time.
- Added trip time for every existing passenger.
- Maximum allowed detour.
- Pickup and arrival time windows.
- Stop-order feasibility.
- Route-direction compatibility.
- Energy impact.
- Driver shift impact.

### Insertion cost

```text
insertion_cost =
    alpha * added_vehicle_time
  + beta  * total_existing_passenger_detour
  + gamma * new_passenger_wait
  + delta * lateness_penalty
  + epsilon * energy_penalty
```

Reject an insertion that violates any hard constraint, even if its numeric cost is low.

### Shared-trip assignment model

- One `trip_session` represents the moving vehicle route.
- Each rider has a separate `trip_booking` and fare allocation.
- Each pickup/dropoff belongs to a booking.
- The route version increments on every accepted insertion.
- Route updates use optimistic or row-level locking so two simultaneous insertions cannot corrupt stop order or capacity.

## 19.15 Parcel, courier, and food delivery

### Mandatory checks

- Driver delivery entitlement.
- Parcel category allowed.
- Weight and volume fit.
- Vehicle type suitable.
- Temperature/insulation requirement satisfied.
- Pickup and delivery deadlines feasible.
- Required QR/photo verification supported.
- Restricted or dangerous goods rejected according to policy.

### Ranking priorities

- Added route time.
- Pickup deadline risk.
- Delivery deadline risk.
- Cargo utilization.
- Operating cost.
- Route compatibility.
- Reliability.

Food delivery should use shorter freshness windows and appropriate insulated-equipment capability.

## 19.16 Vans, trucks, and multi-stop cargo routes

Required dimensions include:

- Payload weight.
- Cargo volume.
- Number and dimensions of packages.
- Loading/unloading time.
- Vehicle class and route restrictions.
- Depot and fleet rules.
- Time windows.
- Driver hours.
- Tail-lift, partition, refrigeration, or other equipment.

For multiple orders, solve a vehicle-routing problem rather than dispatching each order independently. The optimizer should support:

- Pickup-delivery precedence.
- Same-vehicle constraints.
- Capacity across every route segment.
- Time windows.
- Optional dropped visits with explicit penalties.
- Multiple depots where needed.
- Driver/vehicle work limits.

## 19.17 Fleet and partner drivers

Fleet status never replaces individual accountability. Match using:

```text
Driver
+ assigned active vehicle
+ fleet owner
+ fleet contract
+ current shift
+ service entitlement
+ operating zone
+ maintenance state
+ settlement rules
```

Possible fleet constraints:

- Only approved fleet vehicles.
- Contract-specific market or service.
- Vehicle rotation.
- Driver assignment roster.
- Minimum/maximum utilization.
- Reserved capacity for school, business, or delivery contracts.

Do not allow fleet quotas to override safety or request capability requirements.

# 20. EV energy feasibility

## 20.1 Required live EV fields

```text
battery_soc
usable_range_km
estimated_consumption_wh_per_km
charging_state
connector_type
minimum_reserve_percent
battery_health_factor
```

Use a trustworthy vehicle estimate when available. Otherwise estimate conservatively from recent consumption, vehicle model, traffic, gradient, weather inputs, and historical performance.

## 20.2 Required range

```text
required_range_km =
    distance_driver_to_pickup
  + request_route_distance
  + expected_detour_distance
  + distance_to_safe_charger_or_operating_base
  + reserve_distance
```

Eligibility:

```text
usable_range_km >= required_range_km
```

## 20.3 Reserve policy

Reserve may be the greater of:

- A percentage of usable range.
- A fixed minimum distance.
- Distance to a reachable compatible charger plus contingency.

Use a larger reserve for inter-city, medical, school, or sparse-charging routes.

## 20.4 Charging state

- `CHARGING` units are normally excluded from immediate dispatch.
- Scheduled policies may allow `AVAILABLE_AFTER_CHARGE` when expected completion, unplugging buffer, and route feasibility pass.
- Never assume charging completes on schedule without recent charger/vehicle telemetry.

## 20.5 Re-evaluation

Re-evaluate energy feasibility:

- Before sending an offer.
- On offer acceptance.
- Before a shared-ride insertion.
- When a scheduled ride reaches activation time.
- After a material route change.

# 21. Offer strategy

## 21.1 Goals

- Minimize rider wait.
- Avoid flooding many drivers.
- Prevent conflicting offers.
- Provide sufficient driver decision time.
- Recover quickly from rejection, timeout, or connectivity loss.

## 21.2 Default offer durations

| Service | Recommended initial timeout |
|---|---:|
| Standard instant ride | 8-12 seconds |
| Scooter/minicar | 8-12 seconds |
| Premium/private | 10-15 seconds |
| Medical/PWD | 10-15 seconds |
| Airport/inter-city scheduled | 20-60 seconds or reservation-specific |
| School recurring route | Longer contractual confirmation window |
| Shared insertion | 8-12 seconds after route feasibility |
| Delivery single order | 10-20 seconds |
| Multi-stop route/cargo | 30-120 seconds depending on complexity |

## 21.3 Sequential versus batched waves

- Sequential offers improve driver experience and fairness when supply is healthy.
- Small batches reduce rider delay in low-connectivity or low-acceptance conditions.
- Never broadcast to every nearby driver.
- Record all exposed drivers to avoid repeatedly favoring the same units.

## 21.4 Conflicting offers

A driver should normally have only one conflicting offer at a time. Shared and delivery drivers may receive compatible additions only when the current route policy allows it.

## 21.5 Offer payload

```json
{
  "offer_id": "off_8821",
  "request_id": "req_90231",
  "service_type": "STANDARD_RIDE",
  "expires_at": "2026-06-23T12:30:18Z",
  "pickup": {
    "distance_m": 2100,
    "eta_seconds": 240,
    "area_label": "Kampala"
  },
  "trip": {
    "estimated_distance_m": 18500,
    "estimated_duration_seconds": 2400,
    "stop_count": 0
  },
  "earnings": {
    "estimated_driver_earnings_ugx": 40365,
    "surge_multiplier": 1.0
  },
  "requirements": {
    "passengers": 2,
    "wheelchair_ramp": false
  },
  "route_version": 0,
  "policy_version": "standard_kampala_v7"
}
```

Expose only data needed for the driver decision and protect rider privacy before acceptance.

## 21.6 Timeout handling

On timeout:

1. Atomically change offer from `PENDING` to `EXPIRED`.
2. Release Redis lease if still owned by that offer.
3. Update driver exposure metrics.
4. Send offer-expired event.
5. Continue the next wave unless the request has been assigned or cancelled.

# 22. Atomic acceptance and concurrency

## 22.1 Required guarantees

- Two drivers cannot win the same request.
- One dispatch unit cannot win conflicting active requests.
- A stale offer cannot overwrite a valid assignment.
- Retried acceptance returns the original result.
- A cancellation racing with acceptance has a deterministic outcome.
- A shared-route insertion cannot corrupt route order or capacity.

## 22.2 Reference transaction

```sql
BEGIN;

SELECT id, status, assigned_dispatch_unit_id, version
FROM service_requests
WHERE id = $request_id
FOR UPDATE;

SELECT id, status, dispatch_unit_id, expires_at
FROM ride_offers
WHERE id = $offer_id
  AND request_id = $request_id
FOR UPDATE;

SELECT id, status, active_request_id
FROM dispatch_units
WHERE id = $dispatch_unit_id
FOR UPDATE;

-- Application checks:
-- request.status IN ('SEARCHING', 'OFFERING')
-- request.assigned_dispatch_unit_id IS NULL
-- offer.status = 'PENDING'
-- offer.expires_at > now()
-- offer.dispatch_unit_id = dispatch_unit.id
-- dispatch_unit.status IN ('AVAILABLE', 'OFFERED')
-- dispatch_unit.active_request_id IS NULL

UPDATE dispatch_units
SET status = 'RESERVED',
    active_request_id = $request_id,
    updated_at = now()
WHERE id = $dispatch_unit_id
  AND status IN ('AVAILABLE', 'OFFERED')
  AND active_request_id IS NULL;

UPDATE service_requests
SET status = 'ASSIGNED',
    assigned_dispatch_unit_id = $dispatch_unit_id,
    assigned_at = now(),
    version = version + 1,
    updated_at = now()
WHERE id = $request_id
  AND status IN ('SEARCHING', 'OFFERING')
  AND assigned_dispatch_unit_id IS NULL;

INSERT INTO assignments (
  request_id,
  dispatch_unit_id,
  offer_id,
  status,
  policy_version,
  decision_trace_id
) VALUES (
  $request_id,
  $dispatch_unit_id,
  $offer_id,
  'ACTIVE',
  $policy_version,
  $decision_trace_id
);

UPDATE ride_offers
SET status = CASE
    WHEN id = $offer_id THEN 'ACCEPTED'::offer_status
    ELSE 'CANCELLED'::offer_status
  END,
  responded_at = CASE WHEN id = $offer_id THEN now() ELSE responded_at END
WHERE request_id = $request_id
  AND status = 'PENDING';

INSERT INTO outbox_events (
  aggregate_type,
  aggregate_id,
  event_type,
  payload
) VALUES (
  'service_request',
  $request_id,
  'dispatch.request_assigned',
  jsonb_build_object(
    'request_id', $request_id,
    'dispatch_unit_id', $dispatch_unit_id,
    'offer_id', $offer_id
  )
);

COMMIT;
```

Check that every guarded update affects exactly one row. Otherwise roll back and return a conflict or the already-created assignment for an idempotent retry.

## 22.3 Acceptance idempotency

Use:

```http
POST /v1/offers/{offer_id}/accept
Idempotency-Key: <uuid>
```

A repeated request after success returns the same assignment. A different driver/account cannot reuse the key.

## 22.4 Losing acceptance

Return:

```http
409 Conflict
```

```json
{
  "code": "OFFER_ALREADY_TAKEN",
  "message": "This request has already been assigned.",
  "request_id": "req_90231"
}
```

## 22.5 Cancellation race

Lock the request row in both cancellation and acceptance. Define precedence:

- A committed assignment wins over a later cancellation attempt, which then follows assigned-trip cancellation policy.
- A committed rider cancellation before assignment makes the acceptance fail.
- Use timestamps only for audit; transaction order determines ownership.

# 23. State machines

## 23.1 Dispatch-unit state machine

```text
OFFLINE
  -> AVAILABLE
  -> OFFERED
  -> RESERVED
  -> EN_ROUTE_PICKUP
  -> WAITING
  -> ON_TRIP or ON_DELIVERY_ROUTE
  -> AVAILABLE

AVAILABLE -> CHARGING
AVAILABLE -> BREAK_REQUIRED
AVAILABLE -> DOCUMENT_BLOCKED
ANY NON-TERMINAL -> SUSPENDED
```

Rules:

- Only the backend performs transitions.
- Going online requires an active verified vehicle, valid compliance snapshot, open shift, and fresh location.
- `OFFERED` may still be represented as `AVAILABLE` in durable state if Redis holds the lease, but the domain should expose one consistent logical state.
- `BREAK_REQUIRED`, `DOCUMENT_BLOCKED`, and `SUSPENDED` remove the unit from candidate indexes immediately.

## 23.2 Request state machine

```text
CREATED
  -> SCHEDULED
  -> SEARCHING
  -> OFFERING
  -> ASSIGNED
  -> DRIVER_EN_ROUTE
  -> ARRIVED
  -> ACTIVE
  -> COMPLETED
```

Terminal alternatives:

```text
CANCELLED
NO_QUALIFIED_DRIVER
EXPIRED
```

Allowed transitions must be explicitly validated. Avoid unrestricted `status` updates.

## 23.3 Offer state machine

```text
PENDING -> ACCEPTED
PENDING -> DECLINED
PENDING -> EXPIRED
PENDING -> CANCELLED
PENDING -> LOST_RACE
```

Every terminal transition is immutable except through an administrative correction process with audit logging.

## 23.4 Trip sub-states

Examples:

```text
DRIVER_EN_ROUTE_PICKUP
DRIVER_ARRIVED
WAITING_FOR_RIDER
RIDER_VERIFIED
TRIP_STARTED
STOP_ARRIVED
STOP_COMPLETED
TRIP_COMPLETED
```

Delivery-specific examples:

```text
DRIVER_EN_ROUTE_PICKUP
PACKAGE_QR_VERIFIED
PACKAGE_PICKED_UP
EN_ROUTE_DELIVERY
DELIVERY_ARRIVED
RECIPIENT_VERIFIED
PACKAGE_DELIVERED
ORDER_COMPLETED
DELIVERY_FAILED
```

# 24. Arrival, OTP, QR, and trip-start controls

## 24.1 Arrival geofence

The driver can request arrival when within a policy-defined radius and GPS accuracy is acceptable. If outside the geofence:

- Reject by default.
- Optionally allow an audited override with reason and current-location capture.
- Never silently replace the planned pickup point.

## 24.2 Rider OTP

- Generate server-side after assignment.
- Store a hashed value or protected secret.
- Rate-limit verification attempts.
- Bind OTP to request, assigned driver, and validity window.
- Only successful verification permits trip start unless an audited support override exists.

## 24.3 Package QR

- Bind QR/token to order and expected pickup/delivery stage.
- Verify assigned dispatch unit.
- Prevent replay.
- Store scan timestamp, driver, device, and location.
- Support a fallback photo/order-number flow with elevated audit requirements.

## 24.4 Start-trip authorization

Before transition to active:

- Assignment still active.
- Driver and vehicle match assignment.
- Rider/package verification complete.
- Driver at valid location or approved override.
- Payment or authorization rule satisfied.
- No safety or account block.

# 25. Cancellation, no-show, and reassignment

## 25.1 Cancellation records

Store:

```text
request_id
actor_type
actor_id
cancellation_code
comment
stage
location
created_at
fee_decision_reference
support_review_required
```

## 25.2 Driver cancellation reasons

Examples:

```text
RIDER_NO_SHOW
UNSAFE_PICKUP_LOCATION
RIDE_DETAILS_CHANGED
RIDER_BEHAVIOR
EMERGENCY
VEHICLE_ISSUE
APP_TECHNICAL_ISSUE
ROAD_CLOSURE
OTHER
```

Require comment for selected categories such as behavior, safety, emergency, or `OTHER`.

## 25.3 No-show

- Start waiting timer only after validated arrival.
- Notify rider.
- Expose call/chat.
- After grace period, allow no-show cancellation.
- Store arrival and wait evidence.
- Return driver to availability only after cancellation commits.

## 25.4 Rider change-driver request

A rider's `Change` action must not instantly abandon a driver without policy. Recommended flow:

1. Record reason.
2. Evaluate cancellation fee and abuse safeguards.
3. End current assignment transactionally.
4. Return driver to an appropriate state.
5. Increment rematch count.
6. Restart matching with previous driver excluded for that request.

## 25.5 Driver failure or disconnect

If a driver becomes stale after assignment:

- Attempt reconnect and push wake-up.
- Use a state-specific timeout.
- Notify rider of temporary connectivity loss.
- Reassign when the policy threshold is exceeded.
- Preserve incident logs.

# 26. Scheduled and recurring dispatch worker

## 26.1 Scheduler responsibilities

- Activate scheduled requests at configured lead times.
- Detect assignment risk.
- Verify current driver/vehicle compliance.
- Recompute driver-to-pickup ETA.
- Maintain backup candidates.
- Reassign before pickup when necessary.
- Handle recurrence generation for school and regular commutes.

## 26.2 Concurrency

Use database row locks or advisory locks so two scheduler workers cannot activate the same reservation simultaneously.

## 26.3 Recurrence

Store a recurrence rule and generate concrete service requests ahead of time. Never match an abstract recurring template directly.

## 26.4 Schedule conflict model

A candidate is infeasible when:

```text
current_commitment_end
+ travel_to_scheduled_pickup
+ required_buffer
> scheduled_pickup_window_end
```

Consider future commitments when offering an immediate job to a driver with a reservation.

# 27. Shared-ride route insertion

## 27.1 Route representation

```json
{
  "trip_session_id": "ts_440",
  "route_version": 12,
  "vehicle_capacity": 5,
  "stops": [
    {"sequence": 1, "type": "PICKUP", "booking_id": "b1"},
    {"sequence": 2, "type": "PICKUP", "booking_id": "b2"},
    {"sequence": 3, "type": "DROPOFF", "booking_id": "b1"},
    {"sequence": 4, "type": "DROPOFF", "booking_id": "b2"}
  ]
}
```

## 27.2 Insertion algorithm

For each eligible active trip session:

1. Enumerate valid pickup insertion positions.
2. Enumerate dropoff positions after pickup.
3. Recalculate route duration/distance.
4. Calculate seat occupancy across each segment.
5. Check every passenger time window and detour limit.
6. Check driver shift and energy.
7. Calculate insertion cost.
8. Keep the lowest-cost feasible insertion.

## 27.3 Atomic route update

Lock the `trip_sessions` row and verify `route_version` has not changed. Insert the booking and replacement stop sequence, then increment `route_version`. If another insertion won first, recompute against the new route.

## 27.4 Capacity example

```text
Initial capacity: 4 seats
Stop 1: pick up A (2 seats used)
Stop 2: pick up B (4 seats used)
Stop 3: drop A (2 seats used)
Stop 4: pick up C (3 seats used)
```

Capacity is checked per segment, not only at route start.

# 28. Delivery route optimization

## 28.1 Solver input

```json
{
  "vehicles": [
    {
      "dispatch_unit_id": "du_10",
      "capacity_kg": 800,
      "capacity_m3": 6.0,
      "shift_start": "2026-06-23T08:00:00+03:00",
      "shift_end": "2026-06-23T18:00:00+03:00",
      "start_location": {"lat": 0.31, "lon": 32.58}
    }
  ],
  "orders": [
    {
      "order_id": "ord_1",
      "pickup": {"lat": 0.30, "lon": 32.60},
      "delivery": {"lat": 0.35, "lon": 32.55},
      "weight_kg": 50,
      "volume_m3": 0.4,
      "pickup_window": ["09:00", "10:00"],
      "delivery_window": ["10:00", "12:00"],
      "service_seconds": 300
    }
  ]
}
```

## 28.2 Solver output

- Vehicle-order assignment.
- Ordered pickup/delivery stops.
- Estimated arrival times.
- Capacity utilization by segment.
- Total route duration and distance.
- Dropped jobs with explicit reason/penalty.

## 28.3 Operational limits

Optimization must have a strict time budget. When the solver cannot finish:

- Return best feasible solution found.
- Fall back to heuristic insertion.
- Never return a capacity- or precedence-violating route.

## 28.4 Re-optimization

Trigger when:

- A new urgent order arrives.
- A stop fails or is cancelled.
- Traffic causes material lateness.
- Vehicle becomes unavailable.
- Driver shift limit changes.

Do not constantly reshuffle routes in a way that makes commitments unreliable. Use a stability penalty for already-promised stops.

# 29. Policy engine

## 29.1 Policy document

```json
{
  "policy_id": "medical_pwd_kampala_v4",
  "service_type": "MEDICAL_PWD_RIDE",
  "market_id": "market_kampala",
  "mandatory_rules": [
    {"fact": "driver.pwd_trained", "operator": "EQ", "value": true},
    {"fact": "vehicle.wheelchair_accessible", "operator": "EQ", "value": true},
    {"fact": "driver.documents_valid", "operator": "EQ", "value": true},
    {"fact": "vehicle.available_seats", "operator": "GTE_REQUEST", "request_fact": "passengers"}
  ],
  "score_weights": {
    "pickup_eta": 0.45,
    "reliability": 0.25,
    "service_quality": 0.15,
    "idle_fairness": 0.10,
    "route_fit": 0.05
  },
  "candidate_indexes": ["medical", "accessible-van"],
  "search_rounds": [
    {"radius_km": 3, "geo_limit": 30},
    {"radius_km": 8, "geo_limit": 50},
    {"radius_km": 20, "geo_limit": 80}
  ],
  "route_matrix_candidate_limit": 12,
  "offer_waves": [
    {"size": 1, "timeout_seconds": 12},
    {"size": 2, "timeout_seconds": 12}
  ],
  "allow_vehicle_substitution": false,
  "minimum_location_freshness_seconds": 20,
  "energy_reserve_percent": 20,
  "fallbacks": ["EXPAND_RADIUS", "ADJACENT_ZONE", "OFFER_LATER_TIME"],
  "never_relax": [
    "PWD_TRAINING",
    "WHEELCHAIR_ACCESS",
    "CAPACITY",
    "DOCUMENTS",
    "INSURANCE",
    "ENERGY_RESERVE"
  ]
}
```

## 29.2 Policy validation

Before activation:

- JSON schema valid.
- All weights valid and sum correctly.
- Referenced facts exist.
- Search rounds increase logically.
- No forbidden sensitive attribute is referenced.
- Safety rules cannot be moved into optional scoring.
- Policy passes golden test cases.
- Checksum generated.
- Approval recorded.

## 29.3 Policy rollout

- Draft.
- Validate.
- Shadow evaluate against live requests without changing outcome.
- Canary by market or small percentage.
- Compare metrics and safety exclusions.
- Activate.
- Retain instant rollback.

## 29.4 OPA option

At initial scale, validated JSON policies evaluated in-process are sufficient. A policy engine such as OPA becomes useful when rules grow across markets, services, and jurisdictions. If used, keep latency low through local sidecar/in-process-compatible evaluation and versioned bundles. The assignment transaction still remains in the application/database domain.

# 30. API contracts

The exact URL style may be adapted to the existing backend. Preserve semantics, authorization, idempotency, and versioning.

## 30.1 Driver and dispatch-unit APIs

### Set active vehicle

```http
PUT /v1/drivers/me/active-vehicle
Idempotency-Key: <uuid>
```

```json
{
  "vehicle_id": "veh_320"
}
```

Validation:

- Driver assigned to vehicle.
- Vehicle active and verified.
- No incompatible active trip.
- Fleet rules satisfied.

### Go online

```http
POST /v1/dispatch-units/me/online
Idempotency-Key: <uuid>
```

```json
{
  "vehicle_id": "veh_320",
  "service_types": ["STANDARD_RIDE", "PARCEL_DELIVERY"],
  "location": {"lat": 0.3476, "lon": 32.5825, "accuracy_m": 8}
}
```

Response includes dispatch-unit ID, accepted services, policy blocks, and location-update token/channel.

### Go offline

```http
POST /v1/dispatch-units/me/offline
```

Reject or defer when an active trip exists unless the operation means `stop_new_offers_after_current_trip`.

### Location update

```http
POST /v1/dispatch-units/me/location
```

Support efficient streaming/batched transport when the mobile stack allows it.

## 30.2 Request APIs

### Create request

```http
POST /v1/service-requests
Idempotency-Key: <uuid>
```

### Get authoritative request state

```http
GET /v1/service-requests/{request_id}
```

### Cancel

```http
POST /v1/service-requests/{request_id}/cancel
Idempotency-Key: <uuid>
```

### Reschedule

```http
POST /v1/service-requests/{request_id}/reschedule
Idempotency-Key: <uuid>
```

## 30.3 Offer APIs

```http
GET  /v1/drivers/me/offers/active
POST /v1/offers/{offer_id}/accept
POST /v1/offers/{offer_id}/decline
```

Decline payload:

```json
{
  "reason_code": "TOO_FAR"
}
```

## 30.4 Trip transition APIs

```http
POST /v1/trips/{trip_id}/arrive-pickup
POST /v1/trips/{trip_id}/verify-rider
POST /v1/trips/{trip_id}/start
POST /v1/trips/{trip_id}/arrive-stop
POST /v1/trips/{trip_id}/complete-stop
POST /v1/trips/{trip_id}/complete
POST /v1/trips/{trip_id}/cancel
```

Every transition includes expected current version or uses a lock internally to prevent stale mobile actions.

## 30.5 Delivery verification APIs

```http
POST /v1/deliveries/{delivery_id}/verify-pickup-qr
POST /v1/deliveries/{delivery_id}/confirm-pickup
POST /v1/deliveries/{delivery_id}/verify-delivery-qr
POST /v1/deliveries/{delivery_id}/confirm-delivery
POST /v1/deliveries/{delivery_id}/report-issue
```

## 30.6 Admin policy APIs

```http
POST /v1/admin/dispatch-policies/validate
POST /v1/admin/dispatch-policies
POST /v1/admin/dispatch-policies/{policy_key}/{version}/activate
POST /v1/admin/dispatch-policies/{policy_key}/{version}/retire
GET  /v1/admin/dispatch-decisions/{request_id}
```

Use strong role-based authorization and audit every change.

# 31. API error model

Use a consistent format:

```json
{
  "code": "DRIVER_NOT_ELIGIBLE",
  "message": "The selected driver or vehicle cannot perform this service.",
  "details": {
    "reason_codes": ["DOCUMENT_EXPIRED"]
  },
  "trace_id": "tr_71a2"
}
```

Important codes:

```text
IDEMPOTENCY_CONFLICT
INVALID_STATE_TRANSITION
REQUEST_ALREADY_ASSIGNED
OFFER_EXPIRED
OFFER_ALREADY_TAKEN
DRIVER_NOT_ELIGIBLE
DRIVER_NOT_AVAILABLE
LOCATION_STALE
ACTIVE_VEHICLE_MISMATCH
PAYMENT_NOT_AUTHORIZED
OTP_INVALID
OTP_ATTEMPTS_EXCEEDED
OUTSIDE_PICKUP_GEOFENCE
SCHEDULE_CONFLICT
ROUTE_INFEASIBLE
NO_QUALIFIED_DRIVER
POLICY_NOT_FOUND
POLICY_VALIDATION_FAILED
VERSION_CONFLICT
```

# 32. Event contracts

Use versioned event envelopes:

```json
{
  "event_id": "evt_123",
  "event_type": "dispatch.request_assigned",
  "event_version": 1,
  "occurred_at": "2026-06-23T14:45:06Z",
  "aggregate_type": "service_request",
  "aggregate_id": "req_90231",
  "trace_id": "tr_71a2",
  "payload": {}
}
```

Core events:

```text
dispatch.request_created
dispatch.request_search_started
dispatch.candidates_evaluated
dispatch.offer_created
dispatch.offer_delivered
dispatch.offer_expired
dispatch.offer_declined
dispatch.offer_accepted
dispatch.request_assigned
dispatch.assignment_released
dispatch.no_qualified_driver
dispatch.request_cancelled

driver.went_online
driver.went_offline
driver.location_updated
driver.eligibility_changed
driver.active_vehicle_changed
driver.break_required

driver.en_route_pickup
driver.arrived_pickup
trip.rider_verified
trip.started
trip.stop_completed
trip.completed
trip.cancelled

delivery.package_verified
delivery.picked_up
delivery.delivered
```

Consumers must be idempotent. Event delivery may be at least once.

# 33. Real-time communication

## 33.1 WebSocket topics

```text
user:{account_id}
driver:{driver_id}
dispatch-unit:{dispatch_unit_id}
request:{request_id}
trip:{trip_session_id}
fleet:{fleet_id}
```

## 33.2 Client events

```text
request.searching
request.offer_wave_changed
request.assigned
request.no_driver_found
request.cancelled

offer.created
offer.expired
offer.cancelled

driver.location
trip.driver_en_route
trip.driver_arrived
trip.started
trip.progress
trip.completed
```

## 33.3 Push fallback

Use FCM/APNs to wake or notify the app when it is backgrounded. The push payload contains identifiers and a state version, not the only copy of authoritative data. The app reconnects and fetches current state.

## 33.4 Reconnection

On reconnect, the client sends last received sequence/version. The server returns missed state or an authoritative snapshot. Duplicate events must be harmless.

# 34. Surge and supply balancing

Dispatch integrates with but does not own fare calculation.

## 34.1 Inputs

- Demand per H3 cell/service/time window.
- Available eligible supply.
- Average pickup ETA.
- Search failure rate.
- Acceptance rate.
- Active surge/fare-zone output.

## 34.2 Driver ranking

Surge does not make an ineligible driver eligible. It may affect:

- Candidate relocation suggestions.
- Offer attractiveness.
- Zone-balancing score within strict bounds.

## 34.3 Anti-gaming

- Detect coordinated offline/online behavior.
- Detect GPS spoofing into surge zones.
- Require location consistency before assigning surge benefits.
- Audit zone transitions and device integrity signals.

# 35. Safety, privacy, and security

## 35.1 Authentication and authorization

- Use short-lived access tokens and refresh-token rotation.
- Bind driver actions to authenticated driver and active dispatch unit.
- Authorize fleet managers separately from drivers.
- Use least-privilege service accounts.
- Protect admin policy endpoints with strong roles and multi-factor authentication.

## 35.2 Data minimization

Before acceptance, expose only approximate pickup area and necessary job facts. Reveal exact contact information only according to trip state and privacy policy.

## 35.3 Sensitive attributes

Do not store or use sensitive attributes in dispatch scoring unless strictly required by law and approved by governance. Functional preferences should be explicit, optional, and explainable.

## 35.4 GPS spoofing and device risk

Signals:

- Impossible jumps.
- Unrealistic speed.
- Repeated perfect/static coordinates.
- Emulator/root/jailbreak signals where legally and technically appropriate.
- Mismatch between network and GPS region.
- Frequent surge-zone teleporting.

Risk response should be graduated: reduce trust, request stronger verification, suspend live availability, or route to review.

## 35.5 Abuse protection

Rate-limit:

- Request creation.
- Driver online/offline toggles.
- Offer acceptance.
- OTP attempts.
- Change-driver requests.
- Cancellation.
- QR verification.

## 35.6 Secrets and encryption

- Encrypt data in transit.
- Encrypt sensitive fields at rest where appropriate.
- Never store plaintext OTPs longer than necessary.
- Rotate provider keys.
- Redact PII from general logs.

## 35.7 Auditability

Record:

- Who changed policy.
- Which policy version matched a request.
- Eligibility failures.
- Candidate scores.
- Offer exposure.
- Assignment transaction result.
- Overrides and support actions.

# 36. Fairness and marketplace health

## 36.1 Goals

- Reasonable rider pickup times.
- Broad driver opportunity.
- No systematic starvation of new drivers.
- No incentive to speed or manipulate location.
- Transparent service-specific pools.

## 36.2 Cold start

For new drivers:

- Use market priors for reliability and rating.
- Do not assign zero quality solely because of no history.
- Cap both positive and negative impact until sufficient samples exist.
- Monitor early trips more closely for safety rather than suppressing all opportunity.

## 36.3 Exposure metrics

Track per driver/service:

```text
offers_seen
offers_accepted
offers_expired
eligible_searches
rank_position_distribution
jobs_assigned
idle_minutes
deadhead_km
earnings_per_online_hour
```

## 36.4 Fairness constraints

Fairness can reorder near-equivalent candidates. It must not override:

- Safety.
- Legal/compliance rules.
- Capacity.
- Accessibility.
- Schedule feasibility.
- Energy reserve.
- Extreme ETA differences.

# 37. Observability

## 37.1 Tracing

Propagate:

```text
trace_id
request_id
offer_id
assignment_id
dispatch_unit_id
trip_session_id
policy_version
```

Trace stages:

```text
request.persist
policy.load
geo.search
snapshot.load
eligibility.evaluate
route_matrix.call
route_feasibility.evaluate
rank.compute
offers.persist
offers.deliver
assignment.transaction
notifications.publish
```

## 37.2 Metrics

### Latency

```text
request_to_search_start_ms
geo_search_ms
eligibility_ms
route_matrix_ms
ranking_ms
first_offer_ms
request_to_assignment_ms
accept_transaction_ms
state_event_delivery_ms
```

### Marketplace

```text
candidate_count
eligible_candidate_count
no_qualified_driver_rate
acceptance_rate
offer_timeout_rate
pickup_eta
actual_pickup_time
rider_cancel_rate
driver_cancel_rate
reassignment_rate
```

### Correctness

```text
duplicate_assignment_attempts
duplicate_assignment_successes
stale_offer_acceptance_attempts
invalid_transition_attempts
route_version_conflicts
idempotency_replays
```

`duplicate_assignment_successes` must always be zero.

### Service quality

Segment by:

- Market.
- Service type.
- Vehicle class.
- Fleet/individual.
- Scheduled/immediate.
- Policy version.
- App version.

## 37.3 Logs

Use structured logs. Do not write full candidate PII. Record reason codes and identifiers needed for debugging.

## 37.4 Alerts

Alert on:

- Assignment conflict anomalies.
- First-offer latency breach.
- Route provider failure rate.
- Redis GEO mismatch or stale growth.
- Outbox backlog.
- WebSocket delivery failure.
- Sudden no-driver rate increase.
- Policy-version error spike.
- GPS spoofing spike.

# 38. Performance and SLO targets

Initial production targets:

| Operation | Target |
|---|---:|
| Location ingestion p95 | < 100 ms server processing |
| Redis candidate lookup p95 | < 50 ms |
| Eligibility evaluation for shortlist p95 | < 50 ms |
| Route matrix p95 | < 500 ms, provider dependent |
| Full candidate ranking p95 | < 300 ms excluding route provider |
| First offer dispatched p95 | < 1 second from search activation |
| Acceptance transaction p95 | < 150 ms |
| Rider/driver state propagation p95 | < 500 ms |
| Successful duplicate assignments | 0 |

Set service-specific assignment SLOs rather than one universal number.

## 38.1 Capacity planning variables

Estimate:

```text
online_dispatch_units
location_updates_per_second
new_requests_per_second
active_searches
offers_per_second
WebSocket connections
route_matrix_elements_per_second
outbox_events_per_second
```

Example formula:

```text
location_update_qps =
  online_waiting_drivers / waiting_update_interval
  + active_trip_drivers / active_update_interval
```

## 38.2 Backpressure

- Bound matching worker concurrency.
- Queue searches by urgency and scheduled pickup time.
- Apply route-provider concurrency limits.
- Degrade to approximate ETA when provider saturation occurs.
- Avoid unbounded offer fan-out.

# 39. Reliability and fallback matrix

| Failure | Required behavior |
|---|---|
| Redis unavailable | Use PostGIS fallback for a reduced, safe candidate search; rebuild Redis from durable/live sources. |
| Route provider unavailable | Use short-lived cache or conservative approximate ETA with uncertainty penalty. |
| WebSocket disconnected | Push notification plus authoritative state refresh. |
| Push delayed/dropped | WebSocket or client polling fallback; assignment remains server-owned. |
| PostgreSQL unavailable | Do not create final assignments; fail safely and preserve queued intent where possible. |
| Outbox publisher unavailable | Transactions continue; events remain in outbox for retry. |
| Matching worker crash | Lease expires; another worker resumes from durable request state. |
| Driver app crash | Offer expires or state is recovered from server on reconnect. |
| Duplicate client request | Return idempotent original response. |
| Stale/out-of-order GPS | Discard by sequence/timestamp. |
| Policy cache miss | Load pinned version from database; never silently use unrelated policy. |
| Optimizer timeout | Use best feasible solution or heuristic; never violate constraints. |
| Scheduled driver at risk | Activate backup/reassignment workflow before pickup. |

# 40. Transactional outbox worker

## 40.1 Claim pattern

Use `FOR UPDATE SKIP LOCKED` in small batches:

```sql
WITH claimed AS (
  SELECT id
  FROM outbox_events
  WHERE published_at IS NULL
  ORDER BY occurred_at
  FOR UPDATE SKIP LOCKED
  LIMIT 100
)
SELECT o.*
FROM outbox_events o
JOIN claimed c ON c.id = o.id;
```

Publish, then mark `published_at`. Consumers deduplicate using `event_id`.

## 40.2 Retry

Use exponential backoff with jitter and a dead-letter or operator-review state after a high retry count. Preserve the original payload.

# 41. Decision trace and explainability

For each search, store a compact summary:

```json
{
  "request_id": "req_90231",
  "policy_version": "standard_kampala_v7",
  "search_rounds": [
    {"radius_km": 2, "geo_candidates": 18, "eligible": 5}
  ],
  "selected": {
    "dispatch_unit_id": "du_10023",
    "score": 0.8732,
    "pickup_eta_seconds": 240,
    "rank": 1
  },
  "top_candidates": [
    {
      "dispatch_unit_id": "du_10023",
      "eligible": true,
      "components": {
        "eta": 0.91,
        "reliability": 0.84,
        "fairness": 0.74,
        "quality": 0.87,
        "route_fit": 0.80
      }
    }
  ],
  "excluded_reason_counts": {
    "LOCATION_STALE": 4,
    "VEHICLE_CLASS_NOT_ALLOWED": 3,
    "ACTIVE_ASSIGNMENT_CONFLICT": 2
  }
}
```

Full candidate details can be retained for a limited period or sampled according to privacy and storage policy.

# 42. Testing strategy

## 42.1 Unit tests

Test:

- Every eligibility rule and reason code.
- Score normalization and weights.
- Tie-breakers.
- Energy calculations.
- Schedule-conflict calculations.
- Shared-route capacity across segments.
- Delivery pickup-before-dropoff constraints.
- Policy schema validation.
- State transitions.
- Idempotency hashing.

## 42.2 Golden policy tests

Maintain fixtures for each service:

```text
Medical request + ordinary sedan -> rejected
Medical request + accessible trained van -> eligible
School route + unapproved driver -> rejected
Inter-city EV with insufficient reserve -> rejected
Shared insertion exceeding rider detour -> rejected
Premium request + standard vehicle -> rejected
Parcel 500 kg + scooter -> rejected
```

Every policy change runs all fixtures.

## 42.3 Integration tests

Use real PostgreSQL/PostGIS and Redis containers. Test:

- GEO shortlist and snapshot filtering.
- Redis stale cleanup.
- Request creation and outbox.
- Offer creation/expiry.
- Atomic assignment.
- Cancellation race.
- Scheduled activation.
- WebSocket event sequences.
- PostGIS fallback.

## 42.4 Concurrency tests

Required tests:

1. 100 drivers accept the same offer/request concurrently: exactly one assignment.
2. One driver accepts two requests concurrently: at most one active assignment.
3. Rider cancels while driver accepts: one deterministic committed result.
4. Two shared insertions update one trip route: no lost update; route capacity valid.
5. Duplicate accept requests with same idempotency key: same response.
6. Offer expires at the same moment acceptance arrives: policy-defined deterministic behavior.

## 42.5 Property-based tests

Useful invariants:

- Occupancy never exceeds vehicle capacity.
- Pickup precedes corresponding dropoff.
- Assignment uniqueness always holds.
- Score remains within expected bounds.
- Mandatory false condition always rejects.
- Route time windows remain valid after insertion.

## 42.6 Load tests

Simulate:

- Normal peak.
- Stadium/event spike.
- Rain/traffic spike.
- Large driver reconnect storm.
- Route provider slowdown.
- Redis failover.
- Scheduled morning school activation.
- High shared-ride insertion rate.

Track first-offer and assignment latency, database lock waits, Redis CPU, route-provider quotas, and event backlog.

## 42.7 Chaos and recovery tests

- Kill matcher after offers are persisted.
- Kill app after acceptance before response reaches driver.
- Restart Redis and rebuild indexes.
- Delay outbox publication.
- Drop WebSocket connections.
- Inject stale GPS.
- Fail policy cache.

## 42.8 Security tests

- Unauthorized driver accepts another driver's offer.
- Replay QR/OTP.
- GPS spoofing inputs.
- Idempotency key collision.
- Admin policy privilege escalation.
- PII leakage in logs or pre-accept offer payloads.

# 43. Deployment and migration into an existing backend

## 43.1 Discovery first

Before coding:

- Identify current language/framework.
- Find driver, vehicle, ride, delivery, schedule, fleet, and payment models.
- Find existing status enums and transitions.
- Find current location storage and real-time channels.
- Find current databases, cache, queue, and deployment platform.
- Identify existing API consumers and backward-compatibility needs.
- Find current document/compliance sources.

## 43.2 Preserve and adapt

Do not duplicate existing concepts unnecessarily. Add adapters where current naming differs. Preserve existing IDs and public API behavior where feasible.

## 43.3 Safe migration sequence

1. Add new tables/columns and indexes without removing old paths.
2. Backfill dispatch-unit records from current drivers and active vehicles.
3. Build eligibility snapshots.
4. Dual-write live state to old and new systems.
5. Run matcher in shadow mode and compare selections.
6. Enable one low-risk service/market behind a feature flag.
7. Expand gradually.
8. Remove legacy matching only after stable production evidence.

## 43.4 Shadow comparison

For every production request, calculate the proposed decision without offering it. Compare:

- Candidate overlap.
- Selected-driver difference.
- Predicted pickup ETA.
- Eligibility exclusions.
- Safety/compliance mismatches.
- Fairness and acceptance projections.

## 43.5 Feature flags

Recommended flags:

```text
dispatch_v2_enabled
dispatch_v2_market_{id}
dispatch_v2_service_{type}
route_matrix_enabled
shared_insertion_enabled
delivery_optimizer_enabled
policy_engine_enabled
postgis_fallback_enabled
```

# 44. Implementation modules

Use equivalent package names in the existing stack:

```text
dispatch/domain
  Driver
  Vehicle
  DispatchUnit
  ServiceRequest
  Offer
  Assignment
  TripSession
  Policy

dispatch/application
  CreateRequest
  MatchRequest
  EvaluateEligibility
  RankCandidates
  CreateOfferWave
  AcceptOffer
  CancelRequest
  TransitionTrip

dispatch/infrastructure
  PostgresRepositories
  RedisLiveState
  RedisGeoIndex
  RouteMatrixAdapter
  RouteOptimizerAdapter
  WebSocketPublisher
  PushPublisher
  OutboxPublisher

dispatch/workers
  MatchingWorker
  OfferExpiryWorker
  ScheduledDispatchWorker
  StaleDriverCleanupWorker
  OutboxWorker
  SnapshotRefreshWorker
```

Keep domain logic free from HTTP controllers and vendor response types.

# 45. Reference implementation flow

## 45.1 Create request

```pseudo
transaction:
    idempotency = claimIdempotency(scope, key, payloadHash)
    if existing response:
        return existing response

    validateAndNormalize(payload)
    policy = resolvePolicy(market, serviceType, scheduledAt)
    request = insertRequest(status = scheduled ? SCHEDULED : SEARCHING)
    insertRequirements(request)
    insertStops(request)
    insertOutbox("dispatch.request_created")
    storeIdempotentResponse(request)
commit

if request.status == SEARCHING:
    enqueueMatch(request.id)
```

## 45.2 Build eligibility snapshot

```pseudo
snapshot = {
    driverVerified,
    safetyClear,
    activeVehicleId,
    vehicleVerified,
    activeCertifications,
    enabledServices,
    vehicleCapabilities,
    validDocumentTypes,
    fleetRules,
    remainingShiftMinutes,
    complianceVersion
}

write PostgreSQL durable snapshot/version
write Redis compact snapshot
update GEO index membership
```

## 45.3 Offer delivery

```pseudo
for candidate in wave:
    if acquireDriverOfferLease(candidate.id, offer.id, ttl):
        persist offer if not already persisted
        publish WebSocket event
        enqueue push fallback
    else:
        mark skipped due to offer conflict
```

## 45.4 Rebuild Redis after failure

```pseudo
query durable dispatch units where:
    status == AVAILABLE
    last_seen_at within safe threshold
    compliance snapshot valid

for each unit:
    rebuild live hash
    rebuild relevant GEO memberships
    rebuild freshness score
```

# 46. Operational runbooks

## 46.1 No-driver rate spike

1. Segment by market, service, and policy version.
2. Check live supply and stale-location cleanup.
3. Check policy activation and eligibility reason counts.
4. Check document/compliance source health.
5. Check Redis index counts versus PostgreSQL.
6. Check route-provider failures.
7. Roll back policy if the spike begins at activation.
8. Never disable mandatory safety rules as an emergency fix.

## 46.2 Assignment latency spike

1. Inspect route-matrix latency.
2. Inspect Redis and database latency.
3. Check matching queue depth.
4. Check worker saturation.
5. Degrade to approximate ETA if provider threshold crossed.
6. Reduce route candidate count temporarily through policy.
7. Preserve assignment correctness.

## 46.3 Duplicate-assignment alert

Any successful duplicate assignment is a severity-one incident:

1. Stop affected assignment path behind feature flag.
2. Preserve database and logs.
3. Identify constraint or transaction bypass.
4. Correct rider/driver state operationally.
5. Add regression concurrency test.
6. Do not rely on Redis locks as the fix.

## 46.4 Redis mismatch

1. Compare GEO membership with durable available units.
2. Run safe rebuild.
3. Inspect snapshot update/event consumer lag.
4. Remove stale members.
5. Continue PostGIS fallback if needed.

## 46.5 Policy rollback

- Policies are immutable versions.
- Activate prior version.
- New searches use prior version.
- Existing requests remain pinned unless an explicit migration rule is approved.

# 47. Brand/status mapping for operational interfaces

Use the EVzone palette consistently in admin and operational tooling:

| Meaning | Color |
|---|---|
| Active, eligible, successful | Green `#03cd8c` |
| Pending, warning, limited | Orange `#f77f00` |
| Offline, unavailable, neutral | Medium grey `#a6a6a6` |
| Inactive background | Light grey `#f2f2f2` |

Red remains appropriate for rejected, blocked, expired-critical, cancellation, and emergency states, using the product design system's approved red token.

# 48. Recommended technology choices

The implementation must follow the existing backend stack where practical. When a new component is required, the following choices are recommended:

| Concern | Recommended choice | Notes |
|---|---|---|
| API and matching runtime | Existing production language; Go is strong for a new high-throughput service, while NestJS/Fastify is suitable for a TypeScript-centered backend | Do not rewrite a stable backend solely to change language. |
| Durable database | PostgreSQL with PostGIS | Required semantics are transactions, row locks, constraints, and geospatial fallback. |
| Live state/cache | Redis | GEO indexes, live snapshots, leases, counters, and short-lived ETA cache. |
| Real-time client updates | Existing WebSocket infrastructure | Use state versions and reconnection reconciliation. |
| Background mobile wake-up | FCM and APNs | Notification is a wake-up/fallback, not the source of truth. |
| Routing | Provider adapter for Google Routes, Mapbox, OSRM, or another approved service | Support route matrix and travel mode. |
| Route optimization | OR-Tools or an existing equivalent behind an adapter | Required for shared and multi-stop delivery constraints. |
| Events at launch | PostgreSQL transactional outbox | Avoid introducing a broker before it is operationally justified. |
| Events at scale | Kafka, Redpanda, or the existing durable broker | Consumers remain idempotent. |
| Tracing | OpenTelemetry-compatible instrumentation | Propagate request, offer, assignment, trip, and policy identifiers. |
| Metrics/dashboards | Existing platform, commonly Prometheus and Grafana | Build service and policy-version dashboards. |

## 48.1 Environment/configuration checklist

Document and validate configuration for:

```text
DATABASE_URL
REDIS_URL
DISPATCH_FEATURE_FLAGS
DISPATCH_DEFAULT_MARKET
DISPATCH_LOCATION_FRESHNESS_SECONDS
DISPATCH_SEARCH_RADII_KM
DISPATCH_GEO_CANDIDATE_LIMIT
DISPATCH_ROUTE_MATRIX_CANDIDATE_LIMIT
DISPATCH_ROUTE_MATRIX_TIMEOUT_MS
DISPATCH_ROUTE_PROVIDER
DISPATCH_ROUTE_PROVIDER_API_KEY
DISPATCH_ETA_CACHE_TTL_SECONDS
DISPATCH_OFFER_TIMEOUT_SECONDS
DISPATCH_MATCHING_WORKER_CONCURRENCY
DISPATCH_SCHEDULE_LOOKAHEAD_MINUTES
DISPATCH_EV_RESERVE_PERCENT
DISPATCH_SHARED_MAX_DETOUR_SECONDS
DISPATCH_SHARED_MAX_DETOUR_PERCENT
DISPATCH_OUTBOX_BATCH_SIZE
DISPATCH_OUTBOX_RETRY_LIMIT
DISPATCH_DECISION_TRACE_RETENTION_DAYS
DISPATCH_LIVE_LOCATION_RETENTION_DAYS
WEBSOCKET_PUBLIC_URL
FCM_PROJECT_CONFIGURATION
APNS_CONFIGURATION
OTEL_EXPORTER_CONFIGURATION
```

Configuration should be typed, schema-validated at startup, and split into global defaults plus market/service policy values. Never commit production credentials.

# 49. Phased implementation plan

## Phase 0 - Repository and data audit

Deliverables:

- Current architecture map.
- Existing model/API mapping.
- Gap list.
- Migration plan.
- Feature-flag plan.
- Baseline performance metrics.

## Phase 1 - Correctness foundation

- State machines.
- Idempotency.
- PostgreSQL constraints.
- Dispatch-unit model.
- Active vehicle rule.
- Requests, offers, assignments, outbox.
- Atomic acceptance tests.

## Phase 2 - Live availability and candidate discovery

- Location gateway.
- Redis GEO indexes.
- Live snapshots.
- Stale cleanup.
- PostGIS fallback.
- Online/offline workflow.

## Phase 3 - Standard instant rides

- Policy loader.
- Eligibility engine.
- Route matrix.
- Ranking and fairness.
- Offer waves.
- WebSocket and push fallback.
- Rider search events.

## Phase 4 - Scheduled, premium, inter-city, and airport

- Scheduler.
- Reservation conflict checks.
- Backup assignment.
- Full-route energy and shift feasibility.

## Phase 5 - School, medical/PWD, and specialist services

- Certifications and capabilities.
- Roster continuity.
- Strict fallback rules.
- Specialist policy fixtures.

## Phase 6 - Shared rides

- Trip session/bookings.
- Route insertion.
- Capacity/time-window constraints.
- Atomic route versioning.

## Phase 7 - Deliveries, vans, and trucks

- Cargo requirements.
- QR verification.
- Route optimizer.
- Multi-order route sessions.
- Pickup/delivery state machine.

## Phase 8 - Scale, optimization, and governance

- Shadow policy evaluation.
- Experiment tooling.
- Advanced observability.
- Fraud and spoofing controls.
- Marketplace tuning.
- Data warehouse dashboards.

# 50. Definition of done

The implementation is complete only when:

## Correctness

- Database guarantees one active winner per request.
- Database guarantees no conflicting active assignment per dispatch unit.
- Idempotent retry tests pass.
- All state transitions are validated.
- Shared-route capacity and stop-order invariants pass.

## Functionality

- All listed service types are represented by versioned policies.
- Active vehicle and fleet relationships work.
- Immediate and scheduled matching work.
- EV range checks work.
- Accessibility, school, medical, passenger, cargo, and vehicle requirements are enforced.
- Offer timeout, decline, expiry, cancellation, no-show, and rematch work.
- WebSocket updates and push fallback work.

## Performance

- First-offer and assignment SLOs are met under expected peak load.
- Redis fallback and route-provider degradation are tested.
- No unbounded fan-out occurs.

## Operations

- Metrics, logs, traces, and alerts exist.
- Policy versions and decisions are auditable.
- Redis can be rebuilt.
- Outbox events recover after failure.
- Runbooks are tested.

## Security and governance

- Authorization tests pass.
- OTP/QR replay is prevented.
- PII is minimized.
- Sensitive attributes are not used in ranking.
- Admin policy changes are audited.

## Documentation

- Migrations documented.
- Environment variables documented.
- API documentation updated.
- Event schemas documented.
- Local-development and deployment instructions updated.
- Architecture decision records created for important deviations.

# 51. Acceptance scenarios

## Scenario A - Normal instant ride

Given five nearby standard drivers, one stale driver, one busy driver, and three eligible drivers, the system calculates ETA for eligible candidates, ranks them, sends a short offer, and atomically assigns the first valid acceptance.

## Scenario B - Wheelchair trip

A closer ordinary sedan is excluded. A farther accessible van with a trained driver is offered. If none exists, the system expands radius or offers a later time without weakening requirements.

## Scenario C - Inter-city EV

A nearby EV with insufficient full-route reserve is excluded. A farther EV or combustion vehicle meeting the selected product policy is considered.

## Scenario D - School roster

The previously assigned approved school driver is preferred when still feasible. An unapproved nearby driver is never considered.

## Scenario E - Shared insertion

A new rider is added only when capacity and every existing passenger's detour/time-window limit remain valid. The route update is atomic.

## Scenario F - Concurrent acceptance

Two drivers accept within milliseconds. One transaction commits. The other receives `OFFER_ALREADY_TAKEN`. No duplicate trip exists.

## Scenario G - Redis outage

The matcher uses safe PostGIS fallback with recent durable locations. Assignment correctness remains in PostgreSQL.

## Scenario H - Scheduled driver risk

The assigned driver's vehicle changes to an ineligible vehicle before pickup. The scheduler releases the assignment and activates a qualified backup according to policy.

## Scenario I - Delivery van route

Orders are assigned to a van only when weight, volume, pickup-delivery precedence, time windows, route restrictions, and driver shift all pass.

# 52. Defaults requiring business approval

The following should start as configuration and be approved per market:

- Location freshness thresholds.
- Search radius sequence.
- Offer timeout and wave size.
- Maximum pickup ETA.
- Driver-hours and mandatory break rules.
- EV reserve percentage.
- Shared-ride detour limits.
- School continuity weight.
- Medical/PWD certification list.
- Vehicle substitution rules.
- Cancellation/no-show grace period and fee rules.
- Scheduled assignment lead times.
- Data retention periods.
- Fairness weight and earnings window.

# 53. Technical reference links

Primary implementation references:

- Redis geospatial data and `GEOSEARCH`: <https://redis.io/docs/latest/develop/data-types/geospatial/> and <https://redis.io/docs/latest/commands/geosearch/>
- PostgreSQL row-level locking and `SELECT ... FOR UPDATE`: <https://www.postgresql.org/docs/current/explicit-locking.html>
- PostGIS nearest-neighbor distance operator: <https://postgis.net/docs/geometry_distance_knn.html>
- H3 hierarchical geospatial indexing: <https://h3geo.org/docs/>
- Google Routes API Compute Route Matrix: <https://developers.google.com/maps/documentation/routes/compute-route-matrix-over>
- OR-Tools vehicle routing and pickup/delivery constraints: <https://developers.google.com/optimization/routing> and <https://developers.google.com/optimization/routing/pickup_delivery>
- Open Policy Agent: <https://openpolicyagent.org/docs>
- Firebase Cloud Messaging delivery behavior: <https://firebase.google.com/docs/cloud-messaging/understand-delivery>

# 54. Final implementation principle

> EVzoneRide must operate one universal, policy-driven dispatch platform. It matches a verified driver-vehicle dispatch unit to a normalized request, rejects every unsafe or infeasible candidate before scoring, ranks the remaining candidates with real pickup ETA and bounded fairness, sends controlled offer waves, and commits the winner atomically in PostgreSQL. The same engine supports passenger, school, accessibility, inter-city, shared, delivery, fleet, and EV services through versioned policies rather than duplicated matching code.

