# Security notes

- Passwords are hashed with bcrypt.
- Refresh tokens, OTP codes, ride PINs and delivery QR secrets are never stored in plaintext hashes used for verification.
- JWT access tokens are short-lived; refresh tokens are revocable.
- Controllers use global authentication plus role metadata.
- Booking services perform owner/driver/operator access checks.
- DTO validation strips unknown fields and rejects non-whitelisted input.
- Rate limiting, CORS and Helmet are enabled globally.
- Financial operations use idempotency references and a transaction ledger.
- Mutating operations produce audit logs.
- Emergency and medical data should be protected by deployment-level encryption, access logging and retention policies appropriate to the operating jurisdictions.
- The included secrets and provider simulators are for immediate local/Docker execution. Replace them before exposing the API publicly.

## Integration security

- School connection secrets are encrypted using AES-256-GCM before database storage.
- CorporatePay and School webhook payloads are verified with HMAC-SHA256 and constant-time comparison.
- CorporatePay webhook event IDs are unique to prevent replay processing.
- Manual booking actions enforce organization membership and agent capabilities.
- Fleet assignment validates both fleet membership and service capability of the selected driver/vehicle.
- Remote integration calls have request timeouts and use an outbox for retry rather than silently losing events.
- Rotate `INTEGRATION_ENCRYPTION_KEY`, webhook secrets and API credentials before production deployment.

## Version 3 controls

- Every response includes a correlation ID. A caller-supplied `X-Request-Id` is bounded before propagation.
- Unsafe requests can carry `Idempotency-Key`; the key is hashed with user and route scope, while a separate request hash prevents payload substitution.
- Completed idempotent responses are persisted for deterministic replay; failed executions remove the processing record.
- Stored payment provider tokens are encrypted with the existing AES-256-GCM vault and are excluded from normal TypeORM selection and API responses.
- Feature-flag, approval, risk, cashout and operational-alert mutations are role restricted and audited.
- Redis is optional. When enabled, use TLS/authenticated Redis and a private network; when unavailable, startup falls back to the single-process Socket.IO adapter.
- Geolocation provider URLs and timeouts are configurable. Do not put secrets in query strings, and review provider privacy/retention terms before production use.
