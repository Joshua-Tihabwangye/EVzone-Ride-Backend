# Release validation — version 10.0.0

Validated on 23 June 2026 against a fresh SQL.js database and the compiled NestJS application. Version 10 is additive and retains the complete version 9 Rider, Driver, Fleet Partner, Agent/Dispatcher, Agent Portal, Admin, CorporatePay, School Fleet and service-domain functionality while adding the universal dispatch foundation.

## Results

| Check | Result |
| --- | --- |
| Full TypeScript ESLint, zero warnings | PASS |
| NestJS production build | PASS |
| Jest | 16 suites, 52 tests, all PASS |
| Fresh SQL.js schema synchronization | PASS |
| Demo-data seed | PASS |
| Core Rider/quote smoke | PASS |
| Fleet/Dispatcher/CorporatePay/School platform smoke | PASS |
| Production-hardening smoke | PASS |
| Report infrastructure smoke suites | PASS |
| Fleet Partner application smoke | PASS |
| Agent Portal application smoke | PASS |
| Admin Portal application smoke | PASS |
| CorporatePay partner end-to-end smoke | PASS |
| CorporatePay → external School Shuttle payment bridge smoke | PASS |
| HMAC partner authentication | PASS |
| Persisted nonce replay rejection | PASS |
| Compatibility contract version | 10.0.0 |
| TypeORM entities | 128 |
| OpenAPI paths | 587 |
| OpenAPI operations | 765 |
| OpenAPI schemas | 316 |
| CorporatePay partner paths / operations | 21 / 24 |

## CorporatePay runtime lifecycle exercised

The fresh-database workflow authenticated the seeded Fleet Partner, resolved its EVzone organization, loaded the partner capabilities and service catalog, linked a CorporatePay organization/member to an EVzone user, produced a live ride quotation, created an idempotent corporate service request, applied an authorization, provisioned the existing EVzone Ride and Agent/Dispatcher manual-booking records, added fulfilment evidence, generated a receipt, exported reconciliation data, acknowledged a durable integration event and cancelled the validation booking. A second live lifecycle proved that a CorporatePay-authorized School Shuttle reference can create and settle its local payment bridge while the School backend remains authoritative for the external trip. A separately signed HMAC request returned HTTP 200 and replaying the identical timestamp/nonce/signature returned HTTP 401.

## Preservation

The inherited core, platform, hardening, report, Fleet Partner, Agent Portal and Admin Portal runtime workflows all passed after the CorporatePay integration was registered. This verifies that the update adds the partner boundary without replacing the existing CorporatePay transaction adapter or removing any prior route family.

## Deployment note

The included local defaults are for development. Production must replace secrets, require HMAC partner authentication, disable API-key-only partner access, set explicit CORS origins, use PostgreSQL/PostGIS with controlled migrations, and configure the intended Redis, Kafka, storage, push, map and external-service credentials.
