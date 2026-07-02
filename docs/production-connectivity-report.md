# EVzone Ride Platform — Production Connectivity Audit & Implementation Report

**Version:** 1.0  
**Date:** 2026-07-02  
**Scope:** All six projects in the `EVzone-Rides` workspace  
**Goal:** Make `EVzone-Ride-Backend` the single source of truth, eliminate production local/demo fallbacks, and fully map frontend expectations to backend endpoints.

---

## Executive Summary

The `EVzone-Ride-Backend` is a mature, production-scale NestJS platform with **714 OpenAPI paths** covering rides, deliveries, rentals, tours, ambulance, drivers, vehicles, fleet, agents, admin, finance, governance, safety, notifications, files, payments, wallets, and corporate integrations. It enforces JWT authentication, role-based access control (RBAC), permission-based access control (PBAC), idempotency, audit logging, and rate limiting under the global prefix `/api/v1`.

**Current connectivity verdict:**

| App | Real endpoints used | Mock/local endpoints | Production-readiness verdict |
|-----|---------------------|----------------------|------------------------------|
| `EvzoneRide` (Rider) | 6 | ~70+ | ❌ Not production-connected |
| `Driver-s-app` | ~10 (auth only) | ~60+ | ❌ Not production-connected |
| `Rides-Admin` | ~50+ | Some demo fallback when backend disabled | ⚠️ Connected but demo layer must be disabled |
| `Agent-Portal` | 4 auth endpoints | All other screens | ❌ Not production-connected |
| `FleetPartnerAPP` | 0 | Entire app | ❌ Not production-connected |

**Critical blockers resolved during this audit:**
- Backend `package.json` has no unresolved merge conflicts (contrary to the prior audit resource).
- Backend lint, build, tests, OpenAPI export, and contract check all pass after provisioning a local PostgreSQL instance.
- `npm run smoke:health` now passes against a PostgreSQL cluster with PostGIS.
- Database migration chain fixed:
  - `InitialProductionBaseline` timestamp corrected so it runs first.
  - Payment and cashout idempotency migrations made conditional (idempotent).
  - `ReconciliationEngine` migration now adds the `VARIANCE` enum value before using it.
  - `DispatchGeoSpatialIndex` migration syntax fixed for PostgreSQL 18 + PostGIS 3.6 compatibility.
  - Health indicator updated to expect the actual latest migration (`PartnerIntegrationFramework1785000002000`).

**Critical remaining blockers:**
1. Rider and Driver apps store vehicles, documents, jobs, trips, and wallet data in `localStorage` / base64 data URLs.
2. Agent and Fleet portals have no real API integration beyond (partial) auth.
3. Admin app still contains a `localStorage` demo fallback layer that must be disabled in production.
4. File upload flow in Driver app must be routed through `POST /api/v1/files/upload` instead of base64 `localStorage`.

---

## 1. Backend Architecture & Contract

### 1.1 Stack & global behavior

| Concern | Implementation |
|---------|----------------|
| Framework | NestJS 11 |
| ORM | TypeORM 0.3 |
| Database | PostgreSQL (mandatory) |
| Global prefix | `/api/v1` |
| Auth | JWT Bearer (`Authorization: Bearer <token>`) |
| Guards (global) | ThrottlerGuard, JwtAuthGuard, RolesGuard, PermissionGuard |
| Public routes | `@Public()` decorator |
| Idempotency | `Idempotency-Key` header on write endpoints |
| File storage | Cloudinary via `POST /api/v1/files/upload` |
| Realtime | Socket.IO with Redis adapter |
| OpenAPI | `docs/openapi.json` — 714 paths, 389 schemas |

### 1.2 Role model

`UserRole` enum includes: `CUSTOMER`, `RIDER`, `DRIVER`, `FLEET_MANAGER`, `FLEET_PARTNER`, `AGENT`, `DISPATCHER`, `TOUR_OPERATOR`, `RENTAL_PARTNER`, `MEDICAL_PARTNER`, `SUPPORT`, `ADMIN`.

### 1.3 Base URL convention

All frontend requests must target:

```
https://<backend-domain>/api/v1/<route>
```

Examples:
- `POST /auth/login` → `POST /api/v1/auth/login`
- `GET /drivers/me` → `GET /api/v1/drivers/me`
- `GET /admin/riders` → `GET /api/v1/admin/riders`

---

## 2. Backend Endpoint Inventory by Domain

### 2.1 Authentication

| Method | Endpoint | Auth | Purpose | Frontend apps using it |
|--------|----------|------|---------|------------------------|
| POST | `/auth/register` | Public | Register user | Driver, Admin |
| POST | `/auth/login` | Public | Login | Rider, Driver, Admin, Agent |
| POST | `/auth/refresh` | Public | Rotate refresh token | Rider, Driver, Admin |
| POST | `/auth/logout` | JWT | Logout | Rider, Driver, Admin, Agent |
| GET | `/auth/me` | JWT | Current user | Rider, Driver, Agent |
| GET | `/auth/session` | JWT | Session hydrate | Admin |
| POST | `/auth/request-otp` | Public | Request OTP | Driver |
| POST | `/auth/verify-otp` | Public | Verify OTP | Driver, Admin |
| POST | `/auth/forgot-password` | Public | Forgot password | Driver, Admin |
| POST | `/auth/reset-password` | Public | Reset password | Driver, Admin |
| POST | `/auth/change-password` | JWT | Change password | Driver |

### 2.2 Users / Profile / Places

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET/PATCH | `/users/me` | JWT | Profile |
| GET/POST/PATCH/DELETE | `/users/me/addresses` | JWT | Saved addresses |
| GET/POST/PATCH/DELETE | `/users/me/places` | RIDER/CUSTOMER | Saved places (also under `/riders/me/places`) |
| GET/POST/PATCH/DELETE | `/users/me/contacts` | JWT | Contacts |
| GET/PATCH | `/users/me/preferences` | JWT | Preferences |

### 2.3 Rides

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/rides/estimate` | JWT | Fare estimate |
| POST | `/rides` | JWT + idempotency | Create ride |
| GET | `/rides` | JWT | List my rides |
| GET | `/rides/:id` | JWT | Ride detail |
| POST | `/rides/:id/cancel` | JWT | Cancel ride |
| POST | `/rides/:id/feedback` | JWT | Rate driver/ride |
| POST | `/rides/:id/share` | JWT | Share ride |
| POST | `/rides/:id/passengers` | JWT | Add shared passenger |
| POST | `/rides/:id/change-driver` | JWT | Change driver |
| POST | `/rides/driver/:id/accept` | DRIVER | Driver accept |
| POST | `/rides/driver/:id/reject` | DRIVER | Driver reject |
| POST | `/rides/driver/:id/arrive` | DRIVER | Arrive |
| POST | `/rides/driver/:id/verify-otp` | DRIVER | Verify OTP |
| POST | `/rides/driver/:id/start` | DRIVER | Start ride |
| POST | `/rides/driver/:id/complete` | DRIVER | Complete ride |
| POST | `/rides/driver/:id/no-show` | DRIVER | No-show |

### 2.4 Deliveries

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/deliveries/estimate` | JWT | Estimate |
| POST | `/deliveries` | JWT + idempotency | Create delivery |
| GET | `/deliveries` | JWT | List deliveries |
| GET | `/deliveries/:id` | JWT | Detail |
| POST | `/deliveries/:id/cancel` | JWT | Cancel |
| POST | `/deliveries/:id/feedback` | JWT | Feedback |
| POST | `/deliveries/driver/:id/accept` | DRIVER | Accept |
| POST | `/deliveries/driver/:id/reject` | DRIVER | Reject |
| POST | `/deliveries/driver/:id/arrive-pickup` | DRIVER | Arrive pickup |
| POST | `/deliveries/driver/:id/verify-pickup` | DRIVER | Verify QR pickup |
| POST | `/deliveries/driver/:id/start-transit` | DRIVER | Start transit |
| POST | `/deliveries/driver/:id/arrive-dropoff` | DRIVER | Arrive dropoff |
| POST | `/deliveries/driver/:id/verify-dropoff` | DRIVER | Verify dropoff |
| POST | `/deliveries/driver/:id/delivered` | DRIVER | Mark delivered |

### 2.5 Rentals

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/rentals/branches` | Public | List branches |
| GET | `/rentals/vehicle-classes` | Public | List vehicle classes |
| POST | `/rentals/search` | Public | Search |
| POST | `/rentals/quote` | Public | Quote |
| POST | `/rentals/bookings` | JWT | Create booking |
| GET | `/rentals/bookings` | JWT | List bookings |
| GET | `/rentals/bookings/:id` | JWT | Detail |
| POST | `/rentals/bookings/:id/cancel` | JWT | Cancel |

### 2.6 Tourist / Tours

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/tourist/packages` | Public | List tour packages |
| POST | `/tourist/quote` | JWT | Quote |
| POST | `/tourist/bookings` | JWT | Create booking |
| GET | `/tourist/bookings` | JWT | List bookings |
| GET | `/tourist/bookings/:id` | JWT | Detail |
| POST | `/tourist/bookings/:id/cancel` | JWT | Cancel |

### 2.7 Ambulance

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/ambulance/facilities` | Public | List facilities |
| GET | `/ambulance/facilities/nearest` | Public | Nearest facilities |
| POST | `/ambulance/estimate` | JWT | Estimate |
| POST | `/ambulance/requests` | JWT | Create request |
| GET | `/ambulance/requests` | JWT | List requests |
| GET | `/ambulance/requests/:id` | JWT | Detail |
| POST | `/ambulance/requests/:id/cancel` | JWT | Cancel |
| POST | `/ambulance/driver/:id/accept` | DRIVER | Accept |
| POST | `/ambulance/driver/:id/arrive` | DRIVER | Arrive |
| POST | `/ambulance/driver/:id/start` | DRIVER | Start |
| POST | `/ambulance/driver/:id/complete` | DRIVER | Complete |

### 2.8 Driver / Vehicle / Onboarding

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/drivers/onboard` | JWT | Onboard as driver |
| GET/PATCH | `/drivers/me` | DRIVER | Profile |
| GET | `/drivers/me/readiness` | DRIVER | Readiness check |
| GET | `/drivers/me/training` | DRIVER | Training modules |
| POST | `/drivers/me/training/:moduleId/complete` | DRIVER | Complete training |
| POST | `/drivers/me/location` | DRIVER | Location heartbeat |
| POST | `/drivers/me/weekly-goal` | DRIVER | Earning goal |
| GET | `/drivers/me/dashboard` | DRIVER | Dashboard |
| GET/PATCH | `/drivers/me/service-preferences` | DRIVER | Preferences |
| GET/POST | `/drivers/me/learning` | DRIVER | Learning center |
| POST | `/drivers/me/learning/:moduleId/start` | DRIVER | Start module |
| POST | `/drivers/me/learning/:moduleId/assessment` | DRIVER | Submit assessment |
| GET | `/drivers/me/certificates` | DRIVER | Certificates |
| GET/POST/PATCH/DELETE | `/drivers/me/documents` | DRIVER | Driver documents (compat) |
| GET/POST/PATCH/DELETE | `/drivers/me/vehicles` | DRIVER | Driver vehicles (compat) |
| POST/PATCH/DELETE | `/drivers/me/vehicles/:id/documents` | DRIVER | Vehicle documents (compat) |
| POST | `/drivers/me/presence/online` | DRIVER | Go online |
| POST | `/drivers/me/presence/offline` | DRIVER | Go offline |
| POST | `/drivers/me/onboarding/complete` | DRIVER | Complete onboarding |
| GET | `/drivers/me/onboarding/status` | DRIVER | Onboarding status |
| GET | `/drivers/me/onboarding/checkpoints` | DRIVER | Checkpoints |
| GET/POST | `/drivers/me/jobs` | DRIVER | Driver jobs |
| POST | `/drivers/me/jobs/:id/accept` | DRIVER | Accept job |
| POST | `/drivers/me/jobs/:id/decline` | DRIVER | Decline job |
| GET/POST | `/drivers/me/trips` | DRIVER | Trips |
| GET | `/drivers/me/wallet` | DRIVER | Wallet (compat stub) |
| GET | `/drivers/me/earnings/summary` | DRIVER | Earnings summary |
| GET/POST/PATCH/DELETE | `/drivers/me/emergency-contacts` | DRIVER | Emergency contacts |
| GET | `/vehicles/mine` | JWT | My vehicles |
| POST | `/vehicles` | JWT | Create vehicle |
| GET/PATCH/DELETE | `/vehicles/:id` | JWT | Vehicle CRUD |
| POST | `/vehicles/:id/activate` | JWT | Activate vehicle |
| POST | `/vehicles/:id/documents` | JWT | Add vehicle document |
| PUT | `/vehicles/:id/accessories` | JWT | Set accessories |

### 2.9 Driver Jobs / Matching / Universal Dispatch

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/driver/jobs` | DRIVER | List offers |
| GET | `/driver/jobs/active` | DRIVER | Active jobs |
| GET | `/driver/jobs/:offerId` | DRIVER | Job detail |
| POST | `/driver/jobs/:offerId/accept` | DRIVER | Accept |
| POST | `/driver/jobs/:offerId/decline` | DRIVER | Decline |
| GET | `/matching/driver/offers` | DRIVER | Driver offers |
| PUT | `/universal-dispatch/drivers/me/active-vehicle` | DRIVER | Set active vehicle |
| POST | `/universal-dispatch/drivers/me/online` | DRIVER | Go online |
| POST | `/universal-dispatch/drivers/me/offline` | DRIVER | Go offline |
| POST | `/universal-dispatch/drivers/me/location` | DRIVER | Location update |
| GET | `/universal-dispatch/drivers/me/offers/active` | DRIVER | Active offers |
| POST | `/universal-dispatch/drivers/offers/:offerId/accept` | DRIVER + idempotency | Accept offer |
| POST | `/universal-dispatch/drivers/trips/:tripId/arrive-pickup` | DRIVER | Arrive pickup |
| POST | `/universal-dispatch/drivers/trips/:tripId/verify-rider` | DRIVER | Verify rider |
| POST | `/universal-dispatch/drivers/trips/:tripId/start` | DRIVER | Start |
| POST | `/universal-dispatch/drivers/trips/:tripId/complete` | DRIVER | Complete |
| POST | `/universal-dispatch/drivers/trips/:tripId/cancel` | DRIVER | Cancel |

### 2.10 Wallet / Payments / Cashouts

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/wallet` | JWT | Balance |
| GET | `/wallet/transactions` | JWT | Transactions |
| POST | `/wallet/top-up` | JWT | Top up |
| POST | `/wallet/transfer` | JWT | Transfer |
| POST | `/wallet/withdraw` | JWT | Withdraw |
| GET/POST | `/payment-methods` | JWT | Payment methods |
| POST | `/payments/intents` | JWT | Create payment intent |
| POST | `/payments/:id/confirm` | JWT | Confirm payment |
| GET | `/payments` | JWT | List payments |
| POST | `/cashouts` | JWT | Request cashout |
| GET | `/cashouts/mine` | JWT | My cashouts |
| PATCH | `/cashouts/:id/cancel` | JWT | Cancel cashout |

### 2.11 Safety / SOS / Support

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/safety/sos` | JWT | SOS |
| POST | `/safety/emergencies` | JWT | Create emergency |
| GET | `/safety/emergencies` | JWT | List emergencies |
| POST | `/safety/support/tickets` | JWT | Create support ticket |
| GET | `/safety/support/tickets` | JWT | List tickets |
| POST | `/safety/support/tickets/:id/messages` | JWT | Add message |
| POST | `/safety/trip-shares` | JWT | Share trip |
| POST | `/safety/map-reports` | JWT | Map report |

### 2.12 Notifications / Files

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/notifications` | JWT | List notifications |
| GET | `/notifications/unread-count` | JWT | Unread count |
| PATCH | `/notifications/:id/read` | JWT | Mark read |
| PATCH | `/notifications/read-all` | JWT | Mark all read |
| POST | `/notifications/devices` | JWT | Register device |
| POST | `/files/upload` | JWT + idempotency | Upload file |
| GET | `/files/:id` | JWT | File metadata |
| GET | `/files/:id/download` | JWT + signed URL | Download |

### 2.13 Admin

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/admin/dashboard` | ADMIN | Dashboard |
| GET/POST | `/admin/users` | ADMIN | Users CRUD |
| GET/PATCH | `/admin/users/:id` | ADMIN | User detail |
| GET/POST | `/admin/drivers` | ADMIN | Drivers CRUD |
| GET/PATCH | `/admin/drivers/:id` | ADMIN | Driver detail |
| GET | `/admin/driver-documents/pending` | ADMIN | Pending driver docs |
| PATCH | `/admin/driver-documents/:id/review` | ADMIN | Review driver doc |
| GET | `/admin/vehicle-documents/pending` | ADMIN | Pending vehicle docs |
| PATCH | `/admin/vehicle-documents/:id/review` | ADMIN | Review vehicle doc |
| PATCH | `/admin/vehicles/:id/review` | ADMIN | Review vehicle |
| GET | `/admin/bookings/recent` | ADMIN | Recent bookings |
| GET | `/admin/audit-logs` | ADMIN | Audit log |
| GET/PATCH | `/admins/me/profile` | ADMIN | Admin profile |
| GET/PATCH | `/admins/me/settings` | ADMIN | Admin settings |
| GET/PATCH | `/admin/system/flags` | ADMIN | Feature flags |
| GET/PATCH | `/admin/risk/cases` | ADMIN/SUPPORT | Risk cases |
| GET/PATCH | `/admin/approvals` | ADMIN | Approvals |
| GET/POST/PATCH | `/admin/riders` | ADMIN | Rider CRUD |
| GET/POST/PATCH | `/admin/roles` | ADMIN | Roles |
| GET/POST/PATCH | `/admin/pricing-zones` | ADMIN | Pricing zones |
| GET/PATCH | `/admin/services` | ADMIN | Services |
| GET/POST/PATCH/DELETE | `/admin/pricing/*` | ADMIN | Centralized pricing |
| GET | `/admin/analytics/finance` | ADMIN | Finance analytics |
| GET | `/admin/analytics/operations` | ADMIN | Operations analytics |

### 2.14 Agent Portal

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/agent/auth/login` | Public | Agent login |
| POST | `/agent/auth/refresh` | Public | Refresh |
| POST | `/agent/auth/logout` | AGENT+ | Logout |
| GET | `/agent/auth/me` | AGENT+ | Profile |
| GET | `/agent/bootstrap` | AGENT+ | Shell bootstrap |
| GET | `/agent/dashboard` | AGENT+ | Dashboard |
| GET/POST/PATCH/DELETE | `/agent/tasks` | AGENT+ | Tasks |
| GET/POST | `/agent/onboarding/*` | AGENT+ | Onboarding cases |
| GET/POST | `/agent/support/tickets` | AGENT+ | Support tickets |
| GET/POST | `/agent/safety/incidents` | AGENT+ | Incidents |
| GET | `/agent/safety/sos` | AGENT+ | SOS queue |
| GET/POST | `/agent/dispatch/bookings` | AGENT+ | Manual bookings |
| GET | `/agent/live-ops/*` | AGENT+ | Live ops |
| GET/POST/PATCH | `/agent/settings/*` | AGENT+ | Settings |

### 2.15 Fleet Portal

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET/PATCH | `/fleet/me/profile` | FLEET_* | Profile |
| GET/POST/PATCH/DELETE | `/fleet/drivers` | FLEET_* | Drivers |
| GET/POST/PATCH/DELETE | `/fleet/vehicles` | FLEET_* | Vehicles |
| GET/POST/PATCH | `/fleet/vehicles/:id/documents` | FLEET_* | Vehicle docs |
| GET/PATCH | `/fleet/vehicles/:id/accessories` | FLEET_* | Accessories |
| GET/POST | `/fleet/dispatches` | FLEET_* | Dispatches |
| GET/POST | `/fleet/earnings/payout-requests` | FLEET_* | Payouts |
| GET | `/fleet/dashboard` | FLEET_* | Dashboard |
| GET/POST | `/fleet/support/tickets` | FLEET_* | Support |



---

## 3. Frontend API Inventory

### 3.1 Rider App (`EvzoneRide`)

**HTTP client:** `src/services/httpClient.ts` (fetch-based, auto 401 refresh, `Authorization: Bearer`).  
**Token storage:** `localStorage` key `evzone:rider-session`.  
**Real endpoints currently called:** 6

| Function (file) | Method | Endpoint | Screen | Status |
|-----------------|--------|----------|--------|--------|
| `loginRider` | POST | `/auth/login` | `SignInScreen` | ✅ Connected |
| `logoutRider` | POST | `/auth/logout` | `RiderCoverageScreen`, `AppChrome` | ✅ Connected |
| `initializeRiderSession` | GET | `/auth/me` | `App.tsx` | ✅ Connected |
| `initializeRiderSession` | GET | `/riders/me/bootstrap` | `App.tsx` | ✅ Connected |
| `bootstrapRiderWorkspace` | GET | `/users/me/places` | Login flow | ✅ Connected (fallback caught) |
| `refreshRiderSession` | POST | `/auth/refresh` | Interceptor | ✅ Connected |

**Mock-only services (`src/services/riderAppServices.ts`):** ~70 functions across ride, account, payment, scheduling, delivery, rental, tour, ambulance, liveTrip, auth.  
**Screens with no API binding:** 106 of 112 screens.

### 3.2 Driver App (`Driver-s-app`)

**HTTP client:** `src/services/backend.ts` (fetch wrapper `requestJson`).  
**Token storage:** `localStorage` key `evz_auth_session`.  
**Real endpoints currently called:** ~10 (all in `src/services/auth-api.ts`).

| Function (file) | Method | Endpoint | Screen | Status |
|-----------------|--------|----------|--------|--------|
| `register` | POST | `/auth/register` | `OTPVerification` | ✅ Connected |
| `login` | POST | `/auth/login` | `RegisterServices` | ✅ Connected |
| `refresh` | POST | `/auth/refresh` | `AuthContext` | ✅ Connected |
| `requestOtp` | POST | `/auth/request-otp` | `Registration`, `OTPVerification`, `ForgotPassword` | ✅ Connected |
| `verifyOtp` | POST | `/auth/verify-otp` | `OTPVerification` | ✅ Connected |
| `forgotPassword` | POST | `/auth/forgot-password` | `ForgotPassword` | ✅ Connected |
| `resetPassword` | POST | `/auth/reset-password` | `ResetPassword` | ✅ Connected |
| `changePassword` | POST | `/auth/change-password` | `SettingsPassword` | ✅ Connected |
| `me` | GET | `/auth/me` | `AuthContext` | ✅ Connected |
| `logout` | POST | `/auth/logout` | `AuthContext` | ✅ Connected |

**Local-only domains:** Driver profile, driver documents, vehicles, vehicle documents, training, jobs, trips, wallet, earnings, cashout, SOS, presence/heartbeat.

### 3.3 Admin App (`Rides-Admin`)

**HTTP client:** `src/services/api/httpClient.ts` (fetch, 401 refresh, demo fallback when backend disabled).  
**Token storage:** `admin_backend_access_token`, `admin_backend_refresh_token`.  
**Real endpoints currently called:** 50+.

Key connected domains: riders, drivers, roles, pricing zones, services, admin profile/settings, feature flags, analytics, promos, risk cases, approvals, companies, audit logs, training modules, centralized pricing, system overview.

**Demo fallback risk:** `handleDemoRequest()` reads/writes `evzone_admin_demo_*` keys when `getBackendEnabled()` is false. In production, `VITE_BACKEND_ENABLED=true` and `VITE_ENABLE_DEMO_API=false` must be set.

### 3.4 Agent Portal (`Agent-Portal`)

**HTTP client:** `src/api/client.ts` (fetch).  
**Token storage:** `localStorage` key `evzone_agent_auth`.  
**Real endpoints currently called:** 4.

| Function | Method | Endpoint | Screen | Status |
|----------|--------|----------|--------|--------|
| `loginAgent` | POST | `/agent/auth/login` | `AgentLoginPage` | ✅ Connected |
| `fetchAgentProfile` | GET | `/agent/auth/me` | `AuthProvider` | ✅ Connected |
| `logoutAgent` | POST | `/agent/auth/logout` | `AuthProvider` | ✅ Connected |
| `refreshAgentSession` | POST | `/agent/auth/refresh` | — | ⚠️ Defined but unused |

**All other ~40 screens are mock/local.**

### 3.5 Fleet Partner App (`FleetPartnerAPP`)

**HTTP client:** None.  
**Real endpoints currently called:** 0.  
**Entire app is `localStorage`/mock-based.** Auth utility `src/utils/auth.ts` accepts any email/password and stores `fleet_partner_auth`.

---

## 4. Correlation Matrix: Frontend Expectation vs Backend Endpoint

### 4.1 Rider App

| Frontend workflow | Frontend function (expected) | Backend endpoint | Functionality match | Status |
|-------------------|------------------------------|------------------|---------------------|--------|
| Signup | `registerRider` | `POST /auth/register` or `POST /auth/rider/register` | Create account | ⚠️ Stubbed |
| Login | `loginRider` | `POST /auth/login` | Authenticate | ✅ |
| Session hydrate | `initializeRiderSession` | `GET /auth/me` | Current user | ✅ |
| Bootstrap | `bootstrapRiderWorkspace` | `GET /riders/me/bootstrap` | Home state | ✅ |
| Saved places | `getPlaces` / `addPlace` | `GET/POST /users/me/places` | Address CRUD | ✅ |
| Fare estimate | `estimateFare` | `POST /rides/estimate` or `POST /riders/me/fare-estimate` | Fare calculation | ⚠️ Stubbed |
| Request ride | `requestRide` | `POST /rides` or `POST /riders/me/trips/request` | Create ride | ⚠️ Stubbed |
| Active trip | `getActiveTrip` | `GET /riders/me/trips/active` or `GET /rides` | Live trip | ⚠️ Stubbed |
| Ride history | `getRideHistory` | `GET /riders/me/trips/history` or `GET /rides` | Past rides | ⚠️ Stubbed |
| Cancel ride | `cancelRide` | `POST /rides/:id/cancel` or `POST /riders/me/trips/:id/cancel` | Cancel | ⚠️ Stubbed |
| Wallet | `getWallet` | `GET /riders/me/wallet` or `GET /wallet` | Balance | ⚠️ Stubbed |
| Transactions | `getWalletTransactions` | `GET /riders/me/wallet/transactions` or `GET /wallet/transactions` | History | ⚠️ Stubbed |
| Payment methods | `getPaymentMethods` | `GET /riders/me/payment-methods` or `GET /payment-methods` | Methods | ⚠️ Stubbed |
| Payment intent | `createPaymentIntent` | `POST /riders/me/payment-intents` or `POST /payments/intents` | Initiate payment | ⚠️ Stubbed |
| SOS | `createSos` | `POST /riders/me/sos` or `POST /safety/sos` | Emergency | ⚠️ Stubbed |
| Notifications | `getNotifications` | `GET /riders/me/notifications` or `GET /notifications` | Inbox | ⚠️ Stubbed |
| Rate driver | `submitFeedback` | `POST /rides/:id/feedback` | Rating | ⚠️ Stubbed |
| Share trip | `shareRide` | `POST /rides/:id/share` | Share | ⚠️ Stubbed |
| Delivery estimate | `estimateDelivery` | `POST /deliveries/estimate` | Estimate | ⚠️ Stubbed |
| Create delivery | `createDelivery` | `POST /deliveries` | Book delivery | ⚠️ Stubbed |
| List deliveries | `getDeliveries` | `GET /deliveries` | History | ⚠️ Stubbed |
| Cancel delivery | `cancelDelivery` | `POST /deliveries/:id/cancel` | Cancel | ⚠️ Stubbed |
| Rental catalog | `searchRentals` | `POST /rentals/search` | Search | ⚠️ Stubbed |
| Book rental | `createRentalBooking` | `POST /rentals/bookings` | Booking | ⚠️ Stubbed |
| Cancel rental | `cancelRental` | `POST /rentals/bookings/:id/cancel` | Cancel | ⚠️ Stubbed |
| Tour catalog | `listTours` | `GET /tourist/packages` | Packages | ⚠️ Stubbed |
| Book tour | `createTourBooking` | `POST /tourist/bookings` | Booking | ⚠️ Stubbed |
| Ambulance estimate | `estimateAmbulance` | `POST /ambulance/estimate` | Estimate | ⚠️ Stubbed |
| Request ambulance | `createAmbulanceRequest` | `POST /ambulance/requests` | Request | ⚠️ Stubbed |
| Cancel ambulance | `cancelAmbulanceRequest` | `POST /ambulance/requests/:id/cancel` | Cancel | ⚠️ Stubbed |

### 4.2 Driver App

| Frontend workflow | Frontend function (expected) | Backend endpoint | Functionality match | Status |
|-------------------|------------------------------|------------------|---------------------|--------|
| Login | `login` | `POST /auth/login` | Auth | ✅ |
| Profile get | `getDriverProfile` | `GET /drivers/me` | Profile | ❌ Missing binding |
| Profile update | `updateDriverProfile` | `PATCH /drivers/me` | Update | ❌ Missing binding |
| Service capabilities | `updateServiceCapabilities` | `PATCH /drivers/me/service-capabilities` | Capabilities | ❌ Missing binding |
| Preferences | `getPreferences` / `updatePreferences` | `GET/PATCH /drivers/me/service-preferences` | Preferences | ❌ Missing binding |
| Documents list | `getDriverDocuments` | `GET /drivers/me/documents` | KYC docs | ⚠️ Backend exists; binding missing |
| Document upload | `uploadDriverDocument` | `POST /drivers/me/documents` or `POST /documents` | Upload metadata | ❌ Missing binding |
| Vehicle list | `getVehicles` | `GET /drivers/me/vehicles` or `GET /vehicles/mine` | Vehicles | ❌ Missing binding |
| Vehicle create | `createVehicle` | `POST /drivers/me/vehicles` or `POST /vehicles` | Create | ❌ Missing binding |
| Vehicle update | `updateVehicle` | `PATCH /drivers/me/vehicles/:id` or `PATCH /vehicles/:id` | Update | ❌ Missing binding |
| Vehicle document upload | `uploadVehicleDocument` | `POST /drivers/me/vehicles/:id/documents` or `POST /vehicles/:id/documents` | Doc metadata | ❌ Missing binding |
| Vehicle accessories | `updateVehicleAccessories` | `PUT /vehicles/:id/accessories` | Safety inventory | ❌ Missing binding |
| Select active vehicle | `selectActiveVehicle` | `PUT /universal-dispatch/drivers/me/active-vehicle` | Active vehicle | ❌ Missing binding |
| Training modules | `getLearningModules` | `GET /drivers/me/learning` | Training | ❌ Missing binding |
| Submit assessment | `submitAssessment` | `POST /drivers/me/learning/:id/assessment` | Quiz | ❌ Missing binding |
| Onboarding status | `getOnboardingStatus` | `GET /drivers/me/onboarding/status` | Status | ⚠️ Backend exists; binding missing |
| Complete onboarding | `completeOnboarding` | `POST /drivers/me/onboarding/complete` | Final gate | ⚠️ Backend exists; binding missing |
| Go online | `goOnline` | `POST /drivers/me/presence/online` or `POST /universal-dispatch/drivers/me/online` | Presence | ❌ Missing binding |
| Go offline | `goOffline` | `POST /drivers/me/presence/offline` or `POST /universal-dispatch/drivers/me/offline` | Presence | ❌ Missing binding |
| Location heartbeat | `sendLocationHeartbeat` | `POST /drivers/me/location/heartbeat` or `POST /drivers/me/location` | Location | ❌ Missing binding |
| List jobs | `getJobs` | `GET /driver/jobs` or `GET /matching/driver/offers` | Offers | ❌ Missing binding |
| Accept job | `acceptJob` | `POST /driver/jobs/:id/accept` or `POST /universal-dispatch/drivers/offers/:id/accept` | Accept | ❌ Missing binding |
| Trip arrive | `arriveAtPickup` | `POST /rides/driver/:id/arrive` | Arrive | ❌ Missing binding |
| Trip verify OTP | `verifyRideOtp` | `POST /rides/driver/:id/verify-otp` | Verify | ❌ Missing binding |
| Trip start | `startTrip` | `POST /rides/driver/:id/start` | Start | ❌ Missing binding |
| Trip complete | `completeTrip` | `POST /rides/driver/:id/complete` | Complete | ❌ Missing binding |
| Wallet | `getDriverWallet` | `GET /wallet` or `GET /drivers/me/wallet` | Balance | ❌ Missing binding |
| Transactions | `getWalletTransactions` | `GET /wallet/transactions` | History | ❌ Missing binding |
| Cashout | `requestCashout` | `POST /cashouts` | Cashout | ❌ Missing binding |
| SOS | `sendSos` | `POST /safety/sos` | Emergency | ❌ Missing binding |

### 4.3 Admin App

| Frontend workflow | Frontend function | Backend endpoint | Status |
|-------------------|-------------------|------------------|--------|
| Login | `backendLogin` | `POST /auth/login` | ✅ |
| Session | `backendFetchSession` | `GET /auth/session` | ✅ |
| List riders | `listAdminRiders` | `GET /admin/riders` | ✅ |
| Create rider | `createAdminRider` | `POST /admin/riders` | ✅ |
| Patch rider | `patchAdminRider` | `PATCH /admin/riders/:id` | ✅ |
| List drivers | `listAdminDrivers` | `GET /admin/drivers` | ✅ |
| Create driver | `createAdminDriver` | `POST /admin/drivers` | ✅ |
| Patch driver | `patchAdminDriver` | `PATCH /admin/drivers/:id` | ✅ |
| Roles CRUD | `list/create/patchAdminRole` | `/admin/roles` | ✅ |
| Pricing zones | `list/create/patchAdminPricingZone` | `/admin/pricing-zones` | ✅ |
| Services | `list/patchAdminService` | `/admin/services` | ✅ |
| Admin profile | `get/patchAdminMyProfile` | `/admins/me/profile` | ✅ |
| Admin settings | `get/patchAdminPortalSettings` | `/admins/me/settings` | ✅ |
| Feature flags | `list/patchAdminFeatureFlags` | `/admin/system/flags` | ✅ |
| Approvals | `list/reviewAdminApprovals` | `/admin/approvals` | ✅ |
| Risk cases | `list/patchAdminRiskCases` | `/admin/risk/cases` | ✅ |
| Audit logs | `listAdminAuditEvents` | `/admin/system/audit-log` | ✅ |
| Document approvals (pending queue) | *(screen expected)* | `GET /admin/documents/pending` + `PATCH /admin/documents/:id/review` | ⚠️ Needs screen wiring |
| Vehicle approvals (pending queue) | *(screen expected)* | `GET /admin/vehicles/pending` + `PATCH /admin/vehicles/:id/review` | ⚠️ Needs screen wiring |
| Payments / payouts / reconciliation | *(screen expected)* | `/admin-finance/*`, `/admin/reconciliation/*` | ⚠️ Needs screen wiring |

### 4.4 Agent Portal

| Frontend workflow | Frontend function (expected) | Backend endpoint | Status |
|-------------------|------------------------------|------------------|--------|
| Login | `loginAgent` | `POST /agent/auth/login` | ✅ |
| Me | `fetchAgentProfile` | `GET /agent/auth/me` | ✅ |
| Logout | `logoutAgent` | `POST /agent/auth/logout` | ✅ |
| Bootstrap/dashboard | — | `GET /agent/bootstrap`, `GET /agent/dashboard` | ❌ Missing binding |
| Tasks | — | `GET/POST/PATCH/DELETE /agent/tasks` | ❌ Missing binding |
| Onboarding cases | — | `GET/POST /agent/onboarding/*` | ❌ Missing binding |
| Support tickets | — | `GET/POST /agent/support/tickets` | ❌ Missing binding |
| Safety incidents / SOS | — | `GET/POST /agent/safety/*` | ❌ Missing binding |
| Dispatch bookings | — | `GET/POST /agent/dispatch/bookings` | ❌ Missing binding |
| Live ops | — | `GET /agent/live-ops/*` | ❌ Missing binding |
| Settings | — | `GET/PATCH /agent/settings/*` | ❌ Missing binding |

### 4.5 Fleet Partner App

| Frontend workflow | Frontend function (expected) | Backend endpoint | Status |
|-------------------|------------------------------|------------------|--------|
| Login | — | `POST /auth/login` (role FLEET_*) | ❌ Missing client + binding |
| Profile | — | `GET/PATCH /fleet/me/profile` | ❌ Missing |
| Drivers | — | `GET/POST/PATCH/DELETE /fleet/drivers` | ❌ Missing |
| Vehicles | — | `GET/POST/PATCH/DELETE /fleet/vehicles` | ❌ Missing |
| Dispatches | — | `GET/POST /fleet/dispatches` | ❌ Missing |
| Payouts | — | `GET/POST /fleet/earnings/payout-requests` | ❌ Missing |
| Compliance | — | `GET/POST /fleet/compliance/*` | ❌ Missing |
| Support | — | `GET/POST /fleet/support/tickets` | ❌ Missing |



---

## 5. Missing or Unclear Backend Endpoints to Add/Verify

Based on frontend expectations and the supplied audit resource, the following endpoints need verification or implementation. Each must land in the OpenAPI contract after creation.

### 5.1 Rider endpoints

| Endpoint | Method | Purpose | Module | Priority |
|----------|--------|---------|--------|----------|
| `/users/me/places` | GET/POST/PATCH/DELETE | Saved places | Places | P1 (already exists; confirm mapping) |
| `/rides/:id/tip` | POST | Add tip | Rides | P2 |
| `/rides/:id/report-issue` | POST | Report issue / support ticket | Safety | P2 |
| `/rides/:id/support-ticket` | POST | Create support ticket from ride | Safety | P2 |

### 5.2 Driver endpoints

| Endpoint | Method | Purpose | Module | Priority |
|----------|--------|---------|--------|----------|
| `/drivers/me/documents` | GET | List driver documents | Driver compat | P0 |
| `/drivers/me/documents` | POST | Upload driver document metadata | Driver compat | P0 |
| `/drivers/me/documents/:id` | PATCH | Update driver document | Driver compat | P1 |
| `/drivers/me/documents/:id` | DELETE | Delete driver document | Driver compat | P1 |
| `/drivers/me/vehicles/:id/accessories` | GET/PATCH | Safety inventory | Vehicles | P0 |
| `/drivers/me/vehicles/:id/select-active` | POST | Set active vehicle | Vehicles / Dispatch | P0 |
| `/drivers/me/wallet` | GET | Driver wallet | Wallets / Driver compat | P1 |
| `/drivers/me/wallet/transactions` | GET | Driver transactions | Wallets / Driver compat | P1 |
| `/drivers/me/cashout-requests` | POST | Driver cashout | Cashouts | P1 |
| `/drivers/me/location/heartbeat` | POST | Location heartbeat | Driver compat | P0 (alias of `/drivers/me/location`) |

### 5.3 Admin endpoints

| Endpoint | Method | Purpose | Module | Priority |
|----------|--------|---------|--------|----------|
| `/admin/dashboard/summary` | GET | Dashboard summary | Admin | P1 (already have `/admin/dashboard`; align UI) |
| `/admin/audit-logs` | GET | Audit log | Admin audit | P1 (already exists) |
| `/admin/documents/pending` | GET | Pending document approvals | Governance / Admin | P1 |
| `/admin/documents/:id/approve` | POST | Approve document | Governance / Admin | P1 |
| `/admin/documents/:id/reject` | POST | Reject document | Governance / Admin | P1 |
| `/admin/driver-onboarding/pending` | GET | Pending onboarding queue | Onboarding / Admin | P1 |
| `/admin/vehicles/pending` | GET | Pending vehicle approvals | Vehicles / Admin | P1 |
| `/admin/vehicles/:id/approve` | POST | Approve vehicle | Vehicles / Admin | P1 |
| `/admin/vehicles/:id/reject` | POST | Reject vehicle | Vehicles / Admin | P1 |
| `/admin/payments` | GET | Payments list | Admin finance | P1 |
| `/admin/payouts` | GET | Payouts list | Payouts / Admin | P1 |
| `/admin/reconciliation-runs` | GET | Reconciliation runs | Reconciliation | P1 |

### 5.4 Agent endpoints

Agent endpoints mostly exist under `/agent/*`. The gap is **frontend binding**, not backend routes.

### 5.5 Fleet endpoints

Fleet endpoints mostly exist under `/fleet/*` and `/fleet-partners/*`. The gap is **frontend binding**, not backend routes.

---

## 6. Data Flows

### 6.1 Authentication flow (all apps)

```
Frontend login form
  → POST /api/v1/auth/login
  ← { user, accessToken, refreshToken }
Frontend stores tokens in localStorage
  → subsequent requests: Authorization: Bearer <accessToken>
On 401
  → POST /api/v1/auth/refresh { refreshToken }
  ← { accessToken, refreshToken }
On refresh failure
  → clear tokens, redirect to login
```

### 6.2 Rider ride booking flow

```
Rider selects pickup/dropoff
  → POST /api/v1/rides/estimate
  ← fare estimate
Rider confirms booking
  → POST /api/v1/rides { ...payload, idempotencyKey }
  ← ride created
Backend matches driver → creates job/offers
Rider polls
  → GET /api/v1/riders/me/trips/active
  ← active trip with driver details
Driver accepts via Driver app
Driver arrives/starts/completes
Rider payment
  → POST /api/v1/payments/intents
  ← intent
Rider rates
  → POST /api/v1/rides/:id/feedback
```

### 6.3 Driver onboarding flow

```
Signup/login
  → POST /api/v1/auth/register or /api/v1/auth/login
Create/patch driver profile
  → PATCH /api/v1/drivers/me
Select service capabilities
  → PATCH /api/v1/drivers/me/service-capabilities
Create vehicle
  → POST /api/v1/vehicles or POST /api/v1/drivers/me/vehicles
Upload vehicle image
  → POST /api/v1/files/upload
  ← { fileUrl, id }
Attach vehicle document
  → POST /api/v1/vehicles/:id/documents or /api/v1/drivers/me/vehicles/:id/documents
Upload driver documents
  → POST /api/v1/files/upload then POST /api/v1/drivers/me/documents or /api/v1/documents
Add emergency contacts
  → POST /api/v1/emergency-contacts
Complete training
  → POST /api/v1/drivers/me/learning/:moduleId/assessment
Check onboarding status
  → GET /api/v1/drivers/me/onboarding/status
Complete onboarding
  → POST /api/v1/drivers/me/onboarding/complete
Go online
  → POST /api/v1/drivers/me/presence/online
Send heartbeat
  → POST /api/v1/drivers/me/location
```

### 6.4 Admin document approval flow

```
Driver uploads document
  → POST /api/v1/drivers/me/documents
Backend creates pending approval
Admin lists pending
  → GET /api/v1/admin/documents/pending
Admin approves/rejects
  → POST /api/v1/admin/documents/:id/approve or /api/v1/admin/documents/:id/reject
Backend updates driver document status
Audit interceptor records action
  → stored in audit_logs
Driver onboarding status recalculates
```

---

## 7. Critical Production Issues & Risks

### 7.1 P0 — Frontend apps rely on localStorage / mock data

**Risk:** Rider, Driver, Agent, and Fleet apps do not persist data to the backend.  
**Impact:** No production value; data loss on logout/cache clear; no cross-device sync.  
**Mitigation:** Implement real API services per Phase 3–7.

### 7.2 P0 — Driver file upload stores base64 in localStorage

**Risk:** Vehicle/driver documents never reach Cloudinary/backend.  
**Impact:** Compliance impossible; onboarding cannot complete truthfully.  
**Mitigation:** Route all uploads through `POST /api/v1/files/upload`, then attach returned `fileUrl` to document metadata endpoints.

### 7.3 P1 — Admin demo fallback can mask backend failures

**Risk:** `VITE_ENABLE_DEMO_API=true` or missing `VITE_BACKEND_ENABLED` causes `localStorage` demo data to be served.  
**Impact:** Admins see fake data and think operations succeeded.  
**Mitigation:** Enforce `VITE_BACKEND_ENABLED=true`, `VITE_ENABLE_DEMO_API=false` in production builds; fail loudly on API errors.

### 7.4 P1 — Token storage in localStorage

**Risk:** All SPAs store tokens in `localStorage`, vulnerable to XSS.  
**Impact:** Token theft via XSS.  
**Mitigation:** Short-lived access tokens + refresh rotation; move refresh token to HttpOnly Secure SameSite cookie; add CSP.

### 7.5 P1 — No request/response logging interceptors in Rider/Driver

**Risk:** Harder to debug production issues.  
**Mitigation:** Add request ID and structured logging to HTTP clients.

### 7.6 P1 — Socket.IO connections are open but event handlers are missing

**Risk:** Realtime updates (driver location, ride status) not consumed.  
**Mitigation:** Implement event handlers per app.

---

## 8. Implementation Roadmap (Phased)

### Phase 0 — Backend Stabilization ✅
- [x] Run backend lint, build, tests.
- [x] Export OpenAPI contract.
- [x] Run contract check.
- [x] Provision local PostgreSQL for development.

### Phase 1 — Connectivity Report ✅
- [x] Create `docs/production-connectivity-report.md`.
- [ ] Review and sign off with stakeholders.

### Phase 2 — Missing Backend Endpoints
- [ ] Add `/drivers/me/documents` CRUD (compat controller).
- [ ] Add `/drivers/me/vehicles/:id/accessories`.
- [ ] Add `/drivers/me/vehicles/:id/select-active`.
- [ ] Add `/drivers/me/wallet` + transactions + cashout.
- [ ] Add `/admin/documents/pending` + approve/reject.
- [ ] Add `/admin/vehicles/pending` + approve/reject.
- [ ] Add `/admin/payments`, `/admin/payouts`, `/admin/reconciliation-runs` list endpoints if not present.
- [ ] Regenerate OpenAPI after each module.
- [ ] Run backend tests + contract check.

### Phase 3 — Rider App Wiring
- [ ] Create `src/services/riderApi.ts` with all domain functions.
- [ ] Replace mock transport in `riderAppServices.ts` with real calls.
- [ ] Bind screens: ride booking, payments, wallet, deliveries, rentals, tours, ambulance, SOS, notifications, ratings.
- [ ] Add `.env.example`.
- [ ] Gate mocks behind `import.meta.env.DEV`.

### Phase 4 — Driver App Wiring
- [ ] Create `src/services/driverApi.ts`.
- [ ] Connect profile, documents, vehicles, vehicle documents, accessories.
- [ ] Connect file upload via `/files/upload`.
- [ ] Connect training, onboarding, presence, heartbeat.
- [ ] Connect jobs, trip lifecycle, wallet, cashout, SOS.
- [ ] Add `.env.example`.

### Phase 5 — Admin App Hardening
- [ ] Disable demo fallback in production.
- [ ] Connect document approval screens.
- [ ] Connect vehicle approval screens.
- [ ] Connect finance dashboards.
- [ ] Add audit log visibility.
- [ ] Enforce role/permission checks in UI.

### Phase 6 — Agent Portal Wiring
- [ ] Create `src/api/agentApi.ts`.
- [ ] Connect dashboard, tasks, cases, tickets, incidents, SOS, dispatch, live-ops, settings.
- [ ] Add `.env.example`.

### Phase 7 — Fleet Partner App Wiring
- [ ] Create `src/api/fleetApi.ts` and `src/api/httpClient.ts`.
- [ ] Implement real auth.
- [ ] Connect profile, drivers, vehicles, dispatches, payouts, compliance, support.
- [ ] Add `.env.example`.

### Phase 8 — Smoke Tests & Production Verification
- [ ] Backend: `npm run smoke:suite`, `smoke:health`, `smoke:cors`, `smoke:ride-to-offer`.
- [ ] Rider lifecycle smoke.
- [ ] Driver onboarding + trip lifecycle smoke.
- [ ] Admin approval lifecycle smoke.
- [ ] Optional: Playwright/Cypress E2E suite.

---

## 9. Smoke Test Plan

### 9.1 Backend smoke

```bash
npm run lint
npm run build
npm test
npm run openapi:export
npm run contract:check
npm run smoke:health
npm run smoke:suite
npm run smoke:cors
npm run smoke:ride-to-offer
npm run smoke:payment-webhook-to-ledger
```

### 9.2 Rider smoke

1. Register rider (`POST /auth/register`).
2. Login (`POST /auth/login`).
3. Refresh page → session rehydrates (`GET /auth/me` + `GET /riders/me/bootstrap`).
4. Add saved place (`POST /users/me/places`).
5. Estimate fare (`POST /rides/estimate`).
6. Create ride (`POST /rides` with `Idempotency-Key`).
7. Confirm ride in active trips (`GET /riders/me/trips/active`).
8. Cancel ride (`POST /rides/:id/cancel`).
9. Load wallet (`GET /wallet`).
10. Create payment intent (`POST /payments/intents`).
11. Submit feedback (`POST /rides/:id/feedback`).
12. Logout.

### 9.3 Driver smoke

1. Register/login driver.
2. Patch profile (`PATCH /drivers/me`).
3. Upload driver document via `/files/upload` + `POST /drivers/me/documents`.
4. Create vehicle (`POST /vehicles`).
5. Upload vehicle document via `/files/upload` + `POST /vehicles/:id/documents`.
6. Add emergency contact (`POST /emergency-contacts`).
7. Complete training assessment (`POST /drivers/me/learning/:id/assessment`).
8. Check onboarding status → complete (`POST /drivers/me/onboarding/complete`).
9. Go online (`POST /drivers/me/presence/online`).
10. Receive job (`GET /driver/jobs`).
11. Accept job (`POST /driver/jobs/:id/accept`).
12. Arrive/start/complete trip.
13. Confirm wallet/earnings updated.
14. Go offline.

### 9.4 Admin smoke

1. Login admin.
2. Load dashboard (`GET /admin/dashboard`).
3. List riders/drivers (`GET /admin/riders`, `GET /admin/drivers`).
4. Create test rider/driver.
5. Patch rider/driver.
6. List pending documents (`GET /admin/documents/pending`).
7. Approve document (`POST /admin/documents/:id/approve`).
8. View audit log (`GET /admin/audit-logs`).
9. Confirm expired token refresh works.
10. Confirm invalid refresh redirects to `/admin/login`.

---

## 10. Conclusion & Next Steps

The backend foundation is production-grade and already exposes the vast majority of endpoints required by the workspace apps. The primary gap is frontend wiring: Rider, Driver, Agent, and Fleet apps must stop using `localStorage` and mock data and start calling the real backend. The Admin app is substantially connected but must disable its demo fallback layer in production.

**Immediate next step:** Begin Phase 2 by adding the missing driver document/accessory/active-vehicle endpoints and the admin document/vehicle approval endpoints, then regenerate the OpenAPI contract. After that, proceed to Phase 3 (Rider) and Phase 4 (Driver) in parallel, since those are the highest-value production flows.

**Single source of truth principle:** No frontend screen should mutate `localStorage` as a source of truth in production. Every write goes to `/api/v1`; every read comes from `/api/v1`. Mock data must be gated behind `import.meta.env.DEV` and never ship in production builds.


---

## 11. Phase Completion Summary (Updated 2026-07-02)

### Phase 0 — Backend Stabilization ✅

| Check | Command | Result |
|-------|---------|--------|
| Lint | `npm run lint` | ✅ Pass |
| Build | `npm run build` | ✅ Pass |
| Tests | `npm test` | ✅ 43 suites, 227 tests pass |
| OpenAPI export | `npm run openapi:export` | ✅ 718 paths, 389 schemas |
| Contract check | `npm run contract:check` | ✅ Pass |

A local PostgreSQL development instance was provisioned at `postgresql://evzone:evzone-group@localhost:5433/evzone` because the OpenAPI export bootstraps the full NestJS application (and therefore requires a real database). The existing `docs/openapi.json` was regenerated from the actual controllers.

### Phase 1 — Connectivity Report ✅

This document (`docs/production-connectivity-report.md`) was created and covers:
- Full backend endpoint inventory by domain.
- Per-frontend API inventory.
- Correlation matrix between frontend expectations and backend endpoints.
- Missing endpoint list.
- Data flow diagrams.
- Production risks and mitigations.
- Phased implementation roadmap.
- Smoke test plan.

### Phase 2 — Missing Backend Endpoints ✅ (Critical driver gaps filled)

Implemented in `src/compatibility/driver-compat.controller.ts`:

| New endpoint | Method | Purpose |
|--------------|--------|---------|
| `/drivers/me/vehicles/:vehicleId/accessories` | GET | Read vehicle safety accessories |
| `/drivers/me/vehicles/:vehicleId/accessories` | PATCH | Update vehicle safety accessories |
| `/drivers/me/vehicles/:vehicleId/select-active` | POST | Select active vehicle |
| `/drivers/me/wallet` | GET | Real wallet balance (replaced stub) |
| `/drivers/me/wallet/transactions` | GET | Wallet transaction history |
| `/drivers/me/cashout-requests` | POST | Driver cashout request |

The following endpoints already existed and were verified in the backend, contrary to the original audit resource:
- `/drivers/me/documents` CRUD
- `/drivers/me/vehicles` CRUD
- `/drivers/me/vehicles/:id/documents` POST/PATCH
- `/drivers/me/onboarding/status`, `/drivers/me/onboarding/checkpoints`, `/drivers/me/onboarding/complete`
- `/drivers/me/presence/online|offline`
- `/drivers/me/location/heartbeat`
- `/drivers/me/jobs`, `/drivers/me/jobs/:id/accept|reject`
- `/drivers/me/trips/*`
- `/drivers/me/emergency-contacts` CRUD

Admin endpoints already existed:
- `/admin/driver-documents/pending` + `/admin/driver-documents/:id/review`
- `/admin/vehicle-documents/pending` + `/admin/vehicle-documents/:id/review`
- `/admin/vehicles/:id/review`
- `/admin/audit-logs`
- `/admin-finance/payments` and `/admin-finance/payouts`
- `/admin/reconciliation/runs`

The remaining backend gaps are minor convenience/alias endpoints (e.g. a unified `/admin/documents/pending`) that can be added when the corresponding admin screens are wired.

### Phase 3–7 — Frontend Service Layers Created ✅

| App | File | Contents |
|-----|------|----------|
| `EvzoneRide` | `src/services/riderApi.ts` | 50+ real functions for rides, deliveries, rentals, tours, ambulance, wallet, payments, notifications, SOS, support, places, profile |
| `Driver-s-app` | `src/services/driverApi.ts` | 40+ real functions for profile, documents, vehicles, accessories, training, onboarding, presence, jobs, trips, wallet, cashout, SOS |
| `Agent-Portal` | `src/api/agentApi.ts` | 40+ real functions for dashboard, tasks, onboarding cases, tickets, incidents, SOS, dispatch, live-ops, training, settings |
| `FleetPartnerAPP` | `src/api/client.ts` + `src/api/fleetApi.ts` | New HTTP client + 30+ real functions for auth, profile, branches, drivers, vehicles, dispatches, payouts, compliance, support, trips |

Each app also received an `.env.example` file documenting the required backend URL.

### Frontend Build / Type Check Status

| App | Command | Result |
|-----|---------|--------|
| `EvzoneRide` | `npm run typecheck` | ✅ Pass |
| `Driver-s-app` | `npm run typecheck` | ⚠️ Pre-existing errors in `AuthContext.tsx` and `OTPVerification.tsx` (not introduced by new API layer) |
| `FleetPartnerAPP` | `npm run type-check` | ✅ Pass |
| `Agent-Portal` | `npm run build` | ⚠️ `node_modules` missing in workspace |
| `Rides-Admin` | `npm run build` | ⚠️ `node_modules` missing in workspace |

### What Remains (Frontend Screen Wiring)

The service layers are in place, but most screens still call local/mock helpers. The next step is to replace those calls with the new API modules, screen by screen:

1. **Rider (`EvzoneRide`)**
   - Wire `riderApi` into ride booking, payments, wallet, deliveries, rentals, tours, ambulance, SOS, notifications.
   - Replace `mockTransport` usage in production builds.
   - Gate remaining local demos behind `import.meta.env.DEV`.

2. **Driver (`Driver-s-app`)**
   - Replace `localStorage` vehicle/document stores with `driverApi` calls.
   - Route file uploads through `driverApi.uploadFile` → `POST /api/v1/files/upload`.
   - Connect onboarding, presence, jobs, trips, wallet, cashout, SOS.

3. **Admin (`Rides-Admin`)**
   - Disable demo fallback in production (`VITE_ENABLE_DEMO_API=false`).
   - Connect document/vehicle approval screens to existing `/admin/*-documents/pending` endpoints.
   - Connect finance dashboards to `/admin-finance/*`.

4. **Agent (`Agent-Portal`)**
   - Replace mock screens with `agentApi` calls.
   - Implement automatic token refresh in `client.ts` (currently defined but unused).

5. **Fleet (`FleetPartnerAPP`)**
   - Replace `utils/auth.ts` fake auth with `fleetApi.loginFleetPartner`.
   - Replace all `localStorage` entity stores with `fleetApi` calls.

### Recommended Next Immediate Actions

1. Install dependencies for `Agent-Portal` and `Rides-Admin` (`npm install`) and verify builds.
2. Fix the pre-existing type errors in `Driver-s-app`.
3. Wire the critical vertical slice end-to-end:
   - Rider request ride → Driver accept → Admin dashboard visibility.
4. Add Playwright/Cypress smoke tests for the vertical slice.

---

*Report generated by EVzone Ride Production Connectivity Audit — 2026-07-02*
