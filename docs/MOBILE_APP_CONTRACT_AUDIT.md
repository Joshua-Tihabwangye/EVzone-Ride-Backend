# Rider and Driver application contract audit

This document records the additive backend work introduced in version 5.0.0 after reviewing the Rider and Driver applications. All version 4 capabilities remain available.

## Rider application coverage

| App capability | Backend contract |
|---|---|
| Common, recent and pinned places | `GET/POST /api/v1/users/me/places`, plus `/api/v1/riders/me/places` alias |
| Daily commutes and future rides | Existing commute and ride scheduling APIs retained |
| Ride now, scheduled, round trip and multi-stop | Existing Ride state machine and booking DTOs retained |
| Ride for a saved contact or manually entered beneficiary | Existing beneficiary booking fields retained |
| Mobile bootstrap and feature negotiation | `/api/v1/mobile/v1/capabilities`, `/config`, `/bootstrap` |
| Cross-service ratings and review history | `/api/v1/reviews`, `/reviews/me`, service review and summary routes |
| Car-rental discovery and custom requests | `/api/v1/rentals/branches`, `/vehicle-classes`, `/custom-requests` |
| Device and push-token management | `/api/v1/mobile/v1/devices` and existing notification-device routes |

## Driver application coverage

| App capability | Backend contract |
|---|---|
| One job inbox for every eligible service | `/api/v1/driver/jobs` and `/api/v1/drivers/me/all-jobs` |
| Offer detail, accept and decline | `/api/v1/driver/jobs/:offerId` and action routes |
| Existing ride-only legacy job API | `/api/v1/drivers/me/jobs` retained unchanged |
| Service and interaction preferences | `GET/PATCH /api/v1/drivers/me/service-preferences` |
| Learning modules and progress | `/api/v1/drivers/me/learning` |
| Assessments and attempt history | `/api/v1/drivers/me/learning/:moduleId/assessment` |
| Driver certificates | `/api/v1/drivers/me/certificates` and public verification route |
| Readiness, documents, vehicles and online status | Existing Driver, onboarding, compliance and compatibility APIs retained |
| Earnings and cashout | Existing wallet, earnings-ledger and cashout APIs retained |

## Fleet and rental improvements

- Rental partners can maintain physical branches and vehicle classes.
- Riders can submit custom rental requirements, dates, locations, passenger/luggage counts, budget and payment method.
- Rental partners, Fleet Partners, Support or Admin users can issue quotations subject to ownership and role checks.
- The demo seed provides one Kampala branch and three vehicle classes so the mobile catalog is populated immediately.

## Compatibility and safety

- No version 4 controller, entity or migration was removed.
- New Driver preference and unified-job routes are deliberately separated from legacy compatibility routes to prevent routing ambiguity.
- New write APIs use the existing JWT, role guards, validation pipeline, request tracing, rate limiting and domain-event infrastructure.
- SQL.js synchronizes the expanded schema automatically for local use; PostgreSQL deployments receive an explicit version 5 migration.
