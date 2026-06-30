# Deployment

## Docker Compose

```bash
docker compose up --build -d

docker compose logs -f api
```

Verify:

```bash
curl http://localhost:3000/api/v1/health
```

Stop:

```bash
docker compose down
```

To remove local Docker data as well:

```bash
docker compose down -v
```

## Standalone Node deployment

```bash
npm ci
npm run build
NODE_ENV=production npm run start:prod
```

Set `DB_TYPE=postgres` and `DATABASE_URL` for PostgreSQL. The API binds to `HOST=0.0.0.0` and `PORT=3000` by default.

## Reverse proxy

Terminate TLS at a reverse proxy or managed ingress. Forward both HTTP and WebSocket upgrade traffic. Socket.IO exposes `/driver`, `/rider` and `/admin` namespaces plus the retained `/realtime` compatibility namespace.

Suggested routes:

- `/api/v1/*` -> NestJS API.
- Socket.IO upgrade requests and `/driver`, `/rider`, `/admin`, `/realtime` namespaces -> NestJS API.
- `/uploads/*` -> NestJS static assets or object-storage CDN.
- `/docs` -> restrict in production when desired.

## Persistent data

Docker Compose creates:

- `evzone_postgres` for PostgreSQL.
- `evzone_storage` for uploads.

Back up both. For managed deployments, use managed PostgreSQL and object storage.

## Production checklist

1. Replace `JWT_SECRET` and database passwords.
2. Use explicit `CORS_ORIGINS`.
3. Configure TLS.
4. Set `DB_SYNCHRONIZE=false` and operate schema changes through reviewed migrations.
5. Disable `SEED_DEMO` after creating real administrators.
6. Replace local payment, OTP, SMS, push and map adapters with production providers.
7. Store uploads in object storage and scan them before compliance review.
8. Configure centralized logs, metrics, traces and alerts.
9. Add database backups and tested restoration procedures.
10. Restrict Swagger and administrative endpoints at the network layer.

## Fail-closed production mode

When `NODE_ENV=production`, the API validates the runtime configuration during startup and refuses to boot with unsafe defaults. Production must use explicit CORS origins, PostgreSQL migrations instead of schema sync, no demo seed data, strong non-default secrets, Redis, Kafka, real payment/push/storage providers, upload scanning, strict driver compliance, HMAC partner authentication, and a real cashout payout provider.

The bundled `docker-compose.yml` is a local production-shaped demo stack and intentionally runs as `NODE_ENV=development` because it uses seeded data and local/mock providers. To run production, provide a separate environment that passes `/api/v1/ready` and `/api/v1/infrastructure/readiness`.

## Horizontal scaling

The HTTP application is stateless except for local uploads and Socket.IO process memory. Before running multiple replicas:

- Move files to shared/object storage.
- Add a Socket.IO Redis adapter or managed real-time broker.
- Coordinate scheduled tasks with a distributed lock or dedicated worker.
- Keep PostgreSQL as the source of truth.
- Use a shared rate-limit store.

The current package is intentionally self-contained for immediate deployment on one application replica.

## CorporatePay and School integration

The default deployment is self-contained:

```env
CORPORATEPAY_MODE=sandbox
CORPORATEPAY_MOCK_AUTO_APPROVE=true
```

For a remote CorporatePay deployment:

```env
CORPORATEPAY_MODE=remote
CORPORATEPAY_BASE_URL=https://corporatepay.example
CORPORATEPAY_API_KEY=replace-me
CORPORATEPAY_WEBHOOK_SECRET=replace-me
CORPORATEPAY_SIGNING_SECRET=replace-me
API_PUBLIC_URL=https://ride-api.example
```

For a remote School backend, create or update a school connection with its `baseUrl`, API key and webhook secret. Credentials are encrypted with `INTEGRATION_ENCRYPTION_KEY`.

## Version 4 optional infrastructure

Redis-backed Socket.IO scaling is disabled by default. To enable it:

```env
REDIS_SOCKET_ADAPTER_ENABLED=true
REDIS_URL=redis://username:password@redis-host:6379/0
```

The API falls back to in-process Socket.IO if Redis cannot be reached. Multi-replica scheduled/watchdog jobs still require leader election or a distributed lock.

Geolocation defaults to public Nominatim and OSRM endpoints and has a deterministic routing fallback. Production deployments should configure contracted/self-hosted providers and appropriate rate limits:

```env
GEO_LOOKUP_BASE_URL=https://your-geocoder.example
ROUTE_LOOKUP_BASE_URL=https://your-router.example
GEO_REQUEST_TIMEOUT_MS=5000
```

Operational watchdog thresholds are configurable through `OPERATIONS_WATCHDOG_*`, `DRIVER_HEARTBEAT_TIMEOUT_MS`, `TRIP_REQUEST_TIMEOUT_MS` and `ACTIVE_SERVICE_STUCK_THRESHOLD_MS`.

For Kafka event streaming, Cloudinary storage and Firebase push delivery:

```env
KAFKA_DISABLED=false
KAFKA_BROKERS=kafka:9092
CLOUDINARY_DISABLED=false
CLOUDINARY_CLOUD_NAME=replace-me
CLOUDINARY_API_KEY=replace-me
CLOUDINARY_API_SECRET=replace-me
FILE_SCAN_PROVIDER=CLAMAV
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
CASHOUT_PAYOUT_PROVIDER=replace-with-real-provider
```

When any optional provider is unavailable, the API reports the active fallback through `/api/v1/infrastructure/status` and related provider-status endpoints. Kafka falls back to the durable database outbox, files fall back to local persistent storage, push remains persisted in-app, and driver discovery can fall back from PostGIS to Redis GEO or Haversine distance.
