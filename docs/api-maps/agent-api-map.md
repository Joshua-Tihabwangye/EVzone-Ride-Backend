# Agent / Dispatcher API Map

## Canonical Base

`/api/v1/agent`

## Authentication

Bearer JWT. Roles: `AGENT`, `DISPATCHER`, `ADMIN`.

## Stable Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/agent/bootstrap` | Agent portal bootstrap |
| GET | `/api/v1/agent/trips` | Live trips |
| GET | `/api/v1/agent/trips/:id` | Trip detail |
| POST | `/api/v1/agent/trips/:id/dispatch` | Manual dispatch override |
| POST | `/api/v1/agent/trips/:id/cancel` | Cancel trip on behalf of user |
| GET | `/api/v1/agent/drivers` | Available drivers |
| GET | `/api/v1/agent/drivers/:id` | Driver detail |
| GET | `/api/v1/agent/deliveries` | Live deliveries |
| GET | `/api/v1/agent/support/tickets` | Support tickets |
| GET | `/api/v1/agent/support/tickets/:id` | Ticket detail |
| POST | `/api/v1/agent/support/tickets/:id/escalate` | Escalate ticket |
| GET | `/api/v1/agent/operations/health` | Operations health snapshot |

## Compatibility (Deprecated) Endpoints

| Method | Path | Migrate To |
|--------|------|------------|
| GET/POST | `/api/v1/dispatch/*` | `/api/v1/agent/*` canonical equivalents |

## Scope

Agents may be scoped to service areas, fleets, or tenant organizations.
