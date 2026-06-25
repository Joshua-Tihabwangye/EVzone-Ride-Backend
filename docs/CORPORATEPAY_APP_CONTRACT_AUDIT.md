# CorporatePay application integration audit — version 9.0.0

## Boundary decision

CorporatePay is a separate backend. It remains authoritative for corporate organizations, members, groups, cost centres, budgets, spend policies, approvals, wallets, credit, invoices, collections, API keys and CorporatePay-facing webhooks. EVzone Ride remains authoritative for service catalogues, availability, quotations, bookings, dispatch, live fulfilment state, payment-capture execution, refunds, receipts, evidence, service disputes, reconciliation extracts and transport sustainability metrics.

The integration therefore uses stable identifiers and server-to-server messages rather than sharing database tables or importing CorporatePay's internal business logic.

## Added partner contract

Base path: `/api/v1/corporate-pay/partner`

- `GET /capabilities` and `GET /catalog`
- `POST /subject-links`
- `POST /quotes`
- `POST|GET /service-requests`
- `GET /service-requests/:externalRequestId`
- `POST /service-requests/:externalRequestId/authorization`
- `POST /service-requests/:externalRequestId/provision`
- `POST /service-requests/:externalRequestId/refresh-quote`
- `POST /service-requests/:externalRequestId/cancel`
- `POST /service-requests/:externalRequestId/sync`
- `POST /service-requests/:externalRequestId/rebook`
- `POST /service-requests/:externalRequestId/refund`
- `GET /service-requests/:externalRequestId/receipt`
- `POST|GET /service-requests/:externalRequestId/evidence`
- `POST|GET /service-requests/:externalRequestId/disputes`
- `PATCH /service-requests/:externalRequestId/disputes/:disputeId`
- `GET /sustainability`
- `GET /reconciliation/export`
- `GET /events` and `POST /events/:id/ack`

## Authentication

Production partner calls are signed using HMAC-SHA256. The signature covers timestamp, nonce, uppercase HTTP method, complete request path including query string, and the SHA-256 hash of canonical JSON. Timestamp skew is limited and every nonce is persisted with a TTL so replayed requests are rejected. Local sandbox mode also supports `x-corporatepay-api-key` to make the package immediately executable.

## Service mapping

Approved CorporatePay requests enter the existing dispatch/manual-booking layer rather than creating a parallel service engine. They therefore inherit EVzone's validation, pricing, assignment, state machines, safety controls, payment records, audit timelines and realtime notifications for Ride Hailing, Deliveries, Car Rental, Tourist Vehicles and Ambulance. School Shuttle requests retain an external School backend trip reference because the School backend remains operationally authoritative.

For School Shuttle requests, EVzone Ride now creates the local CorporatePay payment and reconciliation records from the approved/quoted amount without attempting to resolve a duplicate local School trip or distribute a local driver payout. This preserves the School backend ownership boundary while allowing the shared Fleet Partner, Dispatcher, Admin and CorporatePay views to reconcile the same transport spend safely.

## Reliability

External request IDs and idempotency keys prevent duplicate service creation. Corporate allocations remain attached throughout fulfilment. Outbound updates are stored durably, can be pulled and acknowledged, and may also be pushed to a configured CorporatePay event URL using signed requests. Optional external delivery failures do not block the EVzone transaction and remain available for retry.
