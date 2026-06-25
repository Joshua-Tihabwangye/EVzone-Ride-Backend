# Admin Portal application contract audit — version 8.0.0

The attached EVzone Admin application was reviewed against EVzone Ride Backend 7.0.0. Version 8.0.0 adds the missing Admin-facing contract while preserving every Rider, Driver, Fleet Partner, Agent/Dispatcher, Agent Portal, CorporatePay, School Fleet, and service-domain route.

## Added API coverage

- Admin authentication compatibility, authenticated session hydration, password recovery, and self-service profile/settings/region preferences.
- Dashboard, system overview, global search, audit logs, integration health, live operations, and realtime `/admin` events.
- Rider, driver, administrator, company, organization, fleet, agent, and service-account management.
- Granular role and permission definitions used by the Admin application route guards.
- Compliance approvals, KYC/document reviews, driver and vehicle verification, risk/fraud queues, and safety/SOS operations.
- Service configuration for Ride Hailing, Deliveries, Car Rental, Ambulance, Tourist Vehicles, and School Shuttles.
- Pricing zones, geofences, service tariffs, vehicle categories, fare previews, taxes, promotions, and incentives.
- Financial overview, CorporatePay visibility, payouts, cashouts, company payout settings, and analytics.
- Training content, policy/rule management, localization content, feature flags, experiments, and integrations.

## Compatibility

Existing `/api/v1/admin/*` APIs remain available. Version 8 extends that family instead of replacing it. Existing `/api/v1/agent/*`, `/api/v1/fleet/*`, mobile APIs, and all Socket.IO namespaces remain registered.

## Validation

The release compiles successfully, passes all inherited automated tests, passes targeted zero-warning ESLint over the Admin integration files, starts against a fresh SQL.js database, seeds demo data, and passes the dedicated Admin Portal runtime smoke workflow.
