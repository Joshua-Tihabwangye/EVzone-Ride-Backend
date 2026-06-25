# Legacy backend transfer matrix

This document records the production-oriented capabilities incorporated from the attached legacy backend into the unified EVzone Ride 3.0 architecture. Existing version 2 domain services were retained rather than replaced.

| Legacy capability | Version 3 implementation | Integration approach |
|---|---|---|
| Request correlation | `common/request-context.ts` | Correlation ID propagated through success responses, errors and audit logs |
| Idempotent mutations | `idempotency/` + `IdempotencyRecord` | Global interceptor with persisted request hash and replayed response |
| Provider payment profiles | `financial-operations/` + `StoredPaymentMethod` | Provider token encrypted using the existing crypto vault |
| Cashout approval | `financial-operations/` + `CashoutRequest` | Approval workflow delegates settlement to the existing wallet ledger |
| Risk and fraud operations | `governance/` + `RiskCase` | Shared Admin/Support case management |
| Maker/checker approvals | `governance/` + `ApprovalRequest` | Generic approval queue for fleet, dispatch and administrative actions |
| Feature controls | `governance/` + `FeatureFlag` | Global or application-scoped runtime feature flags |
| Runtime service settings | `governance/` + `ServiceConfiguration` | Persisted operational configuration exposed to Admin |
| Operational alarms | `OperationalAlert` and `operations/` | Watchdogs create deduplicated actionable alerts |
| Stale-driver handling | `OperationsWatchdogService` | Forces non-busy drivers offline after heartbeat timeout |
| Booking timeout handling | `OperationsWatchdogService` | Expires unmatched ride requests after configurable timeout |
| KYC/onboarding workflows | `onboarding/` | Applications, checklist items, user documents and review decisions |
| Emergency contacts | `EmergencyContact` | User-managed safety contacts available to the wider safety domain |
| Reusable commute templates | `commutes/` + `RiderCommute` | Persisted schedules and one-tap canonical ride booking |
| Place and route utilities | `geolocation/` | Nominatim/OSRM adapters with geofence and deterministic fallback |
| Horizontally scaled sockets | `realtime/redis-io.adapter.ts` | Optional Redis adapter; local in-process sockets remain default |
| Client migration compatibility | `compatibility/` | Canonical Rider/Driver/Fleet/Admin aliases and machine-readable contracts |
| Surge and promo administration | expanded `pricing/` | Admin CRUD over the original pricing entities |

## Deliberately retained from version 2

The existing state machines and canonical records for Ride-Hailing, Deliveries, Tourist Vehicles, Ambulance, Car Rental, Fleet Partner, manual dispatch, School fleet synchronization and CorporatePay remain the source of truth. Compatibility APIs delegate to those services instead of introducing parallel booking logic.
