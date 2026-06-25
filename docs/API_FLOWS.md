# API flows

All protected calls require `Authorization: Bearer <accessToken>`. Responses use:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-06-20T12:00:00.000Z"
}
```

Paginated responses also contain `meta`.

## 1. Authentication

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "identifier": "rider@evzone.local",
  "password": "Password123!"
}
```

Refresh:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{ "refreshToken": "<opaque token>" }
```

## 2. Ride-hailing

### Estimate

```http
POST /api/v1/rides/estimate
Authorization: Bearer <rider token>
Content-Type: application/json

{
  "pickup": {
    "address": "Kampala Central",
    "latitude": 0.315,
    "longitude": 32.58
  },
  "destination": {
    "address": "Entebbe International Airport",
    "latitude": 0.0424,
    "longitude": 32.4435
  },
  "vehicleType": "SUV",
  "mode": "ON_DEMAND",
  "category": "STANDARD",
  "tripType": "ONE_WAY",
  "passengerCount": 1
}
```

### Request

Use the same payload and add:

```json
{ "paymentMethod": "CASH" }
```

Send to `POST /api/v1/rides`. The development response includes the six-digit `verificationCode` for end-to-end testing.

### Driver flow

```text
GET  /rides/driver/requests
POST /rides/driver/{rideId}/accept
POST /rides/driver/{rideId}/arrive
POST /rides/driver/{rideId}/waiting
POST /rides/driver/{rideId}/verify-otp  { "code": "123456" }
POST /rides/driver/{rideId}/start
POST /rides/driver/{rideId}/complete  { "actualDistanceKm": 36, "actualDurationMinutes": 55 }
```

### Pay and rate

```text
POST /payments/intents
POST /payments/{paymentId}/confirm
POST /rides/{rideId}/feedback
```

Feedback body:

```json
{ "rating": 5, "message": "Excellent trip", "tipAmount": 2000 }
```

## 3. Delivery

### Estimate

```http
POST /api/v1/deliveries/estimate
Authorization: Bearer <rider token>
Content-Type: application/json

{
  "pickup": { "address": "Acacia Mall", "latitude": 0.3382, "longitude": 32.5867 },
  "destination": { "address": "Kajjansi", "latitude": 0.2068, "longitude": 32.5415 },
  "serviceType": "ELECTRIC_VEHICLE",
  "packageSize": "MEDIUM",
  "weightKg": 4.5,
  "fragile": false
}
```

### Create

```http
POST /api/v1/deliveries
Authorization: Bearer <rider token>
Content-Type: application/json

{
  "pickup": { "address": "Acacia Mall", "latitude": 0.3382, "longitude": 32.5867 },
  "destination": { "address": "Kajjansi", "latitude": 0.2068, "longitude": 32.5415 },
  "serviceType": "ELECTRIC_VEHICLE",
  "packageSize": "MEDIUM",
  "weightKg": 4.5,
  "fragile": false,
  "packageName": "Pair of sneakers",
  "sender": { "name": "Amina Nabirye", "phone": "+256700000002" },
  "receiver": { "name": "John Doe", "phone": "+256700111222" },
  "items": [{ "name": "Sneakers", "quantity": 1, "unitWeightKg": 1.2 }],
  "paymentMethod": "CASH"
}
```

The development response includes a QR token. The driver lifecycle is exposed under `/deliveries/driver/*`, including QR verification, pickup, transit, arrival and delivery completion. Public tracking uses:

```text
GET /api/v1/deliveries/track/{trackingCode}
```

## 4. Tourist vehicle

List packages:

```text
GET /api/v1/tourist/packages
```

Quote:

```json
{
  "tourPackageId": "<packageId>",
  "durationDays": 2,
  "vehicleType": "MINIVAN",
  "passengers": 4
}
```

Create a booking at `POST /api/v1/tourist/bookings` by adding `startAt`, `endAt`, pickup coordinates and `paymentMethod`. Tour operators assign a driver and vehicle; the assigned driver accepts, starts and completes the booking.

## 5. Ambulance

Nearest facilities:

```text
GET /api/v1/ambulance/facilities/nearest?latitude=0.31&longitude=32.58&limit=5
```

Request:

```http
POST /api/v1/ambulance/requests
Authorization: Bearer <token>
Content-Type: application/json

{
  "pickup": { "address": "Kampala Central", "latitude": 0.315, "longitude": 32.58 },
  "destination": { "address": "Mulago Hospital", "latitude": 0.3416, "longitude": 32.5761 },
  "priority": "HIGH",
  "patientName": "Patient One",
  "patientPhone": "+256700111222",
  "medicalCondition": "Requires urgent assessment",
  "medicalNeeds": { "oxygen": true },
  "consentToShareMedicalInfo": true,
  "paymentMethod": "INSURANCE"
}
```

A dispatcher can call `POST /ambulance/requests/{id}/dispatch`. Ambulance drivers use accept, arrive, start and complete endpoints.

## 6. Car rental

Search:

```http
POST /api/v1/rentals/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "pickupAt": "2026-07-01T08:00:00.000Z",
  "returnAt": "2026-07-04T08:00:00.000Z",
  "vehicleType": "SUV",
  "seats": 4
}
```

Quote with a returned `vehicleId`, then create:

```json
{
  "vehicleId": "<vehicleId>",
  "pickupAt": "2026-07-01T08:00:00.000Z",
  "returnAt": "2026-07-04T08:00:00.000Z",
  "withDriver": false,
  "pickupLocation": "Kampala",
  "returnLocation": "Kampala",
  "paymentMethod": "EVZONE_WALLET",
  "agreementAccepted": true
}
```

The rental partner confirms. Pickup/return inspections record odometer, charge/fuel percentage, photos and damages.

## 7. Safety and live sharing

Create an emergency incident:

```json
{
  "type": "MEDICAL",
  "serviceType": "RIDE",
  "serviceId": "<rideId>",
  "description": "Passenger requires help",
  "latitude": 0.315,
  "longitude": 32.58,
  "address": "Kampala Central"
}
```

Use `POST /safety/sos` for the SOS variant. Trip sharing:

```json
{
  "serviceType": "RIDE",
  "serviceId": "<rideId>",
  "recipients": [{ "name": "Trusted contact", "phone": "+256700000000" }],
  "expiresInHours": 24
}
```

The returned token is publicly accessible at `/safety/trip-shares/public/{token}` until expiry.

## 8. WebSocket

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/realtime', {
  auth: { token: accessToken },
});

socket.emit('subscribe.service', {
  serviceType: 'RIDE',
  serviceId: rideId,
});

socket.on('service.updated', console.log);
socket.on('ride.requested', console.log);
socket.on('chat.message', console.log);
```

## Fleet Partner, Agent and CorporatePay flow

1. Log in as `fleet.partner@evzone.local` and call `GET /organizations/mine`.
2. Use the returned ID with `GET /fleet-partners/{organizationId}/dashboard`.
3. Log in as `agent@evzone.local` and create a manual booking:

```http
POST /api/v1/dispatch/{organizationId}/manual-bookings
Authorization: Bearer <agent token>
Content-Type: application/json

{
  "serviceType": "RIDE",
  "customer": {
    "phone": "+256700123456",
    "firstName": "Manual",
    "lastName": "Customer"
  },
  "payload": {
    "pickup": { "address": "Kampala", "latitude": 0.3136, "longitude": 32.5811 },
    "destination": { "address": "Entebbe Airport", "latitude": 0.0424, "longitude": 32.4435 },
    "passengerCount": 1
  },
  "paymentMethod": "CORPORATE_PAY",
  "corporatePayAccountId": "<accountId>"
}
```

4. Log in as `dispatcher@evzone.local` and assign a compatible fleet driver and vehicle using `POST /dispatch/{organizationId}/manual-bookings/{id}/assign`.
5. Inspect payment state through `GET /corporate-pay/transactions/{transactionId}`.
6. Run School synchronization through `POST /fleet-partners/{organizationId}/school/connections/{connectionId}/sync`.

Every step produces audit or dispatch events and uses the canonical service record.
