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

## Secret rotation and scanning

Before any production or staging deployment, rotate every secret that was previously present in the repository or local configuration files:

| Secret / Credential | Where to rotate | Notes |
|---------------------|-----------------|-------|
| `JWT_SECRET` | Generate a cryptographically random string (≥ 32 characters) and set via the deployment secret manager. | Used to sign JWT access tokens. |
| `INTEGRATION_ENCRYPTION_KEY` | Generate a fresh 256-bit key and set via the deployment secret manager. | Used to encrypt stored integration credentials; re-encryption of existing records is required after rotation. |
| `CORPORATEPAY_WEBHOOK_SECRET` | Rotate in the CorporatePay partner dashboard. | Used to verify inbound webhook signatures. |
| `CORPORATEPAY_SIGNING_SECRET` | Rotate in the CorporatePay partner dashboard. | Used to sign outbound CorporatePay requests. |
| `CORPORATEPAY_PARTNER_SHARED_SECRET` | Rotate in the CorporatePay partner dashboard. | Used for server-to-server request signatures. |
| `CORPORATEPAY_PARTNER_API_KEY` | Re-issue in the CorporatePay partner dashboard. | Used for partner API authentication. |
| `SCHOOL_WEBHOOK_SECRET` | Generate a fresh secret for each school fleet connection. | Used to verify inbound school sync webhooks. |
| Cloudinary `API_KEY` / `API_SECRET` | Rotate in the Cloudinary console. | Only needed when `CLOUDINARY_DISABLED=false`. |
| `FLUTTERWAVE_SECRET_KEY` / webhook secret | Rotate in the Flutterwave dashboard. | Only needed when `PAYMENT_PROVIDER=FLUTTERWAVE`. |
| Postgres credentials | Rotate in the database and update `DATABASE_URL`. | Use TLS and a least-privilege user. |

Local development fallbacks are centralized in `src/common/utils/required-secret.util.ts` and are intentionally weak. They must never be used outside `development` or `test` environments.

Run secret scanning before pushing:

```bash
npm run security:secrets
```

This requires [gitleaks](https://github.com/gitleaks/gitleaks) to be installed. The configuration is in `.gitleaks.toml`.

## Version 3 controls

- Every response includes a correlation ID. A caller-supplied `X-Request-Id` is bounded before propagation.
- Unsafe requests can carry `Idempotency-Key`; the key is hashed with user and route scope, while a separate request hash prevents payload substitution.
- Completed idempotent responses are persisted for deterministic replay; failed executions remove the processing record.
- Stored payment provider tokens are encrypted with the existing AES-256-GCM vault and are excluded from normal TypeORM selection and API responses.
- Feature-flag, approval, risk, cashout and operational-alert mutations are role restricted and audited.
- Redis is optional. When enabled, use TLS/authenticated Redis and a private network; when unavailable, startup falls back to the single-process Socket.IO adapter.
- Geolocation provider URLs and timeouts are configurable. Do not put secrets in query strings, and review provider privacy/retention terms before production use.
