# Agent Portal application contract audit

## Scope

The attached Agent Portal source was reviewed against EVzone Ride Backend 6.0.0. Version 7.0.0 adds the missing portal-facing contract without deleting or replacing any existing endpoint, entity, migration, service domain or realtime namespace.

## Contract implemented

| Agent Portal area | Backend implementation |
|---|---|
| Login and session recovery | `/api/v1/agent/auth/*` with login, refresh, logout, forgot password, OTP verification and reset |
| Portal startup | `/api/v1/agent/bootstrap`, `/dashboard`, `/analytics`, `/supervisor` |
| Profile and preferences | `/api/v1/agent/profile`, `/me/profile`, `/preferences` |
| Work management | `/api/v1/agent/tasks`, `/drafts`, `/agents`, `/chats/*` |
| Manual booking and dispatch | `/api/v1/agent/dispatch/*` plus `/api/v1/agent/bookings` compatibility routes |
| Live operations | `/api/v1/agent/live-ops*` with service, trip and driver inspection |
| Customer and partner context | `/api/v1/agent/drivers/*`, `/riders/*`, `/companies/*` |
| Driver onboarding | `/api/v1/agent/onboarding*` with approve, reject and action records |
| Support desk | `/api/v1/agent/support/tickets*` with messages, ownership, escalation and lifecycle actions |
| Safety desk | `/api/v1/agent/safety/*` with SOS queue, incidents and actions |
| Search | `/api/v1/agent/search` |
| Training | `/api/v1/agent/training*` with modules, assessments, progress and certificates |
| Quality assurance | `/api/v1/agent/qa/reviews*` |
| Teams and access | `/api/v1/agent/settings/teams*`, `/roles*`, `/agents` |
| Workforce scheduling | `/api/v1/agent/settings/shifts*` with check-in and check-out |
| Realtime | Authenticated Socket.IO namespace `/agent` |

## Service coverage

Manual bookings and live operations work across ride-hailing, deliveries, tourist vehicles, ambulance, car rental and school-shuttle references. Each portal record retains a link to its underlying EVzone service record, so Agent actions do not create a disconnected shadow workflow.

## Roles and permissions

The Agent Portal accepts authenticated users with `AGENT`, `DISPATCHER`, `SUPPORT` or `ADMIN` platform roles. Seed data includes `dispatch`, `support_t2` and `supervisor` portal roles, a Central Operations team, tasks, shifts and training modules. Permission checks are applied at both route and service layers.

## Persistence and migration

Migration `1782172800000-AgentPortalV7.ts` adds Agent Portal profile fields and persistent records for teams, role definitions, tasks, drafts, QA reviews, training modules, training progress and shifts. SQL.js schema synchronization remains available for zero-setup local use, while PostgreSQL deployments can apply migrations.

## Realtime contract

The `/agent` namespace requires a valid access token in the Socket.IO handshake. It supports portal room subscription and server-published updates for dashboards, tasks, bookings, support tickets, safety incidents, onboarding cases, notifications and operational changes. Existing `/realtime`, `/driver`, `/rider`, `/fleet` and `/admin` namespaces remain unchanged.

## Validation

The Agent Portal contract has dedicated automated coverage plus a live runtime smoke flow that verifies portal login, bootstrap, dashboard hydration, tasks, drafts, support conversations, a real manual booking, live operations, training, teams, roles, shifts, compatibility metadata and realtime discovery. All inherited backend smoke suites are also rerun to detect regressions.
