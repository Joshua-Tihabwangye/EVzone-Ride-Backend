# Fleet Partner Application Contract Audit

## Scope

The attached Fleet Partner web application was reviewed at source level. Its backend integration is concentrated in `src/services/api/fleetApi.ts`, with shared HTTP behavior in `src/services/api/httpClient.ts`, OIDC behavior in `src/utils/auth.ts` and `src/services/auth/oidcConfig.ts`, runtime feature flags in `src/services/api/config.ts`, and realtime bootstrapping in `src/components/FleetBackendBootstrap.tsx`.

The application expects:

- REST base: `/api/v1`
- Fleet REST family: `/api/v1/fleet/*`
- Runtime contracts: `/api/v1/compat/flags/fleet` and `/api/v1/compat/realtime/events`
- Socket.IO namespace: `/fleet`
- OIDC authority: `https://accounts.evzone.app` by default
- Local-development API default: `http://localhost:3000/api/v1`

Version 6 implements those contracts without removing any version 5 module or route.

## Implemented application contract

| Application area           | Backend contract                                                                 |
| -------------------------- | -------------------------------------------------------------------------------- |
| Workspace/profile          | `GET/PATCH /fleet/me/profile`, `GET /fleet/me/organizations`                     |
| Branches                   | `GET/POST /fleet/me/branches`, `GET/PATCH/DELETE /fleet/me/branches/:branchId`   |
| Portal preferences         | `GET/PATCH /fleet/me/settings`                                                   |
| Security/session view      | `GET/PATCH /fleet/me/security`                                                   |
| Integrations               | `GET/PATCH /fleet/me/integrations`                                               |
| Roles and members          | `GET/PATCH /fleet/me/roles`, members and invitation APIs                         |
| Notifications/activity     | notification list/read state and activity-log APIs                               |
| Drivers                    | list, details, create, update and remove                                         |
| Vehicles                   | list, details, create, update and remove                                         |
| Vehicle compliance         | documents, accessories and maintenance APIs                                      |
| Dispatch                   | list, details, create and lifecycle update                                       |
| Car rental                 | list, details, create and update                                                 |
| Tourist vehicles           | list, details, create, update and tour-message APIs                              |
| School shuttles            | service orders plus routes, students, attendance, feedback, trips and attendants |
| Extended school operations | payments, safety, rosters and reminders                                          |
| Compliance                 | incidents and training-course assignment                                         |
| Earnings                   | payouts, summary and statements                                                  |
| Cross-service visibility   | trips, Rider services, ambulances and support tickets                            |
| Dashboard/map              | aggregated fleet operational dashboard and map feed                              |

## Authentication and tenancy

Version 6 keeps the backend's local JWT login/refresh flow and adds external OIDC access-token verification. OIDC RSA signatures are verified against cached JWKS keys; issuer, audience, expiry and not-before checks are supported. Accounts, wallets, organizations, memberships and Fleet Profiles can be created just in time from trusted claims.

The claim mapper accepts the forms used by the Fleet Partner application and common identity-provider variants, including:

- `roles`, `evzone.roles`, `evzone.principal`, `evzone_principal`, `fleet_roles`
- `evzone.organizations`, `evzone_organizations`, `organizations`, `org_memberships`, `organization`, `tenants`
- organization identifiers such as `organizationId`, `organization_id`, `orgId`, `org_id`, `tenantId` and `tenant_id`

For multi-organization accounts, clients may send `X-Organization-Id`. The value can be an internal organization ID, external OIDC organization ID, Fleet Profile ID or fleet code. Every record lookup and write is scoped to the resolved fleet, and unauthorized tenant selection is rejected.

## Realtime contract

The `/fleet` namespace authenticates the same JWT/OIDC access token used by REST calls. A connected account is automatically joined to each permitted `fleet:{fleetId}` room. Administrators also join `fleet:all`.

Canonical server events include:

- `dispatch.created`
- `dispatch.updated`
- `dispatch.completed`
- `fleet.alert`
- `notification.new`
- `fleet.event`

Compatibility aliases required by the application are emitted alongside canonical events:

- `dispatch.create`
- `dispatch.update`
- `notification.new`

The compatibility discovery endpoint publishes the namespace and event names so clients can hydrate their listeners dynamically.

## Persistent additions

Version 6 adds persistent models for:

- fleet branches
- generic typed Fleet Portal resources
- portal/security/integration configuration
- fleet role definitions
- fleet member invitations
- OIDC external user subjects and identity providers
- external organization identifiers

The generic resource model is intentionally tenant-scoped and typed. It provides durable storage for school-shuttle sub-resources, tour messages, incidents and other portal workflows without weakening the existing domain-specific Ride, Delivery, Rental, Ambulance or Tourist entities.

## Preserved functionality

No previous domain was removed. Ride-Hailing, Deliveries, Tourist Vehicles, Ambulances, Car Rental, School Fleet synchronization, Driver/Rider mobile contracts, Agent/Dispatcher manual bookings, Admin operations, CorporatePay integration, matching, accounting, PostGIS/Redis geolocation, Kafka/outbox, Cloudinary/local storage, safety, reviews and learning remain registered in `AppModule`.
