import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialProductionBaseline1783000000000 implements MigrationInterface {
  name = 'InitialProductionBaseline1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`);
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_driver_certifications_status_enum" AS ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_driver_certifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "code" character varying NOT NULL, "status" "public"."dispatch_driver_certifications_status_enum" NOT NULL DEFAULT 'ACTIVE', "issuer" character varying, "validFrom" TIMESTAMP, "validUntil" TIMESTAMP, "metadata" text, CONSTRAINT "PK_d8db7baaa90dbdc94fa1994b6ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f1174103cde28c69f924079744" ON "dispatch_driver_certifications" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_driver_certification_unique" ON "dispatch_driver_certifications" ("driverId", "code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_driver_entitlements_servicetype_enum" AS ENUM('STANDARD_RIDE', 'EV_SCOOTER_RIDE', 'EV_MOTORCYCLE_RIDE', 'BICYCLE_RIDE', 'MINI_CAR_RIDE', 'PREMIUM_RIDE', 'PRIVATE_DRIVER', 'BUSINESS_RIDE', 'AIRPORT_TRANSFER', 'INTERCITY', 'TOURISM_EVENT', 'NIGHTLIFE', 'SENIOR_ASSISTANCE', 'MEDICAL_PWD_RIDE', 'AMBULANCE_TRANSPORT', 'SCHOOL_RIDE', 'RENTAL_WITH_DRIVER', 'SHARED_RIDE', 'PARCEL_BIKE', 'PARCEL_SCOOTER', 'PARCEL_CAR', 'COURIER', 'FOOD_DELIVERY', 'CARGO_VAN', 'CARGO_TRUCK', 'MULTI_STOP_ROUTE', 'PARTNER_VEHICLE', 'FLEET_CONTRACT', 'SCHEDULED_ROSTER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_driver_entitlements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "serviceType" "public"."dispatch_driver_entitlements_servicetype_enum" NOT NULL, "marketId" character varying NOT NULL DEFAULT 'default', "active" boolean NOT NULL DEFAULT true, "validUntil" TIMESTAMP, "constraints" text, CONSTRAINT "PK_4227bcc5ea7ae50112dc5af699b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8ccd06d165b4d6c01edcc96ea3" ON "dispatch_driver_entitlements" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd155d6e01e083aa99e8b0982f" ON "dispatch_driver_entitlements" ("serviceType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c05d7ac629c5f0db93378cbd65" ON "dispatch_driver_entitlements" ("marketId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_driver_entitlement_unique" ON "dispatch_driver_entitlements" ("driverId", "serviceType", "marketId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_vehicle_capabilities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "vehicleId" character varying NOT NULL, "code" character varying NOT NULL, "verified" boolean NOT NULL DEFAULT true, "booleanValue" boolean, "numericValue" numeric(14,3), "textValue" character varying, "validUntil" TIMESTAMP, "metadata" text, CONSTRAINT "PK_e767a17aea28feb7c3b84648b4c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7a9d08fbf00bee5a5d263920e7" ON "dispatch_vehicle_capabilities" ("vehicleId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_vehicle_capability_unique" ON "dispatch_vehicle_capabilities" ("vehicleId", "code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_fleet_rules_servicetype_enum" AS ENUM('STANDARD_RIDE', 'EV_SCOOTER_RIDE', 'EV_MOTORCYCLE_RIDE', 'BICYCLE_RIDE', 'MINI_CAR_RIDE', 'PREMIUM_RIDE', 'PRIVATE_DRIVER', 'BUSINESS_RIDE', 'AIRPORT_TRANSFER', 'INTERCITY', 'TOURISM_EVENT', 'NIGHTLIFE', 'SENIOR_ASSISTANCE', 'MEDICAL_PWD_RIDE', 'AMBULANCE_TRANSPORT', 'SCHOOL_RIDE', 'RENTAL_WITH_DRIVER', 'SHARED_RIDE', 'PARCEL_BIKE', 'PARCEL_SCOOTER', 'PARCEL_CAR', 'COURIER', 'FOOD_DELIVERY', 'CARGO_VAN', 'CARGO_TRUCK', 'MULTI_STOP_ROUTE', 'PARTNER_VEHICLE', 'FLEET_CONTRACT', 'SCHEDULED_ROSTER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_fleet_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "organizationId" character varying, "serviceType" "public"."dispatch_fleet_rules_servicetype_enum" NOT NULL, "marketId" character varying NOT NULL DEFAULT 'default', "active" boolean NOT NULL DEFAULT true, "rules" text NOT NULL, "validFrom" TIMESTAMP, "validUntil" TIMESTAMP, CONSTRAINT "PK_e2579bd112ba6fa8b36ebf1e1fa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_362b6899d43b2a9a6dc617adcb" ON "dispatch_fleet_rules" ("fleetId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_fleet_rule_unique" ON "dispatch_fleet_rules" ("fleetId", "serviceType", "marketId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_driver_vehicle_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "vehicleId" character varying NOT NULL, "fleetId" character varying, "active" boolean NOT NULL DEFAULT true, "assignedFrom" TIMESTAMP NOT NULL, "assignedUntil" TIMESTAMP, "version" integer NOT NULL DEFAULT '1', "metadata" text, CONSTRAINT "PK_5b167ed583df55017aaa2c17415" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_052772789f142dc969ab21da14" ON "dispatch_driver_vehicle_assignments" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e59ea1cecff17da39bdaf0bad2" ON "dispatch_driver_vehicle_assignments" ("vehicleId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_driver_vehicle_assignment_unique" ON "dispatch_driver_vehicle_assignments" ("driverId", "vehicleId", "assignedFrom") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_driver_shifts_status_enum" AS ENUM('SCHEDULED', 'OPEN', 'PAUSED', 'BREAK_REQUIRED', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_driver_shifts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "vehicleId" character varying NOT NULL, "fleetId" character varying, "marketId" character varying NOT NULL DEFAULT 'default', "startsAt" TIMESTAMP NOT NULL, "endsAt" TIMESTAMP NOT NULL, "status" "public"."dispatch_driver_shifts_status_enum" NOT NULL DEFAULT 'SCHEDULED', "maximumDrivingMinutes" integer NOT NULL DEFAULT '720', "drivenMinutes" integer NOT NULL DEFAULT '0', "breaks" text, "recurrence" text, "metadata" text, CONSTRAINT "CHK_ud_shift_time" CHECK ("endsAt" > "startsAt"), CONSTRAINT "PK_6ddbadaaa395fc9a09b7429adf5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7985d2ccbaee675cdca6814b35" ON "dispatch_driver_shifts" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5dc024c4f4d4674c261ea6f860" ON "dispatch_driver_shifts" ("marketId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_driver_schedules_servicetype_enum" AS ENUM('STANDARD_RIDE', 'EV_SCOOTER_RIDE', 'EV_MOTORCYCLE_RIDE', 'BICYCLE_RIDE', 'MINI_CAR_RIDE', 'PREMIUM_RIDE', 'PRIVATE_DRIVER', 'BUSINESS_RIDE', 'AIRPORT_TRANSFER', 'INTERCITY', 'TOURISM_EVENT', 'NIGHTLIFE', 'SENIOR_ASSISTANCE', 'MEDICAL_PWD_RIDE', 'AMBULANCE_TRANSPORT', 'SCHOOL_RIDE', 'RENTAL_WITH_DRIVER', 'SHARED_RIDE', 'PARCEL_BIKE', 'PARCEL_SCOOTER', 'PARCEL_CAR', 'COURIER', 'FOOD_DELIVERY', 'CARGO_VAN', 'CARGO_TRUCK', 'MULTI_STOP_ROUTE', 'PARTNER_VEHICLE', 'FLEET_CONTRACT', 'SCHEDULED_ROSTER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_driver_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "vehicleId" character varying, "serviceType" "public"."dispatch_driver_schedules_servicetype_enum" NOT NULL, "startsAt" TIMESTAMP NOT NULL, "endsAt" TIMESTAMP NOT NULL, "recurrenceRule" text, "reservedCapacity" text, "status" character varying NOT NULL DEFAULT 'ACTIVE', "metadata" text, CONSTRAINT "CHK_ud_schedule_time" CHECK ("endsAt" > "startsAt"), CONSTRAINT "PK_baa0f2b5985c3b016933f575c8a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4703f66fd54d0b5a323108665c" ON "dispatch_driver_schedules" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5b6f68461cccad989eb3de1bff" ON "dispatch_driver_schedules" ("serviceType") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_units_ownertype_enum" AS ENUM('INDIVIDUAL', 'FLEET', 'PARTNER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_units_status_enum" AS ENUM('OFFLINE', 'AVAILABLE', 'OFFERED', 'RESERVED', 'EN_ROUTE_PICKUP', 'WAITING', 'ON_TRIP', 'ON_DELIVERY_ROUTE', 'CHARGING', 'BREAK_REQUIRED', 'DOCUMENT_BLOCKED', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_units" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "activeVehicleId" character varying NOT NULL, "fleetId" character varying, "shiftId" character varying, "ownerType" "public"."universal_dispatch_units_ownertype_enum" NOT NULL DEFAULT 'INDIVIDUAL', "marketId" character varying NOT NULL DEFAULT 'default', "status" "public"."universal_dispatch_units_status_enum" NOT NULL DEFAULT 'OFFLINE', "activeDriverKey" character varying, "enabledServices" text, "driverCertifications" text, "vehicleCapabilities" text, "compliance" text, "liveState" text, "eligibilitySnapshot" text, "latitude" numeric(10,7), "longitude" numeric(10,7), "accuracyMeters" numeric(10,2), "speedKph" numeric(10,2), "heading" numeric(6,2), "locationRecordedAt" TIMESTAMP, "locationSequence" bigint NOT NULL DEFAULT '0', "batterySoc" numeric(5,2), "usableRangeKm" numeric(10,2), "chargingState" character varying, "remainingShiftMinutes" integer, "snapshotVersion" bigint NOT NULL DEFAULT '1', "version" integer NOT NULL DEFAULT '1', "activeRequestId" character varying, "activeOfferId" character varying, "onlineAt" TIMESTAMP, "offlineAt" TIMESTAMP, "availableSince" TIMESTAMP, "snapshotRefreshedAt" TIMESTAMP, "eligibilitySnapshotRefreshedAt" TIMESTAMP, "riskSignals" text, "metadata" text, CONSTRAINT "PK_9a5a70c65df26f4783a0333533f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9ed687b08b9d2706a205d8f494" ON "universal_dispatch_units" ("activeVehicleId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b016bcec5f2fc0be365e0da3f8" ON "universal_dispatch_units" ("activeDriverKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ud_dispatch_unit_market_status" ON "universal_dispatch_units" ("marketId", "status", "locationRecordedAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_dispatch_unit_driver" ON "universal_dispatch_units" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "dispatchUnitId" character varying NOT NULL, "sequence" bigint NOT NULL, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "accuracyMeters" numeric(10,2), "speedKph" numeric(10,2), "heading" numeric(6,2), "recordedAt" TIMESTAMP NOT NULL, "suspicious" boolean NOT NULL DEFAULT false, "riskSignals" text, CONSTRAINT "PK_3916215eaa34ba8d0f3007354da" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_244af4f35397b3c1c77276569f" ON "universal_dispatch_locations" ("dispatchUnitId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ud_location_unit_recorded" ON "universal_dispatch_locations" ("dispatchUnitId", "recordedAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_service_requests_servicefamily_enum" AS ENUM('PASSENGER', 'DELIVERY', 'SPECIAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_service_requests_servicetype_enum" AS ENUM('STANDARD_RIDE', 'EV_SCOOTER_RIDE', 'EV_MOTORCYCLE_RIDE', 'BICYCLE_RIDE', 'MINI_CAR_RIDE', 'PREMIUM_RIDE', 'PRIVATE_DRIVER', 'BUSINESS_RIDE', 'AIRPORT_TRANSFER', 'INTERCITY', 'TOURISM_EVENT', 'NIGHTLIFE', 'SENIOR_ASSISTANCE', 'MEDICAL_PWD_RIDE', 'AMBULANCE_TRANSPORT', 'SCHOOL_RIDE', 'RENTAL_WITH_DRIVER', 'SHARED_RIDE', 'PARCEL_BIKE', 'PARCEL_SCOOTER', 'PARCEL_CAR', 'COURIER', 'FOOD_DELIVERY', 'CARGO_VAN', 'CARGO_TRUCK', 'MULTI_STOP_ROUTE', 'PARTNER_VEHICLE', 'FLEET_CONTRACT', 'SCHEDULED_ROSTER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_service_requests_scheduletype_enum" AS ENUM('IMMEDIATE', 'SCHEDULED', 'RECURRING')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_service_requests_status_enum" AS ENUM('CREATED', 'SCHEDULED', 'SEARCHING', 'OFFERING', 'ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_QUALIFIED_DRIVER', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_service_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "clientRequestId" character varying NOT NULL, "requesterUserId" character varying NOT NULL, "beneficiaryUserId" character varying, "organizationId" character varying, "serviceFamily" "public"."universal_service_requests_servicefamily_enum" NOT NULL, "serviceType" "public"."universal_service_requests_servicetype_enum" NOT NULL, "scheduleType" "public"."universal_service_requests_scheduletype_enum" NOT NULL, "scheduledAt" TIMESTAMP, "recurrenceRule" text, "parentRequestId" character varying, "marketId" character varying NOT NULL DEFAULT 'default', "status" "public"."universal_service_requests_status_enum" NOT NULL DEFAULT 'CREATED', "pickupLatitude" numeric(10,7) NOT NULL, "pickupLongitude" numeric(10,7) NOT NULL, "dropoffLatitude" numeric(10,7) NOT NULL, "dropoffLongitude" numeric(10,7) NOT NULL, "pickupAddress" character varying, "dropoffAddress" character varying, "passengerCount" integer, "cargoWeightKg" numeric(12,2), "cargoVolumeM3" numeric(12,3), "requirements" text, "preferences" text, "payment" text, "fareQuoteId" character varying, "paymentAuthorizationId" character varying, "sharingAllowed" boolean NOT NULL DEFAULT false, "tripType" character varying NOT NULL DEFAULT 'ONE_WAY', "policyId" character varying, "policyVersion" character varying, "assignedDispatchUnitId" character varying, "assignedAt" TIMESTAMP, "searchStartedAt" TIMESTAMP, "completedAt" TIMESTAMP, "cancellationCode" character varying, "currentWave" integer NOT NULL DEFAULT '0', "currentRadiusKm" numeric(8,2) NOT NULL DEFAULT '3', "nextMatchAt" TIMESTAMP, "expiresAt" TIMESTAMP, "version" integer NOT NULL DEFAULT '1', "sourceType" character varying, "sourceId" character varying, "metadata" text, CONSTRAINT "PK_d51c13c08c904a483f898fcd3ad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_65f9bbb897a893ccf289b056a2" ON "universal_service_requests" ("requesterUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ud_request_search" ON "universal_service_requests" ("marketId", "serviceType", "status", "scheduledAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_request_client_unique" ON "universal_service_requests" ("requesterUserId", "clientRequestId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_request_stops_type_enum" AS ENUM('PICKUP', 'STOP', 'DROPOFF', 'RETURN', 'DELIVERY_PICKUP', 'DELIVERY_DROPOFF')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_request_stops_status_enum" AS ENUM('PENDING', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'SKIPPED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_request_stops" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requestId" character varying NOT NULL, "sequence" integer NOT NULL, "type" "public"."universal_request_stops_type_enum" NOT NULL, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "address" character varying, "earliestAt" TIMESTAMP, "latestAt" TIMESTAMP, "serviceDurationSeconds" integer NOT NULL DEFAULT '0', "status" "public"."universal_request_stops_status_enum" NOT NULL DEFAULT 'PENDING', "requirements" text, "metadata" text, CONSTRAINT "PK_cc426ca818e259bc9edbae33236" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_39940535991e9f20626fe76a10" ON "universal_request_stops" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_request_stop_unique" ON "universal_request_stops" ("requestId", "sequence") `,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_request_requirements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requestId" character varying NOT NULL, "code" character varying NOT NULL, "category" character varying NOT NULL, "mandatory" boolean NOT NULL DEFAULT true, "value" text, CONSTRAINT "PK_ed836cae65adfd334ad18625a3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c9a5e0c27d7fa96df292d526e3" ON "universal_request_requirements" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_request_requirement_unique" ON "universal_request_requirements" ("requestId", "code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_offers_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'LOST_RACE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requestId" character varying NOT NULL, "dispatchUnitId" character varying NOT NULL, "waveNumber" integer NOT NULL, "status" "public"."universal_dispatch_offers_status_enum" NOT NULL DEFAULT 'PENDING', "score" numeric(10,8), "pickupEtaSeconds" integer, "pickupDistanceMeters" integer, "scoreComponents" text, "policyVersion" character varying NOT NULL, "offeredAt" TIMESTAMP NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "respondedAt" TIMESTAMP, "responseReason" character varying, "leaseKey" character varying, "version" integer NOT NULL DEFAULT '1', "payload" text, CONSTRAINT "PK_49d1454420a4a5349bd341a0550" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_629211eef8c3d83ed7b551c82b" ON "universal_dispatch_offers" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d5d83fb688e0eb79f32ef48d02" ON "universal_dispatch_offers" ("dispatchUnitId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ud_offer_pending_expiry" ON "universal_dispatch_offers" ("status", "expiresAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_offer_unique" ON "universal_dispatch_offers" ("requestId", "dispatchUnitId", "waveNumber") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_assignments_status_enum" AS ENUM('ACTIVE', 'RELEASED', 'COMPLETED', 'CANCELLED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requestId" character varying NOT NULL, "dispatchUnitId" character varying NOT NULL, "offerId" character varying, "status" "public"."universal_dispatch_assignments_status_enum" NOT NULL DEFAULT 'ACTIVE', "activeDispatchUnitKey" character varying, "assignedAt" TIMESTAMP NOT NULL, "endedAt" TIMESTAMP, "policyVersion" character varying NOT NULL, "decisionTraceId" character varying, "version" integer NOT NULL DEFAULT '1', "metadata" text, CONSTRAINT "PK_aad8aec5cebcce8dfdf54635f7e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d936b6396ef6f906db7cbe3a1e" ON "universal_dispatch_assignments" ("dispatchUnitId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e96a532c75f65e47f0c929006b" ON "universal_dispatch_assignments" ("activeDispatchUnitKey") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_assignment_request_unique" ON "universal_dispatch_assignments" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_trip_sessions_servicetype_enum" AS ENUM('STANDARD_RIDE', 'EV_SCOOTER_RIDE', 'EV_MOTORCYCLE_RIDE', 'BICYCLE_RIDE', 'MINI_CAR_RIDE', 'PREMIUM_RIDE', 'PRIVATE_DRIVER', 'BUSINESS_RIDE', 'AIRPORT_TRANSFER', 'INTERCITY', 'TOURISM_EVENT', 'NIGHTLIFE', 'SENIOR_ASSISTANCE', 'MEDICAL_PWD_RIDE', 'AMBULANCE_TRANSPORT', 'SCHOOL_RIDE', 'RENTAL_WITH_DRIVER', 'SHARED_RIDE', 'PARCEL_BIKE', 'PARCEL_SCOOTER', 'PARCEL_CAR', 'COURIER', 'FOOD_DELIVERY', 'CARGO_VAN', 'CARGO_TRUCK', 'MULTI_STOP_ROUTE', 'PARTNER_VEHICLE', 'FLEET_CONTRACT', 'SCHEDULED_ROSTER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_trip_sessions_status_enum" AS ENUM('ASSIGNED', 'DRIVER_EN_ROUTE_PICKUP', 'DRIVER_ARRIVED', 'WAITING_FOR_RIDER', 'RIDER_VERIFIED', 'TRIP_STARTED', 'STOP_ARRIVED', 'STOP_COMPLETED', 'PACKAGE_QR_VERIFIED', 'PACKAGE_PICKED_UP', 'EN_ROUTE_DELIVERY', 'DELIVERY_ARRIVED', 'RECIPIENT_VERIFIED', 'PACKAGE_DELIVERED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_trip_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "dispatchUnitId" character varying NOT NULL, "primaryRequestId" character varying NOT NULL, "serviceType" "public"."universal_trip_sessions_servicetype_enum" NOT NULL, "status" "public"."universal_trip_sessions_status_enum" NOT NULL DEFAULT 'ASSIGNED', "routeVersion" integer NOT NULL DEFAULT '1', "riderOtpHash" character varying, "riderOtpAttempts" integer NOT NULL DEFAULT '0', "riderOtpExpiresAt" TIMESTAMP, "riderOtpVerifiedAt" TIMESTAMP, "packageQrHash" character varying, "packageQrAttempts" integer NOT NULL DEFAULT '0', "packageQrExpiresAt" TIMESTAMP, "packageQrVerifiedAt" TIMESTAMP, "recipientCodeHash" character varying, "recipientCodeAttempts" integer NOT NULL DEFAULT '0', "recipientVerifiedAt" TIMESTAMP, "waitingStartedAt" TIMESTAMP, "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "version" integer NOT NULL DEFAULT '1', "routeMetrics" text, "metadata" text, CONSTRAINT "PK_b6f34a3e1e47d688e5ae6182abc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_728c0168cd09fe551c9263d2a9" ON "universal_trip_sessions" ("dispatchUnitId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_197fae28857a1f1f5f7818ea0d" ON "universal_trip_sessions" ("primaryRequestId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_trip_bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "tripSessionId" character varying NOT NULL, "requestId" character varying NOT NULL, "requesterUserId" character varying NOT NULL, "beneficiaryUserId" character varying, "seatCount" integer, "cargoWeightKg" numeric(12,2), "cargoVolumeM3" numeric(12,3), "status" character varying NOT NULL DEFAULT 'ACTIVE', "fareAllocation" text, "metadata" text, CONSTRAINT "PK_effd8602a3e1c7de2ba27cd09d5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d02b60197af32bb8d4bcf2190b" ON "universal_trip_bookings" ("tripSessionId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_trip_booking_request_unique" ON "universal_trip_bookings" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_trip_stops_type_enum" AS ENUM('PICKUP', 'STOP', 'DROPOFF', 'RETURN', 'DELIVERY_PICKUP', 'DELIVERY_DROPOFF')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_trip_stops_status_enum" AS ENUM('PENDING', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'SKIPPED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_trip_stops" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "tripSessionId" character varying NOT NULL, "bookingId" character varying, "sequence" integer NOT NULL, "type" "public"."universal_trip_stops_type_enum" NOT NULL, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "address" character varying, "plannedAt" TIMESTAMP, "arrivedAt" TIMESTAMP, "completedAt" TIMESTAMP, "status" "public"."universal_trip_stops_status_enum" NOT NULL DEFAULT 'PENDING', "metadata" text, CONSTRAINT "PK_5e5485e82cdf242c0ccb5faafe1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_473f4dceb52346c9531ebeceac" ON "universal_trip_stops" ("tripSessionId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_trip_stop_unique" ON "universal_trip_stops" ("tripSessionId", "sequence") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_policies_servicetype_enum" AS ENUM('STANDARD_RIDE', 'EV_SCOOTER_RIDE', 'EV_MOTORCYCLE_RIDE', 'BICYCLE_RIDE', 'MINI_CAR_RIDE', 'PREMIUM_RIDE', 'PRIVATE_DRIVER', 'BUSINESS_RIDE', 'AIRPORT_TRANSFER', 'INTERCITY', 'TOURISM_EVENT', 'NIGHTLIFE', 'SENIOR_ASSISTANCE', 'MEDICAL_PWD_RIDE', 'AMBULANCE_TRANSPORT', 'SCHOOL_RIDE', 'RENTAL_WITH_DRIVER', 'SHARED_RIDE', 'PARCEL_BIKE', 'PARCEL_SCOOTER', 'PARCEL_CAR', 'COURIER', 'FOOD_DELIVERY', 'CARGO_VAN', 'CARGO_TRUCK', 'MULTI_STOP_ROUTE', 'PARTNER_VEHICLE', 'FLEET_CONTRACT', 'SCHEDULED_ROSTER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_policies_status_enum" AS ENUM('DRAFT', 'ACTIVE', 'RETIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_policies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "policyKey" character varying NOT NULL, "version" character varying NOT NULL, "serviceType" "public"."universal_dispatch_policies_servicetype_enum" NOT NULL, "marketId" character varying, "status" "public"."universal_dispatch_policies_status_enum" NOT NULL DEFAULT 'DRAFT', "config" text NOT NULL, "checksum" character varying NOT NULL, "validationErrors" text, "createdByUserId" character varying, "effectiveFrom" TIMESTAMP, "effectiveUntil" TIMESTAMP, "activatedAt" TIMESTAMP, "retiredAt" TIMESTAMP, CONSTRAINT "PK_f2a93d1c79475b24d7c8403575b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_da856fec8def51c23f15d9b865" ON "universal_dispatch_policies" ("policyKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_921b95883c1e6aa44ee978f075" ON "universal_dispatch_policies" ("serviceType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0c375b91bf1fd556c826e62c8b" ON "universal_dispatch_policies" ("marketId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_policy_unique" ON "universal_dispatch_policies" ("policyKey", "version") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_decision_traces_outcome_enum" AS ENUM('ELIGIBLE', 'INELIGIBLE', 'RANKED', 'OFFERED', 'ASSIGNED', 'NO_QUALIFIED_DRIVER', 'CANCELLED', 'SHADOW', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_decision_traces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "traceId" character varying NOT NULL, "requestId" character varying NOT NULL, "policyVersion" character varying NOT NULL, "candidateCount" integer NOT NULL DEFAULT '0', "eligibleCount" integer NOT NULL DEFAULT '0', "selectedDispatchUnitId" character varying, "outcome" "public"."universal_dispatch_decision_traces_outcome_enum" NOT NULL, "searchRadiiKm" text, "exclusionReasonCounts" text, "decisionSummary" text, "candidateDetails" text, "offerWaves" text, "shadow" boolean NOT NULL DEFAULT false, "metadata" text, CONSTRAINT "PK_313c99261749bcfb933adddfa2c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_51af42b9be287b2088b4fce673" ON "universal_dispatch_decision_traces" ("traceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ud_trace_request" ON "universal_dispatch_decision_traces" ("requestId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_idempotency" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "scope" character varying NOT NULL, "keyHash" character varying NOT NULL, "requestHash" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'PROCESSING', "resourceId" character varying, "responseStatus" integer, "responseBody" text, "expiresAt" TIMESTAMP NOT NULL, "completedAt" TIMESTAMP, CONSTRAINT "PK_7549c76810dba711760dde4f709" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_idempotency_unique" ON "universal_dispatch_idempotency" ("scope", "keyHash") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_outbox_status_enum" AS ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_outbox" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "eventId" character varying NOT NULL, "aggregateType" character varying NOT NULL, "aggregateId" character varying NOT NULL, "eventType" character varying NOT NULL, "eventVersion" integer NOT NULL DEFAULT '1', "payload" text NOT NULL, "traceId" character varying, "status" "public"."universal_dispatch_outbox_status_enum" NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "availableAt" TIMESTAMP NOT NULL, "processingStartedAt" TIMESTAMP, "publishedAt" TIMESTAMP, "lastError" text, CONSTRAINT "PK_a2c4cf49d0c5195cecb5a14da57" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4b343c8485a29aa713e373ce7b" ON "universal_dispatch_outbox" ("eventId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0f007af5567084a473492d9d66" ON "universal_dispatch_outbox" ("aggregateId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ud_outbox_status_available" ON "universal_dispatch_outbox" ("status", "availableAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_cancellations_actorparty_enum" AS ENUM('RIDER', 'DRIVER', 'AGENT', 'DISPATCHER', 'FLEET', 'ADMIN', 'SYSTEM')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_cancellations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requestId" character varying NOT NULL, "tripSessionId" character varying, "actorUserId" character varying, "actorParty" "public"."universal_dispatch_cancellations_actorparty_enum" NOT NULL, "code" character varying NOT NULL, "reason" text, "latitude" numeric(10,7), "longitude" numeric(10,7), "metadata" text, CONSTRAINT "PK_0635258c6f145cd0e553b19c6a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d648fa1d6293019ebff6cd8d6" ON "universal_dispatch_cancellations" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."universal_dispatch_exclusions_type_enum" AS ENUM('USER_BLOCK', 'DRIVER_CHANGE', 'SAFETY', 'TEMPORARY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "universal_dispatch_exclusions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requesterUserId" character varying NOT NULL, "driverId" character varying NOT NULL, "type" "public"."universal_dispatch_exclusions_type_enum" NOT NULL, "requestId" character varying, "reason" character varying, "expiresAt" TIMESTAMP, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_3cc588e5073c613c19f3d811514" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e4f071c2b4e694b5dc4d9f61cf" ON "universal_dispatch_exclusions" ("requesterUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_830a86ad398b808940f758bff3" ON "universal_dispatch_exclusions" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ud_exclusion_unique" ON "universal_dispatch_exclusions" ("requesterUserId", "driverId", "type") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('CUSTOMER', 'RIDER', 'DRIVER', 'FLEET_MANAGER', 'FLEET_PARTNER', 'AGENT', 'DISPATCHER', 'TOUR_OPERATOR', 'RENTAL_PARTNER', 'MEDICAL_PARTNER', 'SUPPORT', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "email" character varying, "phone" character varying, "passwordHash" character varying NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'CUSTOMER', "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', "avatarUrl" character varying, "locale" character varying NOT NULL DEFAULT 'en', "currency" character varying NOT NULL DEFAULT 'UGX', "countryCode" character varying NOT NULL DEFAULT 'UG', "isEmailVerified" boolean NOT NULL DEFAULT false, "isPhoneVerified" boolean NOT NULL DEFAULT false, "externalSubject" character varying, "identityProvider" character varying, "metadata" text, "lastLoginAt" TIMESTAMP, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a000cca60bcf04454e72769949" ON "users" ("phone") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_80e795b8fa4371cfb1901dc837" ON "users" ("externalSubject") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "tokenHash" character varying NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "revokedAt" TIMESTAMP, "userAgent" character varying, "ipAddress" character varying, CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens" ("userId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens" ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "otp_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "destination" character varying NOT NULL, "channel" character varying NOT NULL, "purpose" character varying NOT NULL, "codeHash" character varying NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "consumedAt" TIMESTAMP, "attempts" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_9d0487965ac1837d57fec4d6a26" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_9d38771dd102800f389f4c73ae" ON "otp_codes" ("destination") `);
    await queryRunner.query(
      `CREATE TABLE "user_addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "label" character varying NOT NULL, "type" character varying NOT NULL DEFAULT 'OTHER', "addressLine" character varying NOT NULL, "city" character varying, "country" character varying, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "isDefault" boolean NOT NULL DEFAULT false, "details" text, CONSTRAINT "PK_8abbeb5e3239ff7877088ffc25b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_781afdedafe920f331f6229cb6" ON "user_addresses" ("userId") `);
    await queryRunner.query(
      `CREATE TABLE "saved_contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "ownerUserId" character varying NOT NULL, "linkedUserId" character varying, "name" character varying NOT NULL, "phone" character varying NOT NULL, "email" character varying, "relationship" character varying, "isEmergencyContact" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_73e4e2c299319ac6029828a7081" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_977c2b74b67a216b62ff881e2d" ON "saved_contacts" ("ownerUserId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "routeTypes" text, "rideTypes" text, "vehiclePreferences" text, "driverPersonality" text, "accessibility" text, "notificationPreferences" text, "servicePreferences" text, CONSTRAINT "PK_e8cfb5b31af61cd363a6b6d7c25" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b6202d1cacc63a0b9c8dac2abd" ON "user_preferences" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM('SYSTEM', 'BOOKING', 'PAYMENT', 'DRIVER', 'DELIVERY', 'SAFETY', 'PROMOTION', 'DOCUMENT', 'CHAT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "type" "public"."notifications_type_enum" NOT NULL DEFAULT 'SYSTEM', "title" character varying NOT NULL, "body" text NOT NULL, "data" text, "readAt" TIMESTAMP, "expiresAt" TIMESTAMP, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_692a909ee0fa9383e7859f9b40" ON "notifications" ("userId") `);
    await queryRunner.query(
      `CREATE TABLE "file_assets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "ownerUserId" character varying NOT NULL, "storageKey" character varying NOT NULL, "originalName" character varying NOT NULL, "mimeType" character varying NOT NULL, "sizeBytes" integer NOT NULL, "url" character varying NOT NULL, "storageProvider" character varying NOT NULL DEFAULT 'LOCAL', "providerPublicId" character varying, "checksumSha256" character varying, "visibility" character varying NOT NULL DEFAULT 'PRIVATE', "metadata" text, CONSTRAINT "PK_6e7152202cfe8068f9b35048896" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6c311bca3715680ae133ebf5ab" ON "file_assets" ("ownerUserId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8f1bbb232ce49e354e24a8e4fe" ON "file_assets" ("storageKey") `,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "actorUserId" character varying, "action" character varying NOT NULL, "entityType" character varying NOT NULL, "entityId" character varying, "route" character varying, "ipAddress" character varying, "data" text, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e36d23e1e7cf81ea77758bef79" ON "audit_logs" ("actorUserId") `);
    await queryRunner.query(`CREATE INDEX "IDX_f23279fad63453147a8efb46cf" ON "audit_logs" ("entityId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."driver_profiles_verificationstatus_enum" AS ENUM('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."driver_profiles_availabilitystatus_enum" AS ENUM('OFFLINE', 'ONLINE', 'BUSY', 'PAUSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "verificationStatus" "public"."driver_profiles_verificationstatus_enum" NOT NULL DEFAULT 'NOT_STARTED', "availabilityStatus" "public"."driver_profiles_availabilitystatus_enum" NOT NULL DEFAULT 'OFFLINE', "level" character varying NOT NULL DEFAULT 'BEGINNER', "rating" numeric(3,2) NOT NULL DEFAULT '5', "ratingsCount" integer NOT NULL DEFAULT '0', "completedRides" integer NOT NULL DEFAULT '0', "completedDeliveries" integer NOT NULL DEFAULT '0', "experienceYears" numeric(5,2) NOT NULL DEFAULT '0', "currentVehicleId" character varying, "serviceCapabilities" text, "lastLatitude" numeric(10,7), "lastLongitude" numeric(10,7), "lastLocationAt" TIMESTAMP, "surgeEnabled" boolean NOT NULL DEFAULT true, "rideSharingEnabled" boolean NOT NULL DEFAULT true, "trainingCompleted" boolean NOT NULL DEFAULT false, "drivingMinutesToday" integer NOT NULL DEFAULT '0', "mandatoryRestMinutesRemaining" integer NOT NULL DEFAULT '0', "preferences" text, CONSTRAINT "PK_6e002fc8a835351e070978fcad4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c22d0ffc4bff60e9a39c003759" ON "driver_profiles" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."driver_documents_type_enum" AS ENUM('NATIONAL_ID', 'DRIVING_LICENSE_FRONT', 'DRIVING_LICENSE_BACK', 'WORK_PERMIT', 'GOOD_CONDUCT', 'MEDICAL_REPORT', 'DRIVER_PHOTO', 'VEHICLE_LOGBOOK', 'VEHICLE_INSURANCE', 'VEHICLE_INSPECTION', 'ROAD_LICENSE', 'AMBULANCE_CERTIFICATION', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."driver_documents_status_enum" AS ENUM('NOT_STARTED', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "type" "public"."driver_documents_type_enum" NOT NULL, "status" "public"."driver_documents_status_enum" NOT NULL DEFAULT 'IN_REVIEW', "fileUrl" character varying NOT NULL, "issueDate" TIMESTAMP, "expiryDate" TIMESTAMP, "rejectionReason" character varying, "metadata" text, "reviewedByUserId" character varying, "reviewedAt" TIMESTAMP, CONSTRAINT "PK_31c28b4e8f55a5d411597d45ab2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_22eb4a151d293e1bdff7a4dcc5" ON "driver_documents" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_social_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "platform" character varying NOT NULL, "url" character varying NOT NULL, CONSTRAINT "PK_c88afcafd3646e6ff6f4930a53d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_232e27e6a685f0b3b1406ece6c" ON "driver_social_links" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vehicles_vehicletype_enum" AS ENUM('BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'MINI_CAR', 'SEDAN', 'HATCHBACK', 'CROSSOVER', 'SUV', 'MINIVAN', 'VAN', 'TRUCK', 'LUXURY', 'BUS', 'AMBULANCE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vehicles_energytype_enum" AS ENUM('ELECTRIC', 'HYBRID', 'INTERNAL_COMBUSTION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vehicles_status_enum" AS ENUM('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vehicles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "ownerUserId" character varying NOT NULL, "assignedDriverId" character varying, "make" character varying NOT NULL, "model" character varying NOT NULL, "year" integer NOT NULL, "plateNumber" character varying NOT NULL, "vehicleType" "public"."vehicles_vehicletype_enum" NOT NULL, "energyType" "public"."vehicles_energytype_enum" NOT NULL DEFAULT 'ELECTRIC', "status" "public"."vehicles_status_enum" NOT NULL DEFAULT 'PENDING_VERIFICATION', "seats" integer NOT NULL DEFAULT '4', "cargoCapacityKg" numeric(10,2) NOT NULL DEFAULT '0', "batteryCapacityKwh" numeric(10,2), "estimatedRangeKm" numeric(10,2), "color" character varying, "imageUrl" character varying, "serviceCapabilities" text, "features" text, "isActive" boolean NOT NULL DEFAULT false, "dailyRentalRate" numeric(14,2), "includedDailyKm" numeric(10,2), "extraKmRate" numeric(14,2), CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_dbc1e0e10ed20a933d016d9313" ON "vehicles" ("ownerUserId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_b8c98be05991478da0ec45bcdc" ON "vehicles" ("assignedDriverId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_66ea96381a7a7ceb35c72f3662" ON "vehicles" ("plateNumber") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vehicle_documents_type_enum" AS ENUM('NATIONAL_ID', 'DRIVING_LICENSE_FRONT', 'DRIVING_LICENSE_BACK', 'WORK_PERMIT', 'GOOD_CONDUCT', 'MEDICAL_REPORT', 'DRIVER_PHOTO', 'VEHICLE_LOGBOOK', 'VEHICLE_INSURANCE', 'VEHICLE_INSPECTION', 'ROAD_LICENSE', 'AMBULANCE_CERTIFICATION', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vehicle_documents_status_enum" AS ENUM('NOT_STARTED', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vehicle_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "vehicleId" character varying NOT NULL, "type" "public"."vehicle_documents_type_enum" NOT NULL, "status" "public"."vehicle_documents_status_enum" NOT NULL DEFAULT 'IN_REVIEW', "fileUrl" character varying NOT NULL, "issueDate" TIMESTAMP, "expiryDate" TIMESTAMP, "rejectionReason" character varying, "metadata" text, CONSTRAINT "PK_d0cc0eb10dcf41a4f35575f5273" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_61c94219ae61c3752cf1e6582c" ON "vehicle_documents" ("vehicleId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vehicle_accessories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "vehicleId" character varying NOT NULL, "code" character varying NOT NULL, "category" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "details" text, CONSTRAINT "PK_4a80b4dd3b8a443b636c20a7b10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c9f5b9255565a956e5c0854320" ON "vehicle_accessories" ("vehicleId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "startedAt" TIMESTAMP NOT NULL, "endedAt" TIMESTAMP, "onlineSeconds" integer NOT NULL DEFAULT '0', "distanceKm" numeric(10,3) NOT NULL DEFAULT '0', "status" character varying NOT NULL DEFAULT 'ONLINE', CONSTRAINT "PK_c82753d4a1a259890ee47684ad9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e98e0c9f007c60f7b2f1e8b6aa" ON "driver_sessions" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."driver_locations_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "serviceId" character varying, "serviceType" "public"."driver_locations_servicetype_enum", "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "speedKph" numeric(8,2), "heading" numeric(6,2), "accuracyMeters" numeric(10,2), "recordedAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_31aae5c417762bf01ec26a53f02" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_62df81b116734099734d24a992" ON "driver_locations" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ba8c704c51d05a857f00cd77f8" ON "driver_locations" ("serviceId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_earning_goals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "periodStart" TIMESTAMP NOT NULL, "periodEnd" TIMESTAMP NOT NULL, "goalAmount" numeric(14,2) NOT NULL, "currency" character varying NOT NULL DEFAULT 'UGX', CONSTRAINT "PK_b0a75ea61237c10f7d24c426096" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ca73786f8cd0ecae41ae874ed0" ON "driver_earning_goals" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "training_modules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "code" character varying NOT NULL, "title" character varying NOT NULL, "description" text NOT NULL, "mediaUrl" character varying, "sequence" integer NOT NULL DEFAULT '0', "quiz" text, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_eb8283e63be7f65abc59c5d96a3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_48ae68089b0861e4dc9f8fc4ae" ON "training_modules" ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."training_progress_status_enum" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PASSED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "training_progress" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "moduleId" character varying NOT NULL, "status" "public"."training_progress_status_enum" NOT NULL DEFAULT 'NOT_STARTED', "score" integer NOT NULL DEFAULT '0', "answers" text, "completedAt" TIMESTAMP, CONSTRAINT "PK_97c9d74dd8beeffd749a90e411b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d6b63745743bd512eaeaeb562a" ON "training_progress" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_47a904845ef60fd37cb324152c" ON "training_progress" ("moduleId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "service_zones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "name" character varying NOT NULL, "countryCode" character varying NOT NULL DEFAULT 'UG', "city" character varying, "timezone" character varying NOT NULL DEFAULT 'Africa/Kampala', "currency" character varying NOT NULL DEFAULT 'UGX', "polygon" text, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_1fadb6afc50f01a0d66ab68c12d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pricing_rules_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pricing_rules_vehicletype_enum" AS ENUM('BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'MINI_CAR', 'SEDAN', 'HATCHBACK', 'CROSSOVER', 'SUV', 'MINIVAN', 'VAN', 'TRUCK', 'LUXURY', 'BUS', 'AMBULANCE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pricing_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "serviceType" "public"."pricing_rules_servicetype_enum" NOT NULL, "zoneId" character varying, "vehicleType" "public"."pricing_rules_vehicletype_enum", "baseFare" numeric(14,2) NOT NULL DEFAULT '0', "perKm" numeric(14,2) NOT NULL DEFAULT '0', "perMinute" numeric(14,2) NOT NULL DEFAULT '0', "minimumFare" numeric(14,2) NOT NULL DEFAULT '0', "bookingFee" numeric(14,2) NOT NULL DEFAULT '0', "cancellationFee" numeric(14,2) NOT NULL DEFAULT '0', "waitingPerMinute" numeric(14,2) NOT NULL DEFAULT '0', "defaultMultiplier" numeric(6,2) NOT NULL DEFAULT '1', "extras" text, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_fda27bb8db4630894decda61ff6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6d22f69730dda970167ca26546" ON "pricing_rules" ("serviceType") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_80d111aeacbb85cb29ffa629d6" ON "pricing_rules" ("zoneId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."surge_zones_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "surge_zones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "zoneId" character varying, "name" character varying NOT NULL, "serviceType" "public"."surge_zones_servicetype_enum" NOT NULL, "multiplier" numeric(6,2) NOT NULL DEFAULT '1', "polygon" text, "startsAt" TIMESTAMP, "endsAt" TIMESTAMP, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_6d8847f3b3d8d73bbd0b2f43ca7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_ef756b2e5400a70d822c12fdd2" ON "surge_zones" ("zoneId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."promo_codes_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "promo_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "code" character varying NOT NULL, "serviceType" "public"."promo_codes_servicetype_enum", "discountType" character varying NOT NULL DEFAULT 'PERCENT', "value" numeric(14,2) NOT NULL, "maximumDiscount" numeric(14,2), "minimumSpend" numeric(14,2) NOT NULL DEFAULT '0', "startsAt" TIMESTAMP, "endsAt" TIMESTAMP, "globalUsageLimit" integer NOT NULL DEFAULT '0', "perUserLimit" integer NOT NULL DEFAULT '1', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_c7b4f01710fda5afa056a2b4a35" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2f096c406a9d9d5b8ce204190c" ON "promo_codes" ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."promo_redemptions_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "promo_redemptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "promoCodeId" character varying NOT NULL, "userId" character varying NOT NULL, "serviceType" "public"."promo_redemptions_servicetype_enum" NOT NULL, "serviceId" character varying NOT NULL, "discountAmount" numeric(14,2) NOT NULL, CONSTRAINT "PK_34a930e5657a7e0a837b0bb41c9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9dd3db646d996a8f638d90c658" ON "promo_redemptions" ("promoCodeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d6ba170d54388257f185c84c7b" ON "promo_redemptions" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "wallets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "currency" character varying NOT NULL DEFAULT 'UGX', "availableBalance" numeric(16,2) NOT NULL DEFAULT '0', "pendingBalance" numeric(16,2) NOT NULL DEFAULT '0', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_8402e5df5a30a229380e83e4f7e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2ecdb33f23e9a6fc392025c0b9" ON "wallets" ("userId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."wallet_transactions_type_enum" AS ENUM('TOP_UP', 'PAYMENT', 'REFUND', 'TRANSFER', 'PAYOUT', 'TIP', 'ADJUSTMENT', 'EARNING')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."wallet_transactions_direction_enum" AS ENUM('CREDIT', 'DEBIT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."wallet_transactions_status_enum" AS ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "wallet_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "walletId" character varying NOT NULL, "type" "public"."wallet_transactions_type_enum" NOT NULL, "direction" "public"."wallet_transactions_direction_enum" NOT NULL, "amount" numeric(16,2) NOT NULL, "balanceAfter" numeric(16,2) NOT NULL, "reference" character varying NOT NULL, "status" "public"."wallet_transactions_status_enum" NOT NULL DEFAULT 'PAID', "description" character varying, "metadata" text, CONSTRAINT "PK_5120f131bde2cda940ec1a621db" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8a94d9d61a2b05123710b325fb" ON "wallet_transactions" ("walletId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4b3d5cb7b4480ca1c3c367ebb4" ON "wallet_transactions" ("reference") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_wallet_tx_wallet_ref_direction" ON "wallet_transactions" ("walletId", "reference", "direction") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_method_enum" AS ENUM('CASH', 'EVZONE_WALLET', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'INSURANCE', 'CORPORATE_PAY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "serviceType" "public"."payments_servicetype_enum" NOT NULL, "serviceId" character varying NOT NULL, "amount" numeric(16,2) NOT NULL, "currency" character varying NOT NULL DEFAULT 'UGX', "method" "public"."payments_method_enum" NOT NULL, "provider" character varying NOT NULL DEFAULT 'EVZONE_LOCAL', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'PENDING', "reference" character varying NOT NULL, "providerReference" character varying, "idempotencyKey" character varying, "breakdown" text, "paidAt" TIMESTAMP, "refundedAt" TIMESTAMP, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_d35cb3c13a18e1ea1705b2817b" ON "payments" ("userId") `);
    await queryRunner.query(`CREATE INDEX "IDX_1a507bb969c340d026fe11ac26" ON "payments" ("serviceType") `);
    await queryRunner.query(`CREATE INDEX "IDX_7600aa630b6bf8732e8b91cebd" ON "payments" ("serviceId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_866ddee0e17d9385b4e3b86851" ON "payments" ("reference") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payouts_status_enum" AS ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "amount" numeric(16,2) NOT NULL, "currency" character varying NOT NULL DEFAULT 'UGX', "status" "public"."payouts_status_enum" NOT NULL DEFAULT 'PENDING', "destination" character varying NOT NULL, "reference" character varying NOT NULL, "metadata" text, CONSTRAINT "PK_76855dc4f0a6c18c72eea302e87" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_432bd34c495ea23e5c182eb0e4" ON "payouts" ("driverId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_124c14495d8a41b06d83cc7c0c" ON "payouts" ("reference") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_status_enum" AS ENUM('DRAFT', 'QUOTED', 'REQUESTED', 'SEARCHING', 'OFFERED', 'ACCEPTED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'WAITING', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_mode_enum" AS ENUM('ON_DEMAND', 'SCHEDULED', 'SHARED', 'INTERCITY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_category_enum" AS ENUM('STANDARD', 'PREMIUM', 'SENIOR_ASSISTANCE', 'MEDICAL_PWD_TRANSFER', 'AIRPORT_TRANSFER', 'EVENT', 'SCHOOL', 'BUSINESS')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_triptype_enum" AS ENUM('ONE_WAY', 'ROUND_TRIP', 'MULTI_STOP')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_paymentmethod_enum" AS ENUM('CASH', 'EVZONE_WALLET', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'INSURANCE', 'CORPORATE_PAY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_paymentstatus_enum" AS ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rides" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "riderId" character varying NOT NULL, "driverId" character varying, "vehicleId" character varying, "status" "public"."rides_status_enum" NOT NULL DEFAULT 'REQUESTED', "mode" "public"."rides_mode_enum" NOT NULL DEFAULT 'ON_DEMAND', "category" "public"."rides_category_enum" NOT NULL DEFAULT 'STANDARD', "tripType" "public"."rides_triptype_enum" NOT NULL DEFAULT 'ONE_WAY', "passengerCount" integer NOT NULL DEFAULT '1', "scheduledAt" TIMESTAMP, "returnAt" TIMESTAMP, "estimatedDistanceKm" numeric(10,3) NOT NULL DEFAULT '0', "estimatedDurationMinutes" integer NOT NULL DEFAULT '0', "estimatedFare" numeric(16,2) NOT NULL DEFAULT '0', "finalFare" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "paymentMethod" "public"."rides_paymentmethod_enum" NOT NULL DEFAULT 'CASH', "paymentStatus" "public"."rides_paymentstatus_enum" NOT NULL DEFAULT 'PENDING', "beneficiaryContactId" character varying, "beneficiary" text, "preferences" text, "promoCode" character varying, "discountAmount" numeric(16,2) NOT NULL DEFAULT '0', "verificationCodeHash" character varying NOT NULL, "verificationCode" character varying NOT NULL, "verificationPassed" boolean NOT NULL DEFAULT false, "acceptedAt" TIMESTAMP, "arrivedAt" TIMESTAMP, "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "cancelledAt" TIMESTAMP, "cancelledByUserId" character varying, "cancellationReason" character varying, "sharingEnabled" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_ca6f62fc1e999b139c7f28f07fd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_3c581fc8082dc803233ec676ef" ON "rides" ("riderId") `);
    await queryRunner.query(`CREATE INDEX "IDX_0adda088d567495e71d21b6c69" ON "rides" ("driverId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."ride_stops_type_enum" AS ENUM('PICKUP', 'STOP', 'DROPOFF', 'RETURN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ride_stops_status_enum" AS ENUM('PENDING', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'SKIPPED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_stops" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "rideId" character varying NOT NULL, "sequence" integer NOT NULL, "type" "public"."ride_stops_type_enum" NOT NULL, "address" character varying NOT NULL, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "status" "public"."ride_stops_status_enum" NOT NULL DEFAULT 'PENDING', "arrivedAt" TIMESTAMP, "departedAt" TIMESTAMP, "contact" text, CONSTRAINT "PK_2e8c457ff8246319c1af2ece467" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_778341a31037fc7346624e524b" ON "ride_stops" ("rideId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."ride_offers_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "rideId" character varying NOT NULL, "driverId" character varying NOT NULL, "status" "public"."ride_offers_status_enum" NOT NULL DEFAULT 'PENDING', "offeredAt" TIMESTAMP NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "respondedAt" TIMESTAMP, "distanceToPickupKm" numeric(10,3), CONSTRAINT "PK_8bd0ac2b8b108f575ceea9cb433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e47debd3d44368f977ae7b6b81" ON "ride_offers" ("rideId") `);
    await queryRunner.query(`CREATE INDEX "IDX_59e126ca76a45cf7bdd74b817a" ON "ride_offers" ("driverId") `);
    await queryRunner.query(
      `CREATE TABLE "ride_passengers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "rideId" character varying NOT NULL, "userId" character varying, "name" character varying, "phone" character varying, "role" character varying NOT NULL DEFAULT 'SHARED', "pickupStopId" character varying, "dropoffStopId" character varying, "seatCount" integer NOT NULL DEFAULT '1', "fareShare" numeric(16,2) NOT NULL DEFAULT '0', "status" character varying NOT NULL DEFAULT 'CONFIRMED', CONSTRAINT "PK_de929f40f374ea757cca8fb0112" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_69b4817b8decc25eae033a9962" ON "ride_passengers" ("rideId") `);
    await queryRunner.query(
      `CREATE TABLE "ride_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "rideId" character varying NOT NULL, "eventType" character varying NOT NULL, "actorUserId" character varying, "data" text, CONSTRAINT "PK_a408fbed7f187bf7e160bf19155" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_8195bc746e2260f00202f5ee15" ON "ride_events" ("rideId") `);
    await queryRunner.query(
      `CREATE TABLE "ride_feedback" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "rideId" character varying NOT NULL, "riderId" character varying NOT NULL, "driverId" character varying NOT NULL, "rating" integer NOT NULL, "message" text, "tipAmount" numeric(16,2) NOT NULL DEFAULT '0', CONSTRAINT "PK_91c0f1c372da1bd5c062ab4a65f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c11092ccde98234a27932113ea" ON "ride_feedback" ("rideId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."delivery_orders_status_enum" AS ENUM('CREATED', 'WAITING_ACCEPTANCE', 'ACCEPTED', 'DRIVER_ASSIGNED', 'EN_ROUTE_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'QR_VERIFIED', 'IN_TRANSIT', 'ARRIVED_DROPOFF', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."delivery_orders_servicetype_enum" AS ENUM('BIKE', 'ELECTRIC_VEHICLE', 'TRUCK', 'COURIER', 'FOOD')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."delivery_orders_packagesize_enum" AS ENUM('SMALL', 'MEDIUM', 'LARGE', 'CUSTOM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."delivery_orders_paymentmethod_enum" AS ENUM('CASH', 'EVZONE_WALLET', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'INSURANCE', 'CORPORATE_PAY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."delivery_orders_paymentstatus_enum" AS ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "delivery_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "customerId" character varying NOT NULL, "driverId" character varying, "vehicleId" character varying, "routeId" character varying, "trackingCode" character varying NOT NULL, "status" "public"."delivery_orders_status_enum" NOT NULL DEFAULT 'CREATED', "serviceType" "public"."delivery_orders_servicetype_enum" NOT NULL, "packageName" character varying NOT NULL, "description" text, "packageSize" "public"."delivery_orders_packagesize_enum" NOT NULL DEFAULT 'SMALL', "weightKg" numeric(10,2) NOT NULL DEFAULT '0', "declaredValue" numeric(16,2) NOT NULL DEFAULT '0', "fragile" boolean NOT NULL DEFAULT false, "scheduledAt" TIMESTAMP, "pickupAddress" character varying NOT NULL, "pickupLatitude" numeric(10,7) NOT NULL, "pickupLongitude" numeric(10,7) NOT NULL, "destinationAddress" character varying NOT NULL, "destinationLatitude" numeric(10,7) NOT NULL, "destinationLongitude" numeric(10,7) NOT NULL, "sender" text NOT NULL, "receiver" text NOT NULL, "estimatedDistanceKm" numeric(10,3) NOT NULL DEFAULT '0', "estimatedDurationMinutes" integer NOT NULL DEFAULT '0', "estimatedCost" numeric(16,2) NOT NULL DEFAULT '0', "finalCost" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "paymentMethod" "public"."delivery_orders_paymentmethod_enum" NOT NULL DEFAULT 'CASH', "paymentStatus" "public"."delivery_orders_paymentstatus_enum" NOT NULL DEFAULT 'PENDING', "qrTokenHash" character varying NOT NULL, "qrToken" character varying NOT NULL, "dropoffCodeHash" character varying, "dropoffCode" character varying, "dropoffVerified" boolean NOT NULL DEFAULT false, "pickedUpAt" TIMESTAMP, "deliveredAt" TIMESTAMP, "completedAt" TIMESTAMP, "cancellationReason" character varying, CONSTRAINT "PK_29e637736a0b5f36946edec3650" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb142a45206c02f3c0dceff300" ON "delivery_orders" ("customerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7b8e15adca01a0ff7438743e93" ON "delivery_orders" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5f0bea95c44ef332c49ded597b" ON "delivery_orders" ("routeId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ccf9d6b99f7b09ea2be12b0def" ON "delivery_orders" ("trackingCode") `,
    );
    await queryRunner.query(
      `CREATE TABLE "delivery_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "orderId" character varying NOT NULL, "name" character varying NOT NULL, "quantity" integer NOT NULL DEFAULT '1', "unitWeightKg" numeric(10,2) NOT NULL DEFAULT '0', "imageUrl" character varying, "dimensions" text, "metadata" text, CONSTRAINT "PK_421035bb04c4c87c2b220e5fa8b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_b00c94a1b797110ea9023776c0" ON "delivery_items" ("orderId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."delivery_stops_type_enum" AS ENUM('PICKUP', 'STOP', 'DROPOFF', 'RETURN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."delivery_stops_status_enum" AS ENUM('PENDING', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'SKIPPED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "delivery_stops" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "orderId" character varying NOT NULL, "routeId" character varying, "sequence" integer NOT NULL, "type" "public"."delivery_stops_type_enum" NOT NULL, "address" character varying NOT NULL, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "status" "public"."delivery_stops_status_enum" NOT NULL DEFAULT 'PENDING', "contact" text, "completedAt" TIMESTAMP, CONSTRAINT "PK_eb416f3c6809d95677b680ee7a9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_6485d4b5b09adb9124f5dbe616" ON "delivery_stops" ("orderId") `);
    await queryRunner.query(`CREATE INDEX "IDX_e174f903fc0c9f9b636241ffba" ON "delivery_stops" ("routeId") `);
    await queryRunner.query(
      `CREATE TABLE "delivery_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "orderId" character varying NOT NULL, "eventType" character varying NOT NULL, "actorUserId" character varying, "data" text, CONSTRAINT "PK_19b3537a3e016d72733fa56f7a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bd78a39f8fa746ca77c5f85b62" ON "delivery_events" ("orderId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tracking_invitations_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tracking_invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "orderId" character varying NOT NULL, "senderUserId" character varying NOT NULL, "recipientUserId" character varying, "recipientName" character varying, "recipientPhone" character varying, "recipientEmail" character varying, "status" "public"."tracking_invitations_status_enum" NOT NULL DEFAULT 'PENDING', "token" character varying NOT NULL, "expiresAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_238bf1ca771414188c2f7b2b43b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c55e0af602b8196da30dc48002" ON "tracking_invitations" ("orderId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5f3393fce4bb023677b7a80198" ON "tracking_invitations" ("token") `,
    );
    await queryRunner.query(
      `CREATE TABLE "delivery_feedback" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "orderId" character varying NOT NULL, "customerId" character varying NOT NULL, "driverId" character varying, "rating" integer NOT NULL, "message" text, "tipAmount" numeric(16,2) NOT NULL DEFAULT '0', CONSTRAINT "PK_dbafa480e4926a45dd9337067dc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_39f42c75c92d356adbecc08a06" ON "delivery_feedback" ("orderId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tour_packages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "operatorUserId" character varying NOT NULL, "title" character varying NOT NULL, "description" text NOT NULL, "city" character varying, "countryCode" character varying NOT NULL DEFAULT 'UG', "durationDays" integer NOT NULL DEFAULT '1', "basePrice" numeric(16,2) NOT NULL, "currency" character varying NOT NULL DEFAULT 'UGX', "itinerary" text, "includedServices" text, "imageUrl" character varying, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_f6f4175550eb6e5cce18e8b892a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e45e7d8b3bb494d8ffdd88af99" ON "tour_packages" ("operatorUserId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tourist_bookings_status_enum" AS ENUM('DRAFT', 'QUOTED', 'REQUESTED', 'SEARCHING', 'OFFERED', 'ACCEPTED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'WAITING', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tourist_bookings_paymentmethod_enum" AS ENUM('CASH', 'EVZONE_WALLET', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'INSURANCE', 'CORPORATE_PAY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tourist_bookings_paymentstatus_enum" AS ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tourist_bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "customerId" character varying NOT NULL, "operatorUserId" character varying, "driverId" character varying, "vehicleId" character varying, "tourPackageId" character varying, "status" "public"."tourist_bookings_status_enum" NOT NULL DEFAULT 'REQUESTED', "startAt" TIMESTAMP NOT NULL, "endAt" TIMESTAMP NOT NULL, "pickupAddress" character varying NOT NULL, "pickupLatitude" numeric(10,7) NOT NULL, "pickupLongitude" numeric(10,7) NOT NULL, "dropoffAddress" character varying, "passengers" integer NOT NULL DEFAULT '1', "guideLanguage" character varying, "itinerary" text, "preferences" text, "estimatedAmount" numeric(16,2) NOT NULL, "finalAmount" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "paymentMethod" "public"."tourist_bookings_paymentmethod_enum" NOT NULL DEFAULT 'CASH', "paymentStatus" "public"."tourist_bookings_paymentstatus_enum" NOT NULL DEFAULT 'PENDING', "cancellationReason" character varying, CONSTRAINT "PK_9261364f2f3752670cc87e9921f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af624356799ce1949dcc17606f" ON "tourist_bookings" ("customerId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "medical_facilities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "name" character varying NOT NULL, "address" character varying NOT NULL, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "phone" character varying, "services" text, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_a4ae6eec0df194ec9fffa1bebb3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ambulance_requests_status_enum" AS ENUM('DRAFT', 'QUOTED', 'REQUESTED', 'SEARCHING', 'OFFERED', 'ACCEPTED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'WAITING', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ambulance_requests_priority_enum" AS ENUM('LOW', 'MODERATE', 'HIGH', 'CRITICAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ambulance_requests_paymentmethod_enum" AS ENUM('CASH', 'EVZONE_WALLET', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'INSURANCE', 'CORPORATE_PAY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ambulance_requests_paymentstatus_enum" AS ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ambulance_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requesterId" character varying NOT NULL, "dispatcherId" character varying, "driverId" character varying, "vehicleId" character varying, "status" "public"."ambulance_requests_status_enum" NOT NULL DEFAULT 'REQUESTED', "priority" "public"."ambulance_requests_priority_enum" NOT NULL DEFAULT 'HIGH', "patientName" character varying NOT NULL, "patientPhone" character varying, "patientAge" integer, "medicalCondition" character varying, "medicalNeeds" text, "pickupAddress" character varying NOT NULL, "pickupLatitude" numeric(10,7) NOT NULL, "pickupLongitude" numeric(10,7) NOT NULL, "destinationAddress" character varying, "destinationLatitude" numeric(10,7), "destinationLongitude" numeric(10,7), "medicalFacilityId" character varying, "scheduledAt" TIMESTAMP, "estimatedDistanceKm" numeric(10,3) NOT NULL DEFAULT '0', "estimatedDurationMinutes" integer NOT NULL DEFAULT '0', "estimatedCost" numeric(16,2) NOT NULL DEFAULT '0', "finalCost" numeric(16,2), "paymentMethod" "public"."ambulance_requests_paymentmethod_enum" NOT NULL DEFAULT 'CASH', "paymentStatus" "public"."ambulance_requests_paymentstatus_enum" NOT NULL DEFAULT 'PENDING', "consentToShareMedicalInfo" boolean NOT NULL DEFAULT true, "cancellationReason" character varying, CONSTRAINT "PK_da8172dcdf24068e06de6851f23" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae2a97e44b748044fe8f042c4d" ON "ambulance_requests" ("requesterId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ambulance_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requestId" character varying NOT NULL, "eventType" character varying NOT NULL, "actorUserId" character varying, "data" text, CONSTRAINT "PK_6dc81e487eb6326dec7545ae382" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_902a73d943b18974d5451a53e8" ON "ambulance_events" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rental_bookings_status_enum" AS ENUM('REQUESTED', 'CONFIRMED', 'PICKUP_INSPECTION', 'ACTIVE', 'RETURN_INSPECTION', 'COMPLETED', 'CANCELLED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rental_bookings_paymentmethod_enum" AS ENUM('CASH', 'EVZONE_WALLET', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'INSURANCE', 'CORPORATE_PAY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rental_bookings_paymentstatus_enum" AS ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rental_bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "renterId" character varying NOT NULL, "vehicleId" character varying NOT NULL, "ownerUserId" character varying NOT NULL, "driverId" character varying, "status" "public"."rental_bookings_status_enum" NOT NULL DEFAULT 'REQUESTED', "pickupAt" TIMESTAMP NOT NULL, "returnAt" TIMESTAMP NOT NULL, "pickupLocation" character varying NOT NULL, "returnLocation" character varying NOT NULL, "withDriver" boolean NOT NULL DEFAULT false, "dailyRate" numeric(16,2) NOT NULL, "depositAmount" numeric(16,2) NOT NULL DEFAULT '0', "estimatedAmount" numeric(16,2) NOT NULL, "finalAmount" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "paymentMethod" "public"."rental_bookings_paymentmethod_enum" NOT NULL DEFAULT 'CARD', "paymentStatus" "public"."rental_bookings_paymentstatus_enum" NOT NULL DEFAULT 'PENDING', "mileageLimitKm" numeric(10,2) NOT NULL DEFAULT '0', "extraKmRate" numeric(16,2) NOT NULL DEFAULT '0', "agreementAcceptedAt" TIMESTAMP, "cancellationReason" character varying, CONSTRAINT "PK_4311d89b9acfe5b25acdf0f9b21" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0d7b5df5a95c283928e68cacd4" ON "rental_bookings" ("renterId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0cc8264ee14786290566a3eb57" ON "rental_bookings" ("vehicleId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rental_inspections_type_enum" AS ENUM('PICKUP', 'RETURN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rental_inspections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "bookingId" character varying NOT NULL, "type" "public"."rental_inspections_type_enum" NOT NULL, "inspectorUserId" character varying NOT NULL, "odometerKm" numeric(12,2) NOT NULL DEFAULT '0', "fuelOrChargePercent" numeric(5,2) NOT NULL DEFAULT '100', "photos" text, "damages" text, "notes" text, "signedAt" TIMESTAMP, CONSTRAINT "PK_76a8c09724add834a1e1fa03c59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7a33f539dce243d11c0f24ba1b" ON "rental_inspections" ("bookingId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "rental_blocks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "vehicleId" character varying NOT NULL, "startsAt" TIMESTAMP NOT NULL, "endsAt" TIMESTAMP NOT NULL, "reason" character varying NOT NULL, "bookingId" character varying, CONSTRAINT "PK_0818292c2dc40eb33db477585b8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dbba3d2d367501bf3d55727f36" ON "rental_blocks" ("vehicleId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_threads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "contextType" character varying NOT NULL, "contextId" character varying NOT NULL, "createdByUserId" character varying NOT NULL, "lastMessageAt" TIMESTAMP, CONSTRAINT "PK_973a81c0adb9b18a5ea3ef95bf8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7418472a40a3afb014df06f7c0" ON "chat_threads" ("contextType") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_a7e37b101a3936b33b1c1330a7" ON "chat_threads" ("contextId") `);
    await queryRunner.query(
      `CREATE TABLE "chat_participants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "threadId" character varying NOT NULL, "userId" character varying NOT NULL, "lastReadAt" TIMESTAMP, "muted" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_ebf68c52a2b4dceb777672b782d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d15f71a9ecd07f8d8c035a1dcb" ON "chat_participants" ("threadId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fb6add83b1a7acc94433d38569" ON "chat_participants" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "threadId" character varying NOT NULL, "senderUserId" character varying NOT NULL, "body" text NOT NULL, "attachments" text, "editedAt" TIMESTAMP, CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_b2ac4c23281c85c64f16ff0548" ON "chat_messages" ("threadId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_279b22f49e10e3fae432d3ce8b" ON "chat_messages" ("senderUserId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."emergency_incidents_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."emergency_incidents_type_enum" AS ENUM('MEDICAL', 'ACCIDENT', 'FIRE', 'NATURAL_DISASTER', 'SECURITY', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."emergency_incidents_status_enum" AS ENUM('OPEN', 'ACKNOWLEDGED', 'RESPONDING', 'RESOLVED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "emergency_incidents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "reporterUserId" character varying NOT NULL, "driverId" character varying, "serviceType" "public"."emergency_incidents_servicetype_enum", "serviceId" character varying, "type" "public"."emergency_incidents_type_enum" NOT NULL, "status" "public"."emergency_incidents_status_enum" NOT NULL DEFAULT 'OPEN', "description" text, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "address" character varying, "sos" boolean NOT NULL DEFAULT false, "notifiedContacts" text, "resolvedAt" TIMESTAMP, CONSTRAINT "PK_b0ed14bd0a0f7d7ca5f71d95df5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c94c6f80eb0b046ee3bce8a371" ON "emergency_incidents" ("reporterUserId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trip_shares_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trip_shares" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "ownerUserId" character varying NOT NULL, "serviceType" "public"."trip_shares_servicetype_enum" NOT NULL, "serviceId" character varying NOT NULL, "token" character varying NOT NULL, "recipients" text, "expiresAt" TIMESTAMP NOT NULL, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_2eccae7c265528a70f7e2cd376f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_63bc3f15a8f57e5bbefcb3eff6" ON "trip_shares" ("ownerUserId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_a969d9fff5e94c9757b8a1131a" ON "trip_shares" ("serviceId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6c1ebf5aa1c3abebe0fca87773" ON "trip_shares" ("token") `,
    );
    await queryRunner.query(
      `CREATE TABLE "map_reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "reporterUserId" character varying NOT NULL, "type" character varying NOT NULL, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "notes" text, "status" character varying NOT NULL DEFAULT 'OPEN', CONSTRAINT "PK_17405a9e4959ecd2478ac5c21aa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2bb5945e8aaa210da1ca122a79" ON "map_reports" ("reporterUserId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."support_tickets_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."support_tickets_priority_enum" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."support_tickets_status_enum" AS ENUM('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "support_tickets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "serviceType" "public"."support_tickets_servicetype_enum", "serviceId" character varying, "category" character varying NOT NULL, "priority" "public"."support_tickets_priority_enum" NOT NULL DEFAULT 'NORMAL', "status" "public"."support_tickets_status_enum" NOT NULL DEFAULT 'OPEN', "subject" character varying NOT NULL, "description" text NOT NULL, "assignedToUserId" character varying, "messages" text, CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_8679e2ff150ff0e253189ca025" ON "support_tickets" ("userId") `);
    await queryRunner.query(
      `CREATE TYPE "public"."organizations_type_enum" AS ENUM('CORPORATE_CLIENT', 'FLEET_PARTNER', 'AGENT_DISPATCH', 'SCHOOL_OPERATOR', 'MEDICAL_PROVIDER', 'TOUR_OPERATOR', 'RENTAL_OPERATOR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organizations_status_enum" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "name" character varying NOT NULL, "legalName" character varying, "type" "public"."organizations_type_enum" NOT NULL, "status" "public"."organizations_status_enum" NOT NULL DEFAULT 'PENDING', "code" character varying NOT NULL, "externalId" character varying, "registrationNumber" character varying, "taxIdentificationNumber" character varying, "countryCode" character varying NOT NULL DEFAULT 'UG', "timezone" character varying NOT NULL DEFAULT 'Africa/Kampala', "currency" character varying NOT NULL DEFAULT 'UGX', "primaryOwnerUserId" character varying NOT NULL, "contactEmail" character varying, "contactPhone" character varying, "address" text, "serviceCapabilities" text, "settings" text, "approvedByUserId" character varying, "approvedAt" TIMESTAMP, CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_9b7ca6d30b94fef571cff87688" ON "organizations" ("name") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7e27c3b62c681fbe3e2322535f" ON "organizations" ("code") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_643b456fecc65e1ccfa0909297" ON "organizations" ("externalId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ba2ed407e5dbf74422250d5de5" ON "organizations" ("primaryOwnerUserId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organization_members_role_enum" AS ENUM('OWNER', 'ADMIN', 'FLEET_MANAGER', 'DISPATCH_MANAGER', 'DISPATCHER', 'AGENT', 'FINANCE', 'COMPLIANCE', 'VIEWER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organization_members_status_enum" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "organization_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "userId" character varying NOT NULL, "role" "public"."organization_members_role_enum" NOT NULL, "status" "public"."organization_members_status_enum" NOT NULL DEFAULT 'INVITED', "invitedByUserId" character varying, "invitedAt" TIMESTAMP, "joinedAt" TIMESTAMP, "permissions" text, CONSTRAINT "PK_c2b39d5d072886a4d9c8105eb9a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5652c2c6b066835b6c500d0d83" ON "organization_members" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e826222ad017663c6db1a45a4f" ON "organization_members" ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7c48546e8026fb043d9ad0c2c8" ON "organization_members" ("organizationId", "userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fleet_profiles_status_enum" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "code" character varying NOT NULL, "displayName" character varying NOT NULL, "status" "public"."fleet_profiles_status_enum" NOT NULL DEFAULT 'PENDING', "serviceCapabilities" text, "schoolShuttleEnabled" boolean NOT NULL DEFAULT false, "defaultZoneId" character varying, "operationsEmail" character varying, "operationsPhone" character varying, "dispatchRules" text, "payoutConfiguration" text, CONSTRAINT "PK_99e83c8183e5caa6bed60e320fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1af86359447654045eeb0932ab" ON "fleet_profiles" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3f766b2696edc21c776339dc7d" ON "fleet_profiles" ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fleet_vehicles_status_enum" AS ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REMOVED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_vehicles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "vehicleId" character varying NOT NULL, "status" "public"."fleet_vehicles_status_enum" NOT NULL DEFAULT 'PENDING', "ownershipType" character varying NOT NULL DEFAULT 'OWNED', "serviceCapabilities" text, "schoolManaged" boolean NOT NULL DEFAULT false, "schoolId" character varying, "externalSource" character varying, "externalId" character varying, "routeIds" text, "activatedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_24163e3ecefa1ea569d00d85515" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_69c8b59d543d216c166937dfa0" ON "fleet_vehicles" ("fleetId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_d77160c9158c361b7c1abf31d8" ON "fleet_vehicles" ("vehicleId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e50333358c7395162ccb891aec" ON "fleet_vehicles" ("fleetId", "vehicleId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fleet_drivers_status_enum" AS ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REMOVED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_drivers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "driverId" character varying NOT NULL, "status" "public"."fleet_drivers_status_enum" NOT NULL DEFAULT 'PENDING', "engagementType" character varying NOT NULL DEFAULT 'CONTRACTOR', "serviceCapabilities" text, "schoolManaged" boolean NOT NULL DEFAULT false, "schoolId" character varying, "externalSource" character varying, "externalId" character varying, "joinedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_406855fba9899b6fef771fd0cf2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_c767cdd6974ac0ed78afa03479" ON "fleet_drivers" ("fleetId") `);
    await queryRunner.query(`CREATE INDEX "IDX_03c11ec75578d704ab58e608fa" ON "fleet_drivers" ("driverId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d811536269f088b7c3b97a8d52" ON "fleet_drivers" ("fleetId", "driverId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fleet_assignments_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fleet_assignments_status_enum" AS ENUM('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "serviceType" "public"."fleet_assignments_servicetype_enum" NOT NULL, "serviceId" character varying, "driverId" character varying, "vehicleId" character varying, "status" "public"."fleet_assignments_status_enum" NOT NULL DEFAULT 'PLANNED', "startsAt" TIMESTAMP NOT NULL, "endsAt" TIMESTAMP, "assignedByUserId" character varying NOT NULL, "routeExternalId" character varying, "metadata" text, CONSTRAINT "PK_d0820ca606144d7c6ed19cfa77a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1201c917eaa1ed264cf702d4df" ON "fleet_assignments" ("fleetId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_12c39b756d297b4c0d9ded7f4d" ON "fleet_assignments" ("serviceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7dd5435d097e9e906853f887df" ON "fleet_assignments" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_94ad97b5826c2b41dfbf6f2b73" ON "fleet_assignments" ("vehicleId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fleet_maintenance_records_status_enum" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_maintenance_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "vehicleId" character varying NOT NULL, "status" "public"."fleet_maintenance_records_status_enum" NOT NULL DEFAULT 'SCHEDULED', "category" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "odometerKm" numeric(12,2), "scheduledAt" TIMESTAMP NOT NULL, "completedAt" TIMESTAMP, "cost" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "serviceProvider" character varying, "attachments" text, CONSTRAINT "PK_603535d0a414d7e060d7c62695a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3c74d8351b2bd7665ff9270298" ON "fleet_maintenance_records" ("fleetId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_666eeb9e6c47653e5a4298df3a" ON "fleet_maintenance_records" ("vehicleId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."school_fleet_connections_status_enum" AS ENUM('DISCONNECTED', 'CONNECTED', 'DEGRADED', 'ERROR', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."school_fleet_connections_syncdirection_enum" AS ENUM('INBOUND', 'OUTBOUND', 'BIDIRECTIONAL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "school_fleet_connections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "schoolId" character varying NOT NULL, "schoolName" character varying NOT NULL, "externalTenantId" character varying, "baseUrl" character varying, "credentialsEncrypted" text, "status" "public"."school_fleet_connections_status_enum" NOT NULL DEFAULT 'DISCONNECTED', "syncDirection" "public"."school_fleet_connections_syncdirection_enum" NOT NULL DEFAULT 'BIDIRECTIONAL', "webhookUrl" character varying, "lastSyncedAt" TIMESTAMP, "lastError" text, "config" text, CONSTRAINT "PK_5868981c67a9ab17770d9275acd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb5151a52787c517599d067967" ON "school_fleet_connections" ("fleetId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2ec8ade16d9955ff4a05444a27" ON "school_fleet_connections" ("schoolId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "school_fleet_resources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "connectionId" character varying NOT NULL, "fleetId" character varying NOT NULL, "resourceType" character varying NOT NULL, "externalId" character varying NOT NULL, "localEntityType" character varying, "localEntityId" character varying, "version" integer NOT NULL DEFAULT '1', "payload" text NOT NULL, "checksum" character varying NOT NULL, "active" boolean NOT NULL DEFAULT true, "lastSyncedAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_23f3cdc3d8edeb22f6944c93876" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_996fa70b4c0a5850856cfabf33" ON "school_fleet_resources" ("connectionId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6405a53aa238722fb68259ff4b" ON "school_fleet_resources" ("fleetId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8a722a569ae90962bd9741fc75" ON "school_fleet_resources" ("connectionId", "resourceType", "externalId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."school_sync_jobs_direction_enum" AS ENUM('INBOUND', 'OUTBOUND', 'BIDIRECTIONAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."school_sync_jobs_status_enum" AS ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'PARTIAL', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "school_sync_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "connectionId" character varying NOT NULL, "direction" "public"."school_sync_jobs_direction_enum" NOT NULL, "status" "public"."school_sync_jobs_status_enum" NOT NULL DEFAULT 'PENDING', "resourceType" character varying, "requestedByUserId" character varying, "correlationId" character varying NOT NULL, "processedCount" integer NOT NULL DEFAULT '0', "failedCount" integer NOT NULL DEFAULT '0', "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "error" text, "summary" text, CONSTRAINT "PK_918f45141dd4e434a82754b2c98" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0138acff0966cbf4d3f75ee60e" ON "school_sync_jobs" ("connectionId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c7a36da07edb142530048c808d" ON "school_sync_jobs" ("correlationId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_desks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "timezone" character varying NOT NULL DEFAULT 'Africa/Kampala', "active" boolean NOT NULL DEFAULT true, "serviceCapabilities" text, "zoneIds" text, "settings" text, CONSTRAINT "PK_e4c0c2711daed7689b1371fdd69" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_105405a0e0ae15147e75e7c50d" ON "dispatch_desks" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8fe1f90e73e60c734929c9fc53" ON "dispatch_desks" ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."agent_profiles_status_enum" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "organizationId" character varying NOT NULL, "deskId" character varying, "employeeCode" character varying NOT NULL, "status" "public"."agent_profiles_status_enum" NOT NULL DEFAULT 'ACTIVE', "canCreateManualBookings" boolean NOT NULL DEFAULT true, "canAssignDrivers" boolean NOT NULL DEFAULT true, "canOverridePricing" boolean NOT NULL DEFAULT false, "canIssueRefunds" boolean NOT NULL DEFAULT false, "serviceCapabilities" text, "portalRole" character varying NOT NULL DEFAULT 'support_t1', "teamId" character varying, "title" character varying, "department" character varying, "availabilityStatus" character varying NOT NULL DEFAULT 'AVAILABLE', "timezone" character varying NOT NULL DEFAULT 'Africa/Kampala', "language" character varying NOT NULL DEFAULT 'en', "permissions" text, "preferences" text, "trainingGateCompletedAt" TIMESTAMP, "lastActiveAt" TIMESTAMP, CONSTRAINT "PK_4583ee140a2222f8fcecf3ac023" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b33e9dd5843a6c76a1123463bc" ON "agent_profiles" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_df974ea5b39f01a5781e485a70" ON "agent_profiles" ("organizationId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e1824e9a9b98fe977037371b4b" ON "agent_profiles" ("deskId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7dcb9887b55f2371bf29075b4d" ON "agent_profiles" ("employeeCode") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."manual_bookings_source_enum" AS ENUM('RIDER_APP', 'DRIVER_APP', 'AGENT', 'DISPATCHER', 'FLEET_PARTNER', 'ADMIN', 'API', 'SCHOOL_APP', 'CORPORATE_PAY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."manual_bookings_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."manual_bookings_status_enum" AS ENUM('DRAFT', 'CREATED', 'DISPATCH_PENDING', 'ASSIGNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."manual_bookings_priority_enum" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT', 'EMERGENCY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."manual_bookings_paymentmethod_enum" AS ENUM('CASH', 'EVZONE_WALLET', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'INSURANCE', 'CORPORATE_PAY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "manual_bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "reference" character varying NOT NULL, "organizationId" character varying NOT NULL, "deskId" character varying, "agentUserId" character varying NOT NULL, "source" "public"."manual_bookings_source_enum" NOT NULL DEFAULT 'AGENT', "serviceType" "public"."manual_bookings_servicetype_enum" NOT NULL, "status" "public"."manual_bookings_status_enum" NOT NULL DEFAULT 'DRAFT', "priority" "public"."manual_bookings_priority_enum" NOT NULL DEFAULT 'NORMAL', "customerUserId" character varying, "customer" text NOT NULL, "bookingPayload" text NOT NULL, "serviceId" character varying, "scheduledAt" TIMESTAMP, "assignedDriverId" character varying, "assignedVehicleId" character varying, "quotedAmount" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "paymentMethod" "public"."manual_bookings_paymentmethod_enum" NOT NULL DEFAULT 'CASH', "corporatePayTransactionId" character varying, "notes" text, "failureReason" text, "confirmedAt" TIMESTAMP, "completedAt" TIMESTAMP, "cancelledAt" TIMESTAMP, CONSTRAINT "PK_ae184baeceb8cc4d7c7202ad17f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_96433549c5071d8f3a0457ae14" ON "manual_bookings" ("reference") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0205de769e9a9229dce6641a56" ON "manual_bookings" ("organizationId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_b898e35209c519763f43a41783" ON "manual_bookings" ("deskId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_e3f5fdea55cb5ee3efd7890537" ON "manual_bookings" ("agentUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3e4032aea1be0fdaacb47a1530" ON "manual_bookings" ("customerUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_83e68061d2fe8d9af5519d8e2a" ON "manual_bookings" ("serviceId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_assignments_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_assignments_status_enum" AS ENUM('PENDING', 'OFFERED', 'ACCEPTED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "manualBookingId" character varying NOT NULL, "serviceType" "public"."dispatch_assignments_servicetype_enum" NOT NULL, "serviceId" character varying, "dispatcherUserId" character varying NOT NULL, "fleetId" character varying, "driverId" character varying, "vehicleId" character varying, "status" "public"."dispatch_assignments_status_enum" NOT NULL DEFAULT 'PENDING', "offeredAt" TIMESTAMP, "respondedAt" TIMESTAMP, "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "reason" text, "metadata" text, CONSTRAINT "PK_03e57ae97cd24503f3c36c6a952" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b4aad991374202f77f788a2517" ON "dispatch_assignments" ("manualBookingId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "manualBookingId" character varying NOT NULL, "eventType" character varying NOT NULL, "actorUserId" character varying, "data" text, CONSTRAINT "PK_0ea8c45a735baa12e56053d89c3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9273e7d4fa6d8d90ee45e41500" ON "dispatch_events" ("manualBookingId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "dispatch_shifts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "deskId" character varying NOT NULL, "userId" character varying NOT NULL, "startsAt" TIMESTAMP NOT NULL, "endsAt" TIMESTAMP NOT NULL, "status" character varying NOT NULL DEFAULT 'SCHEDULED', "handledBookings" integer NOT NULL DEFAULT '0', "checkedInAt" TIMESTAMP, "checkedOutAt" TIMESTAMP, CONSTRAINT "PK_7e9a2ffbcf5610dd1c3f68c3325" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2984580ff16739f69373d0a29c" ON "dispatch_shifts" ("deskId") `);
    await queryRunner.query(`CREATE INDEX "IDX_219598fafb7db8f98fc8a94f19" ON "dispatch_shifts" ("userId") `);
    await queryRunner.query(
      `CREATE TABLE "corporate_pay_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "externalAccountId" character varying NOT NULL, "organizationId" character varying, "userId" character varying, "name" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'ACTIVE', "currency" character varying NOT NULL DEFAULT 'UGX', "transactionLimit" numeric(16,2), "monthlyLimit" numeric(16,2), "approvalRules" text, "metadata" text, CONSTRAINT "PK_6b1d0476aa09f6660cad1399353" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cbce45dee62a18679867e4f1bd" ON "corporate_pay_accounts" ("externalAccountId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8f48a4469b491239d7781893c4" ON "corporate_pay_accounts" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bdcce3efa2c011faf7dee47d71" ON "corporate_pay_accounts" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_transactions_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_transactions_status_enum" AS ENUM('CREATED', 'PENDING_APPROVAL', 'APPROVED', 'AUTHORIZED', 'PROCESSING', 'PAID', 'DECLINED', 'FAILED', 'CANCELLED', 'REFUNDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "corporate_pay_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "reference" character varying NOT NULL, "idempotencyKey" character varying, "externalTransactionId" character varying, "accountId" character varying, "organizationId" character varying, "userId" character varying NOT NULL, "serviceType" "public"."corporate_pay_transactions_servicetype_enum" NOT NULL, "serviceId" character varying NOT NULL, "manualBookingId" character varying, "paymentId" character varying, "amount" numeric(16,2) NOT NULL, "currency" character varying NOT NULL DEFAULT 'UGX', "status" "public"."corporate_pay_transactions_status_enum" NOT NULL DEFAULT 'CREATED', "description" character varying, "checkoutUrl" character varying, "providerPayload" text, "lastError" text, "approvedAt" TIMESTAMP, "paidAt" TIMESTAMP, "refundedAt" TIMESTAMP, CONSTRAINT "PK_1f9a51f65ca612d9080c09f6384" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c2c2ce45cd9f6839cdd5edd802" ON "corporate_pay_transactions" ("reference") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_41a48baa14f62c6495b51e803d" ON "corporate_pay_transactions" ("idempotencyKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b507566592791d404315ec1035" ON "corporate_pay_transactions" ("externalTransactionId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_89b5c121f901059d39af2a5118" ON "corporate_pay_transactions" ("accountId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af5b4727a1a0fd9890760c83c8" ON "corporate_pay_transactions" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a32f6530bdc8ab95e0687defa5" ON "corporate_pay_transactions" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6413d9caefcedde6760aa4d775" ON "corporate_pay_transactions" ("serviceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_91409680bbf941a180187ab6b2" ON "corporate_pay_transactions" ("paymentId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_webhook_events_status_enum" AS ENUM('RECEIVED', 'VERIFIED', 'PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "corporate_pay_webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "externalEventId" character varying NOT NULL, "eventType" character varying NOT NULL, "status" "public"."corporate_pay_webhook_events_status_enum" NOT NULL DEFAULT 'RECEIVED', "signatureValid" boolean NOT NULL DEFAULT false, "payload" text NOT NULL, "processedAt" TIMESTAMP, "error" text, CONSTRAINT "PK_64ec4b236467d3d18532cd53130" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_53b324b7ad6cf31fcb9341b0e5" ON "corporate_pay_webhook_events" ("externalEventId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_reconciliations_status_enum" AS ENUM('OPEN', 'MATCHED', 'MISMATCHED', 'RESOLVED', 'IGNORED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "corporate_pay_reconciliations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "transactionId" character varying NOT NULL, "externalSettlementId" character varying, "expectedAmount" numeric(16,2) NOT NULL, "settledAmount" numeric(16,2) NOT NULL, "variance" numeric(16,2) NOT NULL DEFAULT '0', "status" "public"."corporate_pay_reconciliations_status_enum" NOT NULL DEFAULT 'OPEN', "statementDate" TIMESTAMP, "resolvedByUserId" character varying, "resolvedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_5862791cd1f4f51a233ebfadabc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fa54f4b40cfa34325c10185464" ON "corporate_pay_reconciliations" ("transactionId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8086462ebad5d6797134381c41" ON "corporate_pay_reconciliations" ("externalSettlementId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "corporate_pay_subject_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "externalOrganizationId" character varying NOT NULL, "externalMemberId" character varying NOT NULL, "organizationId" character varying NOT NULL, "userId" character varying NOT NULL, "accountId" character varying, "status" character varying NOT NULL DEFAULT 'ACTIVE', "metadata" text, CONSTRAINT "PK_75c2525c9d7eb25ec07a917cdc0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dea112c1ebabad315af78bdef5" ON "corporate_pay_subject_links" ("externalOrganizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d8df3da538b1929ed4acb8c48a" ON "corporate_pay_subject_links" ("externalMemberId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c4acc34b13c0dd196d5c2fefba" ON "corporate_pay_subject_links" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bcfa125543f03dae33b9929747" ON "corporate_pay_subject_links" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_05c50e8013dbe6a41f3140fd16" ON "corporate_pay_subject_links" ("accountId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8db2ac8c3144d34a3c1b78dfd5" ON "corporate_pay_subject_links" ("externalOrganizationId", "externalMemberId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_partner_requests_requestkind_enum" AS ENUM('QUOTE', 'SERVICE_BOOKING', 'RIDE_SCHEDULE', 'DELIVERY', 'RFQ', 'REBOOKING')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_partner_requests_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_partner_requests_status_enum" AS ENUM('DRAFT', 'QUOTED', 'PENDING_APPROVAL', 'APPROVED', 'AUTHORIZED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DECLINED', 'FAILED', 'EXPIRED', 'REFUNDED', 'DISPUTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_partner_requests_priority_enum" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT', 'EMERGENCY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_partner_requests_authorizationstatus_enum" AS ENUM('NOT_REQUIRED', 'PENDING', 'APPROVED', 'AUTHORIZED', 'DECLINED', 'REVOKED', 'EXPIRED', 'CONSUMED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "corporate_pay_partner_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "externalRequestId" character varying NOT NULL, "idempotencyKey" character varying NOT NULL, "externalOrderId" character varying, "externalOrganizationId" character varying, "externalMemberId" character varying, "accountId" character varying, "userId" character varying, "requestKind" "public"."corporate_pay_partner_requests_requestkind_enum" NOT NULL, "serviceType" "public"."corporate_pay_partner_requests_servicetype_enum" NOT NULL, "status" "public"."corporate_pay_partner_requests_status_enum" NOT NULL DEFAULT 'DRAFT', "priority" "public"."corporate_pay_partner_requests_priority_enum" NOT NULL DEFAULT 'NORMAL', "customer" text NOT NULL, "servicePayload" text NOT NULL, "corporateContext" text, "quote" text, "amount" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "scheduledAt" TIMESTAMP, "dueAt" TIMESTAMP, "quoteExpiresAt" TIMESTAMP, "approvalId" character varying, "authorizationId" character varying, "authorizationStatus" "public"."corporate_pay_partner_requests_authorizationstatus_enum" NOT NULL DEFAULT 'PENDING', "policyId" character varying, "budgetId" character varying, "budgetReservationId" character varying, "costCenterId" character varying, "groupId" character varying, "purchaseOrderId" character varying, "manualBookingId" character varying, "serviceId" character varying, "transactionId" character varying, "parentRequestId" character varying, "lastError" text, "metadata" text, "confirmedAt" TIMESTAMP, "completedAt" TIMESTAMP, "cancelledAt" TIMESTAMP, "lastSyncedAt" TIMESTAMP, CONSTRAINT "PK_ec21eb705f1d3b14f17dbdffb69" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ce89bacc5c1cb07270915ddb5e" ON "corporate_pay_partner_requests" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8a1039b1b3c1c1878f259871c3" ON "corporate_pay_partner_requests" ("externalRequestId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2339d292c35eb03c09894a8e71" ON "corporate_pay_partner_requests" ("idempotencyKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_90f422d8209bbd9da66ecd314d" ON "corporate_pay_partner_requests" ("accountId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_376384a098017d518b93ace758" ON "corporate_pay_partner_requests" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e75097e993b1a2a0f934625178" ON "corporate_pay_partner_requests" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_76b5cf8fa2d0a3b1c0ee8f4296" ON "corporate_pay_partner_requests" ("manualBookingId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_56615c16612d1cc4f1dca21eaa" ON "corporate_pay_partner_requests" ("serviceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2e8656875697eddfefc00c3900" ON "corporate_pay_partner_requests" ("transactionId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_df78a1504c2bd7fd6417491cfe" ON "corporate_pay_partner_requests" ("organizationId", "externalRequestId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_authorizations_status_enum" AS ENUM('NOT_REQUIRED', 'PENDING', 'APPROVED', 'AUTHORIZED', 'DECLINED', 'REVOKED', 'EXPIRED', 'CONSUMED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "corporate_pay_authorizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "externalAuthorizationId" character varying NOT NULL, "requestId" character varying NOT NULL, "accountId" character varying, "status" "public"."corporate_pay_authorizations_status_enum" NOT NULL DEFAULT 'PENDING', "approvedAmount" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "approvalId" character varying, "policyId" character varying, "budgetId" character varying, "budgetReservationId" character varying, "policyDecision" text, "approvalContext" text, "budgetContext" text, "reason" text, "expiresAt" TIMESTAMP, "consumedAt" TIMESTAMP, "revokedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_19a40ae13c276e841adf650e044" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6ba5232b5d3be8e321fcb9508a" ON "corporate_pay_authorizations" ("externalAuthorizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7d36c082108249b6e277c53dd" ON "corporate_pay_authorizations" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0761a15ef3a97c24177596ffce" ON "corporate_pay_authorizations" ("accountId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_fulfillment_evidence_type_enum" AS ENUM('TRIP_RECEIPT', 'COMPLETION_LOG', 'DELIVERY_CONFIRMATION', 'SIGNATURE', 'PHOTO', 'INVOICE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "corporate_pay_fulfillment_evidence" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requestId" character varying NOT NULL, "externalEvidenceId" character varying, "type" "public"."corporate_pay_fulfillment_evidence_type_enum" NOT NULL, "url" character varying, "fileAssetId" character varying, "sha256" character varying, "actor" character varying, "note" text, "capturedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_886caf819197789067d87b9495f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0f1a062866397a9914dd29fff8" ON "corporate_pay_fulfillment_evidence" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f8b52ccc08e5b8a1221faf071b" ON "corporate_pay_fulfillment_evidence" ("externalEvidenceId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."corporate_pay_fulfillment_disputes_status_enum" AS ENUM('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "corporate_pay_fulfillment_disputes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "requestId" character varying NOT NULL, "externalDisputeId" character varying, "status" "public"."corporate_pay_fulfillment_disputes_status_enum" NOT NULL DEFAULT 'OPEN', "reason" text NOT NULL, "amount" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "evidence" text, "resolution" text, "openedAt" TIMESTAMP, "resolvedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_f28fb6ef14d2283f1142ed6bffe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b440bd3057cd90cf130ad2cfb2" ON "corporate_pay_fulfillment_disputes" ("requestId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e6149a02fe98f25c9734375396" ON "corporate_pay_fulfillment_disputes" ("externalDisputeId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "integration_outbox" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "destination" character varying NOT NULL, "aggregateType" character varying NOT NULL, "aggregateId" character varying NOT NULL, "eventType" character varying NOT NULL, "payload" text NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "nextAttemptAt" TIMESTAMP, "processedAt" TIMESTAMP, "lastError" text, CONSTRAINT "PK_0807cd3d14577a948b136b138b3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8e522f8759b97b8673e2f606a7" ON "integration_outbox" ("destination") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb672551a81ccfcdc287eb05e9" ON "integration_outbox" ("aggregateId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "platform_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "key" character varying NOT NULL, "category" character varying NOT NULL, "value" text NOT NULL, "protected" boolean NOT NULL DEFAULT false, "updatedByUserId" character varying, CONSTRAINT "PK_2934aeb70ec285196dcab4a2e96" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5d9031e30fac3ec3ec8b9602e1" ON "platform_settings" ("key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "idempotency_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "keyHash" character varying NOT NULL, "scope" character varying NOT NULL, "userId" character varying, "requestHash" character varying, "status" character varying NOT NULL DEFAULT 'PROCESSING', "responseBody" text, "responseStatus" integer, "expiresAt" TIMESTAMP NOT NULL, "completedAt" TIMESTAMP, CONSTRAINT "PK_9ae4e93699362b0d4e3da3dd1c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1d4337189e9e8ad8a71ee39017" ON "idempotency_records" ("keyHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_99a3858bc674d44f80ff0c3603" ON "idempotency_records" ("scope") `,
    );
    await queryRunner.query(
      `CREATE TABLE "stored_payment_methods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "type" character varying NOT NULL, "label" character varying NOT NULL, "provider" character varying, "providerToken" character varying, "maskedValue" character varying, "expiryMonth" integer, "expiryYear" integer, "isDefault" boolean NOT NULL DEFAULT false, "enabled" boolean NOT NULL DEFAULT true, "metadata" text, CONSTRAINT "PK_f9fc06ad9bd617156a83ddea91f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2b1cb80ee5dd27281022031b43" ON "stored_payment_methods" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "cashout_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "driverId" character varying, "amount" numeric(16,2) NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "method" text NOT NULL, "metadata" text, "reviewedByUserId" character varying, "reviewedAt" TIMESTAMP, "processedAt" TIMESTAMP, "failureReason" text, CONSTRAINT "PK_b524b1d26f5c77032759815e8a2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e3919f16eecffab51e59625960" ON "cashout_requests" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b789d942eca8cabb120d46c526" ON "cashout_requests" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "feature_flags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "scope" character varying NOT NULL DEFAULT 'GLOBAL', "key" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "description" text, "rules" text, "updatedByUserId" character varying, CONSTRAINT "PK_db657d344e9caacfc9d5cf8bbac" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_b578b4b5ebdaea56f7731bfb08" ON "feature_flags" ("scope") `);
    await queryRunner.query(`CREATE INDEX "IDX_36d0344370584b4d6a953c53a6" ON "feature_flags" ("key") `);
    await queryRunner.query(
      `CREATE TABLE "approval_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "entityType" character varying NOT NULL, "entityId" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "requestedByUserId" character varying NOT NULL, "reviewedByUserId" character varying, "notes" text, "payload" text, "reviewedAt" TIMESTAMP, CONSTRAINT "PK_484806bb8ff331b851fc75973c0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7493327936d396a0ea8b5d705e" ON "approval_requests" ("entityType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb151f383e28474a8d520fe8a9" ON "approval_requests" ("entityId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "risk_cases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "type" character varying NOT NULL, "severity" character varying NOT NULL DEFAULT 'MEDIUM', "status" character varying NOT NULL DEFAULT 'OPEN', "subjectType" character varying NOT NULL, "subjectId" character varying NOT NULL, "notes" text, "assignedToUserId" character varying, "resolvedByUserId" character varying, "resolvedAt" TIMESTAMP, "evidence" text, CONSTRAINT "PK_7154370fdc230769cb673a6acc5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_3251ba10f6ab6ef8ff68a3d45d" ON "risk_cases" ("type") `);
    await queryRunner.query(`CREATE INDEX "IDX_338ab77eb119f971f877115c17" ON "risk_cases" ("status") `);
    await queryRunner.query(`CREATE INDEX "IDX_80fd8de7d7efb53039f5d14f95" ON "risk_cases" ("subjectId") `);
    await queryRunner.query(
      `CREATE TABLE "service_configurations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "key" character varying NOT NULL, "name" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "configuration" text NOT NULL, "updatedByUserId" character varying, CONSTRAINT "PK_119e74b10debd93e136df9a9475" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ce101b65cfcce19c60f40bdc54" ON "service_configurations" ("key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "operational_alerts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "type" character varying NOT NULL, "severity" character varying NOT NULL DEFAULT 'WARNING', "status" character varying NOT NULL DEFAULT 'OPEN', "title" character varying NOT NULL, "message" text NOT NULL, "subjectType" character varying, "subjectId" character varying, "details" text, "acknowledgedByUserId" character varying, "acknowledgedAt" TIMESTAMP, "resolvedAt" TIMESTAMP, CONSTRAINT "PK_e4d5dd2641fcc1f61c0ff8f40da" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b50a70fcea9f9eaa2a4422c3c4" ON "operational_alerts" ("type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_521cebd84c7af27b6004f1338b" ON "operational_alerts" ("status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rider_commutes_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rider_commutes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "name" character varying NOT NULL, "serviceType" "public"."rider_commutes_servicetype_enum" NOT NULL DEFAULT 'RIDE', "pickup" text NOT NULL, "dropoff" text NOT NULL, "stops" text, "schedule" text NOT NULL, "active" boolean NOT NULL DEFAULT true, "nextRunAt" TIMESTAMP, "lastBookedAt" TIMESTAMP, "preferences" text, CONSTRAINT "PK_b437f59f931ab32cd9d5b919416" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2693552c1c196903c3c13f4bb4" ON "rider_commutes" ("userId") `);
    await queryRunner.query(
      `CREATE TABLE "user_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "userType" character varying NOT NULL DEFAULT 'USER', "documentType" character varying NOT NULL, "fileUrl" character varying NOT NULL, "fileKey" character varying, "originalFileName" character varying, "mimeType" character varying, "sizeBytes" integer, "side" character varying, "issuedAt" TIMESTAMP, "expiryDate" TIMESTAMP, "status" character varying NOT NULL DEFAULT 'IN_REVIEW', "rejectionReason" text, "verifiedAt" TIMESTAMP, "verifiedByUserId" character varying, "metadata" text, CONSTRAINT "PK_cea43819156528b63504c4afd4b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_7dc8609606e081e1ae0f0d43b4" ON "user_documents" ("userId") `);
    await queryRunner.query(
      `CREATE TABLE "emergency_contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "name" character varying NOT NULL, "phone" character varying NOT NULL, "relationship" character varying, "isPrimary" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_8be191845b6fca1c4e5ba5bd7d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9b9bb7f85035305c3dee924d22" ON "emergency_contacts" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "onboarding_applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "applicationType" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'DRAFT', "completionPercent" integer NOT NULL DEFAULT '0', "profileData" text, "submittedAt" TIMESTAMP, "reviewedAt" TIMESTAMP, "reviewedByUserId" character varying, "reviewNotes" text, CONSTRAINT "PK_a16b04e61cb1e7bf9d87280de67" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_855e3a8bf4bb675c7846cb4cb0" ON "onboarding_applications" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_570fb008bcb0eacfb0798c52a2" ON "onboarding_applications" ("applicationType") `,
    );
    await queryRunner.query(
      `CREATE TABLE "onboarding_checklist_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "applicationId" character varying NOT NULL, "key" character varying NOT NULL, "label" character varying NOT NULL, "required" boolean NOT NULL DEFAULT true, "status" character varying NOT NULL DEFAULT 'PENDING', "data" text, "completedAt" TIMESTAMP, CONSTRAINT "PK_daacc8c755ddaec6c9f38c4ef4e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a45ebab903be4056e60d67c4d9" ON "onboarding_checklist_items" ("applicationId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "tokenHash" character varying NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "consumedAt" TIMESTAMP, "requestedFromIp" character varying, CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d6a19d4b4f6c62dcd29daa497e" ON "password_reset_tokens" ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1143abb8c3fad8b06dd857a8c9" ON "password_reset_tokens" ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."device_tokens_platform_enum" AS ENUM('EXPO', 'FCM', 'APNS', 'WEB')`,
    );
    await queryRunner.query(
      `CREATE TABLE "device_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "token" character varying NOT NULL, "platform" "public"."device_tokens_platform_enum" NOT NULL, "provider" character varying NOT NULL DEFAULT 'FCM', "deviceId" character varying, "active" boolean NOT NULL DEFAULT true, "lastSeenAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_84700be257607cfb1f9dc2e52c3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_511957e3e8443429dc3fb00120" ON "device_tokens" ("userId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_977e24c520c49436d08e5eeea8" ON "device_tokens" ("token") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."push_deliveries_status_enum" AS ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "push_deliveries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "notificationId" character varying, "deviceTokenId" character varying, "provider" character varying NOT NULL DEFAULT 'LOCAL', "status" "public"."push_deliveries_status_enum" NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "response" text, "error" text, "sentAt" TIMESTAMP, CONSTRAINT "PK_5ce22daf7289b2e540fbe06f38e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_68cd1ddd15be2d9fbec20b11be" ON "push_deliveries" ("userId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_1cd1fea0e247d2ac97ea96112c" ON "push_deliveries" ("notificationId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."domain_events_status_enum" AS ENUM('PENDING', 'PUBLISHED', 'FALLBACK', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "domain_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "eventId" character varying NOT NULL, "topic" character varying NOT NULL, "eventType" character varying NOT NULL, "aggregateType" character varying, "aggregateId" character varying, "eventKey" character varying, "payload" text NOT NULL, "status" "public"."domain_events_status_enum" NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "occurredAt" TIMESTAMP NOT NULL, "nextAttemptAt" TIMESTAMP, "publishedAt" TIMESTAMP, "lastError" text, CONSTRAINT "PK_66e0920a32dda3a89b46ee7a981" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_94fc3fd8b7c8112892c3994544" ON "domain_events" ("eventId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e4cfc7930add724b2998f71adc" ON "domain_events" ("topic") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_8d3c63bd828f5336592f152ab4" ON "domain_events" ("aggregateId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."matching_jobs_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."matching_jobs_status_enum" AS ENUM('QUEUED', 'DISPATCHING', 'WAITING', 'ASSIGNED', 'EXHAUSTED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "matching_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "serviceType" "public"."matching_jobs_servicetype_enum" NOT NULL, "serviceId" character varying NOT NULL, "status" "public"."matching_jobs_status_enum" NOT NULL DEFAULT 'QUEUED', "pickupLatitude" numeric(10,7) NOT NULL, "pickupLongitude" numeric(10,7) NOT NULL, "requiredCapabilities" text, "currentRadiusMeters" integer NOT NULL DEFAULT '3000', "maxRadiusMeters" integer NOT NULL DEFAULT '25000', "radiusStepMeters" integer NOT NULL DEFAULT '3000', "concurrentOfferLimit" integer NOT NULL DEFAULT '5', "dispatchRound" integer NOT NULL DEFAULT '0', "nextDispatchAt" TIMESTAMP, "expiresAt" TIMESTAMP, "assignedDriverId" character varying, "exhaustedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_e9b93c04d62197a34a47e7161ca" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_matching_jobs_service" ON "matching_jobs" ("serviceType", "serviceId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."job_offers_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "jobId" uuid NOT NULL, "driverId" uuid NOT NULL, "status" "public"."job_offers_status_enum" NOT NULL DEFAULT 'PENDING', "offeredAt" TIMESTAMP NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "respondedAt" TIMESTAMP, "distanceMeters" numeric(12,2), "dispatchRound" integer NOT NULL DEFAULT '1', "payload" text, CONSTRAINT "PK_9a54d36bd6829979f945defdeb5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_35d7bc8162419be0e7d3365cf7" ON "job_offers" ("jobId") `);
    await queryRunner.query(`CREATE INDEX "IDX_24b65fbf46659c9f12326c43b0" ON "job_offers" ("driverId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_job_offers_job_driver" ON "job_offers" ("jobId", "driverId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."delivery_routes_status_enum" AS ENUM('DRAFT', 'PLANNED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "delivery_routes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying, "driverId" character varying, "vehicleId" character varying, "name" character varying NOT NULL, "status" "public"."delivery_routes_status_enum" NOT NULL DEFAULT 'DRAFT', "plannedStartAt" TIMESTAMP, "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "estimatedDistanceKm" numeric(12,3) NOT NULL DEFAULT '0', "estimatedDurationMinutes" integer NOT NULL DEFAULT '0', "optimization" text, "metadata" text, CONSTRAINT "PK_114337f048f541ccfe4c5d57140" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e6fbcba82291e0134140b772d" ON "delivery_routes" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b949a7a0eefa241bee9f5f9260" ON "delivery_routes" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ledger_accounts_accounttype_enum" AS ENUM('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ledger_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "code" character varying NOT NULL, "name" character varying NOT NULL, "accountType" "public"."ledger_accounts_accounttype_enum" NOT NULL, "ownerType" character varying NOT NULL DEFAULT 'SYSTEM', "ownerId" character varying, "currency" character varying NOT NULL DEFAULT 'UGX', "balance" numeric(18,2) NOT NULL DEFAULT '0', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_62b34396dda564757cf123fff0e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_38110ab19259ee2e6cf0adc82c" ON "ledger_accounts" ("code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_01aa4f7738e65ff6d5cd7726f4" ON "ledger_accounts" ("ownerId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."journal_transactions_status_enum" AS ENUM('PENDING', 'POSTED', 'REVERSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."journal_transactions_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "journal_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "reference" character varying NOT NULL, "transactionType" character varying NOT NULL, "status" "public"."journal_transactions_status_enum" NOT NULL DEFAULT 'PENDING', "description" character varying, "serviceType" "public"."journal_transactions_servicetype_enum", "serviceId" character varying, "postedAt" TIMESTAMP, "reversedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_d71a37c90bc6540c375320b9b24" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_65191f5abbbe15d0021c2c4ede" ON "journal_transactions" ("reference") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8fec680c2dd084db5a1f0421a6" ON "journal_transactions" ("serviceId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ledger_entries_direction_enum" AS ENUM('CREDIT', 'DEBIT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ledger_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "journalId" character varying NOT NULL, "accountId" character varying NOT NULL, "direction" "public"."ledger_entries_direction_enum" NOT NULL, "amount" numeric(18,2) NOT NULL, "currency" character varying NOT NULL DEFAULT 'UGX', "balanceAfter" numeric(18,2) NOT NULL DEFAULT '0', "memo" character varying, "metadata" text, CONSTRAINT "PK_6efcb84411d3f08b08450ae75d5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e205af1ad4c98873d1c624a8bb" ON "ledger_entries" ("journalId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c5434f6dfb7b6f304a450d9304" ON "ledger_entries" ("accountId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."earnings_ledger_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "earnings_ledger" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "driverId" character varying, "serviceType" "public"."earnings_ledger_servicetype_enum", "serviceId" character varying, "journalId" character varying NOT NULL, "grossAmount" numeric(18,2) NOT NULL DEFAULT '0', "platformFee" numeric(18,2) NOT NULL DEFAULT '0', "netAmount" numeric(18,2) NOT NULL DEFAULT '0', "tipAmount" numeric(18,2) NOT NULL DEFAULT '0', "currency" character varying NOT NULL DEFAULT 'UGX', "status" character varying NOT NULL DEFAULT 'POSTED', CONSTRAINT "PK_60b13c2ba53a475a57672f9296d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_a64f6a7a957405a3961e34f24c" ON "earnings_ledger" ("userId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_c46430cec20e0c712fd8a0aebe" ON "earnings_ledger" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_da3a58884a32ce575d05edd008" ON "earnings_ledger" ("serviceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4d8ffbdd0b417c2702c8eefe10" ON "earnings_ledger" ("journalId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trip_pause_requests_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trip_pause_requests_status_enum" AS ENUM('REQUESTED', 'PAUSED', 'REJECTED', 'RESUMED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trip_pause_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "serviceType" "public"."trip_pause_requests_servicetype_enum" NOT NULL, "serviceId" character varying NOT NULL, "requestedByUserId" character varying NOT NULL, "status" "public"."trip_pause_requests_status_enum" NOT NULL DEFAULT 'REQUESTED', "reason" text NOT NULL, "riderConfirmedAt" TIMESTAMP, "driverConfirmedAt" TIMESTAMP, "pausedAt" TIMESTAMP, "resumedAt" TIMESTAMP, "resumeRequestedByUserId" character varying, "riderResumeConfirmedAt" TIMESTAMP, "driverResumeConfirmedAt" TIMESTAMP, "expiresAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_09b53cdd601214ac007937d621d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_289043364228ba31cbb5f05ea5" ON "trip_pause_requests" ("serviceType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_056262855090ccdf2c5e339893" ON "trip_pause_requests" ("serviceId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_places_lastservicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_places" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" character varying NOT NULL, "label" character varying NOT NULL, "address" character varying NOT NULL, "providerPlaceId" character varying, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "source" character varying NOT NULL DEFAULT 'SEARCH', "pinned" boolean NOT NULL DEFAULT false, "pinLabel" character varying, "useCount" integer NOT NULL DEFAULT '1', "lastUsedAt" TIMESTAMP NOT NULL, "lastServiceType" "public"."user_places_lastservicetype_enum", "metadata" text, CONSTRAINT "PK_deff4aaddd5c8057075df7b89b8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_ca30ed31a1f50bda1d702bb316" ON "user_places" ("userId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_places_user_last_used" ON "user_places" ("userId", "lastUsedAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "rental_branches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "operatorUserId" character varying NOT NULL, "organizationId" character varying, "code" character varying NOT NULL, "name" character varying NOT NULL, "address" character varying NOT NULL, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "phone" character varying, "timezone" character varying NOT NULL DEFAULT 'Africa/Kampala', "openingHours" text, "serviceAreas" text, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_ae252ff0ba39bba42da4cd3349d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_61a619568e79801b2574335cf9" ON "rental_branches" ("operatorUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c3969fdaa51aecf4165d76f4af" ON "rental_branches" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_35f42892709394b977bbac026d" ON "rental_branches" ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "rental_vehicle_classes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "operatorUserId" character varying, "branchId" character varying, "code" character varying NOT NULL, "name" character varying NOT NULL, "description" text, "vehicleTypes" text NOT NULL, "minimumSeats" integer NOT NULL DEFAULT '1', "maximumPassengers" integer NOT NULL DEFAULT '4', "luggageCapacity" integer NOT NULL DEFAULT '0', "features" text, "pricing" text, "imageUrl" character varying, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_0d89cffc9ec222062e45d85e08e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09adc8f3f1b338086444c91d2e" ON "rental_vehicle_classes" ("operatorUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c016d3675aa4b476a30978b7af" ON "rental_vehicle_classes" ("branchId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e869ca761fe278cc3b247fbe95" ON "rental_vehicle_classes" ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."custom_rental_requests_paymentmethod_enum" AS ENUM('CASH', 'EVZONE_WALLET', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'INSURANCE', 'CORPORATE_PAY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "custom_rental_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "renterId" character varying NOT NULL, "branchId" character varying, "requestedVehicleClassId" character varying, "status" character varying NOT NULL DEFAULT 'REQUESTED', "pickupAt" TIMESTAMP NOT NULL, "returnAt" TIMESTAMP NOT NULL, "pickupLocation" character varying NOT NULL, "returnLocation" character varying NOT NULL, "passengerCount" integer NOT NULL DEFAULT '1', "luggageCount" integer NOT NULL DEFAULT '0', "withDriver" boolean NOT NULL DEFAULT false, "requirements" text, "budgetAmount" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "paymentMethod" "public"."custom_rental_requests_paymentmethod_enum" NOT NULL DEFAULT 'CARD', "quotedVehicleId" character varying, "quoteAmount" numeric(16,2), "quoteExpiresAt" TIMESTAMP, "quotedByUserId" character varying, "quotedAt" TIMESTAMP, "acceptedAt" TIMESTAMP, "rejectedAt" TIMESTAMP, "rejectionReason" character varying, "bookingId" character varying, CONSTRAINT "PK_e90d8fe3ceb78cb93d3cc8158a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9b0de846ecb2be1e672b1ee0ba" ON "custom_rental_requests" ("renterId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a0d0e2870e95d01355f0f17368" ON "custom_rental_requests" ("branchId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_training_assessments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "moduleId" character varying NOT NULL, "attemptNumber" integer NOT NULL DEFAULT '1', "answers" text, "score" integer NOT NULL DEFAULT '0', "passed" boolean NOT NULL DEFAULT false, "submittedAt" TIMESTAMP NOT NULL, "feedback" text, CONSTRAINT "PK_03ca7263f7b35fe6cbb2592300a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1968e5fcf1812be11b16f23554" ON "driver_training_assessments" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c9ac8a2f4de11bf33ef0904608" ON "driver_training_assessments" ("moduleId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_driver_training_assessment_attempt" ON "driver_training_assessments" ("driverId", "moduleId", "attemptNumber") `,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_training_certificates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "driverId" character varying NOT NULL, "moduleId" character varying, "certificateNumber" character varying NOT NULL, "title" character varying NOT NULL, "issuedAt" TIMESTAMP NOT NULL, "expiresAt" TIMESTAMP, "verificationCode" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'ACTIVE', "metadata" text, CONSTRAINT "PK_c0b9c593ca34af491bc1f956b9d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_01dd774245104be19154d8bf9b" ON "driver_training_certificates" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_34335f364b55eece9124001f01" ON "driver_training_certificates" ("moduleId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_85adc26319b0ac5fd171e3c1f0" ON "driver_training_certificates" ("certificateNumber") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9c1ad0ff8dd8e3b31ef9d0dd97" ON "driver_training_certificates" ("verificationCode") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."service_reviews_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "service_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "serviceType" "public"."service_reviews_servicetype_enum" NOT NULL, "serviceId" character varying NOT NULL, "reviewerUserId" character varying NOT NULL, "revieweeUserId" character varying, "reviewerRole" character varying NOT NULL DEFAULT 'CUSTOMER', "rating" integer NOT NULL, "categoryRatings" text, "tags" text, "comment" text, "status" character varying NOT NULL DEFAULT 'PUBLISHED', "visibility" character varying NOT NULL DEFAULT 'PUBLIC', "response" text, "respondedByUserId" character varying, "respondedAt" TIMESTAMP, "reportedByUserId" character varying, "reportReason" character varying, "reportedAt" TIMESTAMP, "moderatedByUserId" character varying, "moderatedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_c40dc1be7bcb7704ee29fef3c10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4b79de74e1d6c9a175b6edc6e8" ON "service_reviews" ("serviceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1ee2ba9aed0d1eb75c1f080ec5" ON "service_reviews" ("reviewerUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_099e09ad89a88a046abf61d104" ON "service_reviews" ("revieweeUserId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_service_reviews_unique_reviewer" ON "service_reviews" ("serviceType", "serviceId", "reviewerUserId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."safety_event_logs_servicetype_enum" AS ENUM('RIDE', 'DELIVERY', 'TOURIST_VEHICLE', 'AMBULANCE', 'CAR_RENTAL', 'SCHOOL_SHUTTLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "safety_event_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "incidentId" character varying NOT NULL, "referenceType" character varying NOT NULL DEFAULT 'INCIDENT', "serviceType" "public"."safety_event_logs_servicetype_enum", "serviceId" character varying, "eventType" character varying NOT NULL, "actorUserId" character varying, "data" text, CONSTRAINT "PK_b01cb15b2f2b99c174644cabf86" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_facd048e7f85f1f0452834d3e4" ON "safety_event_logs" ("incidentId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_branches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "address" character varying, "city" character varying, "country" character varying, "phone" character varying, "email" character varying, "managerName" character varying, "operatingHours" text, "status" character varying NOT NULL DEFAULT 'ACTIVE', "latitude" numeric(10,7), "longitude" numeric(10,7), "metadata" text, CONSTRAINT "PK_58c1d6acd50e02ee16639893527" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_cec6234e7d70e86c290385fd7b" ON "fleet_branches" ("fleetId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0e54f3d540fe0d6353ab14b8a8" ON "fleet_branches" ("fleetId", "code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_portal_resources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "resourceType" character varying NOT NULL, "resourceKey" character varying NOT NULL, "parentId" character varying, "status" character varying NOT NULL DEFAULT 'ACTIVE', "title" character varying, "scheduledAt" TIMESTAMP, "completedAt" TIMESTAMP, "amount" numeric(16,2), "currency" character varying NOT NULL DEFAULT 'UGX', "createdByUserId" character varying, "updatedByUserId" character varying, "data" text, CONSTRAINT "PK_e901cadc255f58fc5140f7abd6d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a15f5053217c0410eed991660b" ON "fleet_portal_resources" ("fleetId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dc642ef28c31533d26261804f5" ON "fleet_portal_resources" ("resourceType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0e01a7f5d07b39953f1f1bf380" ON "fleet_portal_resources" ("parentId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f634ae6d9082306bd04c13ac0f" ON "fleet_portal_resources" ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c0cbc97e489415a55a07dc7335" ON "fleet_portal_resources" ("fleetId", "resourceType", "resourceKey") `,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_portal_configurations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "scope" character varying NOT NULL, "data" text NOT NULL, "updatedByUserId" character varying, CONSTRAINT "PK_4e4af2e6168b4e77dfe26a85660" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_58f72ce8ae1bf6c0ad4b4ffe1a" ON "fleet_portal_configurations" ("fleetId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3de163735931576460b08e26b4" ON "fleet_portal_configurations" ("fleetId", "scope") `,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_role_definitions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "name" character varying NOT NULL, "description" character varying, "color" character varying NOT NULL DEFAULT '#03cd8c', "isSystem" boolean NOT NULL DEFAULT false, "active" boolean NOT NULL DEFAULT true, "permissions" text NOT NULL, CONSTRAINT "PK_8bcedc78709c5d432f9cea30f43" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2c9b616351b658713c17a8d1f5" ON "fleet_role_definitions" ("fleetId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6504773477a641220a50925c98" ON "fleet_role_definitions" ("fleetId", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "fleet_member_invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "fleetId" character varying NOT NULL, "organizationId" character varying NOT NULL, "email" character varying NOT NULL, "role" character varying NOT NULL, "tokenHash" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP NOT NULL, "invitedByUserId" character varying NOT NULL, "acceptedByUserId" character varying, "acceptedAt" TIMESTAMP, "metadata" text, CONSTRAINT "PK_e9ba3fea9509d4fc16b564835e8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_07ea9097f24a1d0bcda5901196" ON "fleet_member_invitations" ("fleetId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b9505c8a7fd32a5c4a27770e0c" ON "fleet_member_invitations" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d0cfe16fb1dea70f7cfd951353" ON "fleet_member_invitations" ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a6f17ba3e0a3f701f7384c2ea0" ON "fleet_member_invitations" ("fleetId", "email", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_teams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "name" character varying NOT NULL, "description" text, "supervisorUserId" character varying, "queueTypes" text, "serviceCapabilities" text, "memberUserIds" text, "active" boolean NOT NULL DEFAULT true, "metadata" text, CONSTRAINT "PK_b199bf37b3333ad39133207cb98" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7c0fed3218103d68bc6f4de230" ON "agent_teams" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4660f6736b80348a053f33fb7e" ON "agent_teams" ("organizationId", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_role_definitions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "name" character varying NOT NULL, "description" text, "color" character varying NOT NULL DEFAULT '#03cd8c', "isSystem" boolean NOT NULL DEFAULT false, "active" boolean NOT NULL DEFAULT true, "permissions" text NOT NULL, "metadata" text, CONSTRAINT "PK_fa01bbe9563fd80dd43be2509d3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ce1d5415df09a496fb8761eec5" ON "agent_role_definitions" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4b90555035f01c724580fd6d0d" ON "agent_role_definitions" ("organizationId", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "assigneeUserId" character varying, "createdByUserId" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "category" character varying NOT NULL DEFAULT 'GENERAL', "status" character varying NOT NULL DEFAULT 'OPEN', "priority" character varying NOT NULL DEFAULT 'NORMAL', "dueAt" TIMESTAMP, "completedAt" TIMESTAMP, "relatedType" character varying, "relatedId" character varying, "tags" text, "metadata" text, CONSTRAINT "PK_0dd9472bb57b7ab7d0a5cd1f20b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e9ff12c0c77b3ffa298c3802bd" ON "agent_tasks" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_da67a4f6385d8c28737baea86e" ON "agent_tasks" ("assigneeUserId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_d4a8c1329ffcda2fd53bae04ad" ON "agent_tasks" ("status") `);
    await queryRunner.query(
      `CREATE TABLE "agent_drafts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "agentUserId" character varying NOT NULL, "draftType" character varying NOT NULL, "title" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'ACTIVE', "lastStep" character varying, "payload" text NOT NULL, "expiresAt" TIMESTAMP, CONSTRAINT "PK_981846f08cb6d6e51b63f506d6d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7ba38dfbe000a5084e854ff9d8" ON "agent_drafts" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1b79e0cc68005762246cc0dffc" ON "agent_drafts" ("agentUserId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_5b924b961959406853c541ca57" ON "agent_drafts" ("draftType") `);
    await queryRunner.query(
      `CREATE TABLE "agent_qa_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "agentUserId" character varying NOT NULL, "reviewerUserId" character varying, "interactionType" character varying NOT NULL DEFAULT 'SUPPORT', "referenceType" character varying, "referenceId" character varying, "status" character varying NOT NULL DEFAULT 'PENDING', "score" numeric(5,2), "rubric" text, "feedback" text, "coachingPlan" text, "reviewedAt" TIMESTAMP, CONSTRAINT "PK_eac34b4cbd2235306743e968f2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_098a481b7d55d18db219da3dbe" ON "agent_qa_reviews" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e4dfe702945459a7a5e5eb72e9" ON "agent_qa_reviews" ("agentUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a4da39d1a682a609787d2cc4e5" ON "agent_qa_reviews" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_training_modules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "code" character varying NOT NULL, "title" character varying NOT NULL, "description" text NOT NULL, "mediaUrl" character varying, "sequence" integer NOT NULL DEFAULT '0', "passingScore" integer NOT NULL DEFAULT '80', "roleScopes" text, "content" text, "quiz" text, "required" boolean NOT NULL DEFAULT true, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_8a3f37bc468fbf09d7ac671dfa3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_312e8fb08a6031e1f524e1bb34" ON "agent_training_modules" ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_training_progress" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "agentUserId" character varying NOT NULL, "moduleId" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'NOT_STARTED', "progressPercent" integer NOT NULL DEFAULT '0', "score" integer NOT NULL DEFAULT '0', "attempts" integer NOT NULL DEFAULT '0', "answers" text, "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "certificateNumber" character varying, "certificateUrl" character varying, CONSTRAINT "PK_29187945ef99afe8665cd12006b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c2baab6fe77a0ba8eb605dbeca" ON "agent_training_progress" ("agentUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c5394967367386d3460d81fdb5" ON "agent_training_progress" ("moduleId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_71a587bc27b341a82b9778dd9a" ON "agent_training_progress" ("agentUserId", "moduleId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_shift_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "organizationId" character varying NOT NULL, "userId" character varying NOT NULL, "teamId" character varying, "timezone" character varying NOT NULL DEFAULT 'Africa/Kampala', "startsAt" TIMESTAMP NOT NULL, "endsAt" TIMESTAMP NOT NULL, "status" character varying NOT NULL DEFAULT 'SCHEDULED', "recurrence" text, "breaks" text, "checkedInAt" TIMESTAMP, "checkedOutAt" TIMESTAMP, CONSTRAINT "PK_4ed16d3cf5873a6a08731a80b4e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9795df33b0067a83f563c1f590" ON "agent_shift_plans" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cfb8bb217e7aadfa24f4d02905" ON "agent_shift_plans" ("userId") `,
    );
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_driver_profiles_location_geography"
            ON "driver_profiles" USING GIST (
              (ST_SetSRID(
                ST_MakePoint(
                  CAST("lastLongitude" AS double precision),
                  CAST("lastLatitude" AS double precision)
                ),
                4326
              )::geography)
            )
            WHERE "lastLatitude" IS NOT NULL AND "lastLongitude" IS NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_cfb8bb217e7aadfa24f4d02905"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9795df33b0067a83f563c1f590"`);
    await queryRunner.query(`DROP TABLE "agent_shift_plans"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_71a587bc27b341a82b9778dd9a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c5394967367386d3460d81fdb5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c2baab6fe77a0ba8eb605dbeca"`);
    await queryRunner.query(`DROP TABLE "agent_training_progress"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_312e8fb08a6031e1f524e1bb34"`);
    await queryRunner.query(`DROP TABLE "agent_training_modules"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a4da39d1a682a609787d2cc4e5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e4dfe702945459a7a5e5eb72e9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_098a481b7d55d18db219da3dbe"`);
    await queryRunner.query(`DROP TABLE "agent_qa_reviews"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5b924b961959406853c541ca57"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1b79e0cc68005762246cc0dffc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7ba38dfbe000a5084e854ff9d8"`);
    await queryRunner.query(`DROP TABLE "agent_drafts"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d4a8c1329ffcda2fd53bae04ad"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_da67a4f6385d8c28737baea86e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e9ff12c0c77b3ffa298c3802bd"`);
    await queryRunner.query(`DROP TABLE "agent_tasks"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4b90555035f01c724580fd6d0d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ce1d5415df09a496fb8761eec5"`);
    await queryRunner.query(`DROP TABLE "agent_role_definitions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4660f6736b80348a053f33fb7e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7c0fed3218103d68bc6f4de230"`);
    await queryRunner.query(`DROP TABLE "agent_teams"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a6f17ba3e0a3f701f7384c2ea0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d0cfe16fb1dea70f7cfd951353"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b9505c8a7fd32a5c4a27770e0c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_07ea9097f24a1d0bcda5901196"`);
    await queryRunner.query(`DROP TABLE "fleet_member_invitations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6504773477a641220a50925c98"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2c9b616351b658713c17a8d1f5"`);
    await queryRunner.query(`DROP TABLE "fleet_role_definitions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3de163735931576460b08e26b4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_58f72ce8ae1bf6c0ad4b4ffe1a"`);
    await queryRunner.query(`DROP TABLE "fleet_portal_configurations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c0cbc97e489415a55a07dc7335"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f634ae6d9082306bd04c13ac0f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0e01a7f5d07b39953f1f1bf380"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dc642ef28c31533d26261804f5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a15f5053217c0410eed991660b"`);
    await queryRunner.query(`DROP TABLE "fleet_portal_resources"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0e54f3d540fe0d6353ab14b8a8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cec6234e7d70e86c290385fd7b"`);
    await queryRunner.query(`DROP TABLE "fleet_branches"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_facd048e7f85f1f0452834d3e4"`);
    await queryRunner.query(`DROP TABLE "safety_event_logs"`);
    await queryRunner.query(`DROP TYPE "public"."safety_event_logs_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_service_reviews_unique_reviewer"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_099e09ad89a88a046abf61d104"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1ee2ba9aed0d1eb75c1f080ec5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4b79de74e1d6c9a175b6edc6e8"`);
    await queryRunner.query(`DROP TABLE "service_reviews"`);
    await queryRunner.query(`DROP TYPE "public"."service_reviews_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9c1ad0ff8dd8e3b31ef9d0dd97"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_85adc26319b0ac5fd171e3c1f0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_34335f364b55eece9124001f01"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_01dd774245104be19154d8bf9b"`);
    await queryRunner.query(`DROP TABLE "driver_training_certificates"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_driver_training_assessment_attempt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c9ac8a2f4de11bf33ef0904608"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1968e5fcf1812be11b16f23554"`);
    await queryRunner.query(`DROP TABLE "driver_training_assessments"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a0d0e2870e95d01355f0f17368"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9b0de846ecb2be1e672b1ee0ba"`);
    await queryRunner.query(`DROP TABLE "custom_rental_requests"`);
    await queryRunner.query(`DROP TYPE "public"."custom_rental_requests_paymentmethod_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e869ca761fe278cc3b247fbe95"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c016d3675aa4b476a30978b7af"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_09adc8f3f1b338086444c91d2e"`);
    await queryRunner.query(`DROP TABLE "rental_vehicle_classes"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_35f42892709394b977bbac026d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c3969fdaa51aecf4165d76f4af"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_61a619568e79801b2574335cf9"`);
    await queryRunner.query(`DROP TABLE "rental_branches"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_places_user_last_used"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ca30ed31a1f50bda1d702bb316"`);
    await queryRunner.query(`DROP TABLE "user_places"`);
    await queryRunner.query(`DROP TYPE "public"."user_places_lastservicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_056262855090ccdf2c5e339893"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_289043364228ba31cbb5f05ea5"`);
    await queryRunner.query(`DROP TABLE "trip_pause_requests"`);
    await queryRunner.query(`DROP TYPE "public"."trip_pause_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."trip_pause_requests_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4d8ffbdd0b417c2702c8eefe10"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_da3a58884a32ce575d05edd008"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c46430cec20e0c712fd8a0aebe"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a64f6a7a957405a3961e34f24c"`);
    await queryRunner.query(`DROP TABLE "earnings_ledger"`);
    await queryRunner.query(`DROP TYPE "public"."earnings_ledger_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c5434f6dfb7b6f304a450d9304"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e205af1ad4c98873d1c624a8bb"`);
    await queryRunner.query(`DROP TABLE "ledger_entries"`);
    await queryRunner.query(`DROP TYPE "public"."ledger_entries_direction_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8fec680c2dd084db5a1f0421a6"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_65191f5abbbe15d0021c2c4ede"`);
    await queryRunner.query(`DROP TABLE "journal_transactions"`);
    await queryRunner.query(`DROP TYPE "public"."journal_transactions_servicetype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."journal_transactions_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_01aa4f7738e65ff6d5cd7726f4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_38110ab19259ee2e6cf0adc82c"`);
    await queryRunner.query(`DROP TABLE "ledger_accounts"`);
    await queryRunner.query(`DROP TYPE "public"."ledger_accounts_accounttype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b949a7a0eefa241bee9f5f9260"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5e6fbcba82291e0134140b772d"`);
    await queryRunner.query(`DROP TABLE "delivery_routes"`);
    await queryRunner.query(`DROP TYPE "public"."delivery_routes_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_job_offers_job_driver"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_24b65fbf46659c9f12326c43b0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_35d7bc8162419be0e7d3365cf7"`);
    await queryRunner.query(`DROP TABLE "job_offers"`);
    await queryRunner.query(`DROP TYPE "public"."job_offers_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_matching_jobs_service"`);
    await queryRunner.query(`DROP TABLE "matching_jobs"`);
    await queryRunner.query(`DROP TYPE "public"."matching_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."matching_jobs_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8d3c63bd828f5336592f152ab4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e4cfc7930add724b2998f71adc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_94fc3fd8b7c8112892c3994544"`);
    await queryRunner.query(`DROP TABLE "domain_events"`);
    await queryRunner.query(`DROP TYPE "public"."domain_events_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1cd1fea0e247d2ac97ea96112c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_68cd1ddd15be2d9fbec20b11be"`);
    await queryRunner.query(`DROP TABLE "push_deliveries"`);
    await queryRunner.query(`DROP TYPE "public"."push_deliveries_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_977e24c520c49436d08e5eeea8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_511957e3e8443429dc3fb00120"`);
    await queryRunner.query(`DROP TABLE "device_tokens"`);
    await queryRunner.query(`DROP TYPE "public"."device_tokens_platform_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1143abb8c3fad8b06dd857a8c9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d6a19d4b4f6c62dcd29daa497e"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a45ebab903be4056e60d67c4d9"`);
    await queryRunner.query(`DROP TABLE "onboarding_checklist_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_570fb008bcb0eacfb0798c52a2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_855e3a8bf4bb675c7846cb4cb0"`);
    await queryRunner.query(`DROP TABLE "onboarding_applications"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9b9bb7f85035305c3dee924d22"`);
    await queryRunner.query(`DROP TABLE "emergency_contacts"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7dc8609606e081e1ae0f0d43b4"`);
    await queryRunner.query(`DROP TABLE "user_documents"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2693552c1c196903c3c13f4bb4"`);
    await queryRunner.query(`DROP TABLE "rider_commutes"`);
    await queryRunner.query(`DROP TYPE "public"."rider_commutes_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_521cebd84c7af27b6004f1338b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b50a70fcea9f9eaa2a4422c3c4"`);
    await queryRunner.query(`DROP TABLE "operational_alerts"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ce101b65cfcce19c60f40bdc54"`);
    await queryRunner.query(`DROP TABLE "service_configurations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_80fd8de7d7efb53039f5d14f95"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_338ab77eb119f971f877115c17"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3251ba10f6ab6ef8ff68a3d45d"`);
    await queryRunner.query(`DROP TABLE "risk_cases"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cb151f383e28474a8d520fe8a9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7493327936d396a0ea8b5d705e"`);
    await queryRunner.query(`DROP TABLE "approval_requests"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_36d0344370584b4d6a953c53a6"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b578b4b5ebdaea56f7731bfb08"`);
    await queryRunner.query(`DROP TABLE "feature_flags"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b789d942eca8cabb120d46c526"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e3919f16eecffab51e59625960"`);
    await queryRunner.query(`DROP TABLE "cashout_requests"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2b1cb80ee5dd27281022031b43"`);
    await queryRunner.query(`DROP TABLE "stored_payment_methods"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_99a3858bc674d44f80ff0c3603"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1d4337189e9e8ad8a71ee39017"`);
    await queryRunner.query(`DROP TABLE "idempotency_records"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5d9031e30fac3ec3ec8b9602e1"`);
    await queryRunner.query(`DROP TABLE "platform_settings"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cb672551a81ccfcdc287eb05e9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8e522f8759b97b8673e2f606a7"`);
    await queryRunner.query(`DROP TABLE "integration_outbox"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e6149a02fe98f25c9734375396"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b440bd3057cd90cf130ad2cfb2"`);
    await queryRunner.query(`DROP TABLE "corporate_pay_fulfillment_disputes"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_fulfillment_disputes_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f8b52ccc08e5b8a1221faf071b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0f1a062866397a9914dd29fff8"`);
    await queryRunner.query(`DROP TABLE "corporate_pay_fulfillment_evidence"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_fulfillment_evidence_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0761a15ef3a97c24177596ffce"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a7d36c082108249b6e277c53dd"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6ba5232b5d3be8e321fcb9508a"`);
    await queryRunner.query(`DROP TABLE "corporate_pay_authorizations"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_authorizations_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_df78a1504c2bd7fd6417491cfe"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2e8656875697eddfefc00c3900"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_56615c16612d1cc4f1dca21eaa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_76b5cf8fa2d0a3b1c0ee8f4296"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e75097e993b1a2a0f934625178"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_376384a098017d518b93ace758"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_90f422d8209bbd9da66ecd314d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2339d292c35eb03c09894a8e71"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8a1039b1b3c1c1878f259871c3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ce89bacc5c1cb07270915ddb5e"`);
    await queryRunner.query(`DROP TABLE "corporate_pay_partner_requests"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_partner_requests_authorizationstatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_partner_requests_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_partner_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_partner_requests_servicetype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_partner_requests_requestkind_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8db2ac8c3144d34a3c1b78dfd5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_05c50e8013dbe6a41f3140fd16"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bcfa125543f03dae33b9929747"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c4acc34b13c0dd196d5c2fefba"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d8df3da538b1929ed4acb8c48a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dea112c1ebabad315af78bdef5"`);
    await queryRunner.query(`DROP TABLE "corporate_pay_subject_links"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8086462ebad5d6797134381c41"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fa54f4b40cfa34325c10185464"`);
    await queryRunner.query(`DROP TABLE "corporate_pay_reconciliations"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_reconciliations_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_53b324b7ad6cf31fcb9341b0e5"`);
    await queryRunner.query(`DROP TABLE "corporate_pay_webhook_events"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_webhook_events_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_91409680bbf941a180187ab6b2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6413d9caefcedde6760aa4d775"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a32f6530bdc8ab95e0687defa5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_af5b4727a1a0fd9890760c83c8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_89b5c121f901059d39af2a5118"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b507566592791d404315ec1035"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_41a48baa14f62c6495b51e803d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c2c2ce45cd9f6839cdd5edd802"`);
    await queryRunner.query(`DROP TABLE "corporate_pay_transactions"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."corporate_pay_transactions_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bdcce3efa2c011faf7dee47d71"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8f48a4469b491239d7781893c4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cbce45dee62a18679867e4f1bd"`);
    await queryRunner.query(`DROP TABLE "corporate_pay_accounts"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_219598fafb7db8f98fc8a94f19"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2984580ff16739f69373d0a29c"`);
    await queryRunner.query(`DROP TABLE "dispatch_shifts"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9273e7d4fa6d8d90ee45e41500"`);
    await queryRunner.query(`DROP TABLE "dispatch_events"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b4aad991374202f77f788a2517"`);
    await queryRunner.query(`DROP TABLE "dispatch_assignments"`);
    await queryRunner.query(`DROP TYPE "public"."dispatch_assignments_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."dispatch_assignments_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_83e68061d2fe8d9af5519d8e2a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3e4032aea1be0fdaacb47a1530"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e3f5fdea55cb5ee3efd7890537"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b898e35209c519763f43a41783"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0205de769e9a9229dce6641a56"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_96433549c5071d8f3a0457ae14"`);
    await queryRunner.query(`DROP TABLE "manual_bookings"`);
    await queryRunner.query(`DROP TYPE "public"."manual_bookings_paymentmethod_enum"`);
    await queryRunner.query(`DROP TYPE "public"."manual_bookings_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."manual_bookings_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."manual_bookings_servicetype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."manual_bookings_source_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7dcb9887b55f2371bf29075b4d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e1824e9a9b98fe977037371b4b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_df974ea5b39f01a5781e485a70"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b33e9dd5843a6c76a1123463bc"`);
    await queryRunner.query(`DROP TABLE "agent_profiles"`);
    await queryRunner.query(`DROP TYPE "public"."agent_profiles_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8fe1f90e73e60c734929c9fc53"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_105405a0e0ae15147e75e7c50d"`);
    await queryRunner.query(`DROP TABLE "dispatch_desks"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c7a36da07edb142530048c808d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0138acff0966cbf4d3f75ee60e"`);
    await queryRunner.query(`DROP TABLE "school_sync_jobs"`);
    await queryRunner.query(`DROP TYPE "public"."school_sync_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."school_sync_jobs_direction_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8a722a569ae90962bd9741fc75"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6405a53aa238722fb68259ff4b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_996fa70b4c0a5850856cfabf33"`);
    await queryRunner.query(`DROP TABLE "school_fleet_resources"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2ec8ade16d9955ff4a05444a27"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cb5151a52787c517599d067967"`);
    await queryRunner.query(`DROP TABLE "school_fleet_connections"`);
    await queryRunner.query(`DROP TYPE "public"."school_fleet_connections_syncdirection_enum"`);
    await queryRunner.query(`DROP TYPE "public"."school_fleet_connections_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_666eeb9e6c47653e5a4298df3a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3c74d8351b2bd7665ff9270298"`);
    await queryRunner.query(`DROP TABLE "fleet_maintenance_records"`);
    await queryRunner.query(`DROP TYPE "public"."fleet_maintenance_records_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_94ad97b5826c2b41dfbf6f2b73"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7dd5435d097e9e906853f887df"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_12c39b756d297b4c0d9ded7f4d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1201c917eaa1ed264cf702d4df"`);
    await queryRunner.query(`DROP TABLE "fleet_assignments"`);
    await queryRunner.query(`DROP TYPE "public"."fleet_assignments_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."fleet_assignments_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d811536269f088b7c3b97a8d52"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_03c11ec75578d704ab58e608fa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c767cdd6974ac0ed78afa03479"`);
    await queryRunner.query(`DROP TABLE "fleet_drivers"`);
    await queryRunner.query(`DROP TYPE "public"."fleet_drivers_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e50333358c7395162ccb891aec"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d77160c9158c361b7c1abf31d8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_69c8b59d543d216c166937dfa0"`);
    await queryRunner.query(`DROP TABLE "fleet_vehicles"`);
    await queryRunner.query(`DROP TYPE "public"."fleet_vehicles_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3f766b2696edc21c776339dc7d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1af86359447654045eeb0932ab"`);
    await queryRunner.query(`DROP TABLE "fleet_profiles"`);
    await queryRunner.query(`DROP TYPE "public"."fleet_profiles_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7c48546e8026fb043d9ad0c2c8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e826222ad017663c6db1a45a4f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5652c2c6b066835b6c500d0d83"`);
    await queryRunner.query(`DROP TABLE "organization_members"`);
    await queryRunner.query(`DROP TYPE "public"."organization_members_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."organization_members_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ba2ed407e5dbf74422250d5de5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_643b456fecc65e1ccfa0909297"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7e27c3b62c681fbe3e2322535f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9b7ca6d30b94fef571cff87688"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(`DROP TYPE "public"."organizations_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."organizations_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8679e2ff150ff0e253189ca025"`);
    await queryRunner.query(`DROP TABLE "support_tickets"`);
    await queryRunner.query(`DROP TYPE "public"."support_tickets_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."support_tickets_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."support_tickets_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2bb5945e8aaa210da1ca122a79"`);
    await queryRunner.query(`DROP TABLE "map_reports"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6c1ebf5aa1c3abebe0fca87773"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a969d9fff5e94c9757b8a1131a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_63bc3f15a8f57e5bbefcb3eff6"`);
    await queryRunner.query(`DROP TABLE "trip_shares"`);
    await queryRunner.query(`DROP TYPE "public"."trip_shares_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c94c6f80eb0b046ee3bce8a371"`);
    await queryRunner.query(`DROP TABLE "emergency_incidents"`);
    await queryRunner.query(`DROP TYPE "public"."emergency_incidents_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."emergency_incidents_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."emergency_incidents_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_279b22f49e10e3fae432d3ce8b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b2ac4c23281c85c64f16ff0548"`);
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fb6add83b1a7acc94433d38569"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d15f71a9ecd07f8d8c035a1dcb"`);
    await queryRunner.query(`DROP TABLE "chat_participants"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a7e37b101a3936b33b1c1330a7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7418472a40a3afb014df06f7c0"`);
    await queryRunner.query(`DROP TABLE "chat_threads"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dbba3d2d367501bf3d55727f36"`);
    await queryRunner.query(`DROP TABLE "rental_blocks"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7a33f539dce243d11c0f24ba1b"`);
    await queryRunner.query(`DROP TABLE "rental_inspections"`);
    await queryRunner.query(`DROP TYPE "public"."rental_inspections_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0cc8264ee14786290566a3eb57"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0d7b5df5a95c283928e68cacd4"`);
    await queryRunner.query(`DROP TABLE "rental_bookings"`);
    await queryRunner.query(`DROP TYPE "public"."rental_bookings_paymentstatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rental_bookings_paymentmethod_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rental_bookings_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_902a73d943b18974d5451a53e8"`);
    await queryRunner.query(`DROP TABLE "ambulance_events"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ae2a97e44b748044fe8f042c4d"`);
    await queryRunner.query(`DROP TABLE "ambulance_requests"`);
    await queryRunner.query(`DROP TYPE "public"."ambulance_requests_paymentstatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ambulance_requests_paymentmethod_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ambulance_requests_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ambulance_requests_status_enum"`);
    await queryRunner.query(`DROP TABLE "medical_facilities"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_af624356799ce1949dcc17606f"`);
    await queryRunner.query(`DROP TABLE "tourist_bookings"`);
    await queryRunner.query(`DROP TYPE "public"."tourist_bookings_paymentstatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tourist_bookings_paymentmethod_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tourist_bookings_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e45e7d8b3bb494d8ffdd88af99"`);
    await queryRunner.query(`DROP TABLE "tour_packages"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_39f42c75c92d356adbecc08a06"`);
    await queryRunner.query(`DROP TABLE "delivery_feedback"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5f3393fce4bb023677b7a80198"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c55e0af602b8196da30dc48002"`);
    await queryRunner.query(`DROP TABLE "tracking_invitations"`);
    await queryRunner.query(`DROP TYPE "public"."tracking_invitations_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bd78a39f8fa746ca77c5f85b62"`);
    await queryRunner.query(`DROP TABLE "delivery_events"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e174f903fc0c9f9b636241ffba"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6485d4b5b09adb9124f5dbe616"`);
    await queryRunner.query(`DROP TABLE "delivery_stops"`);
    await queryRunner.query(`DROP TYPE "public"."delivery_stops_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."delivery_stops_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b00c94a1b797110ea9023776c0"`);
    await queryRunner.query(`DROP TABLE "delivery_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ccf9d6b99f7b09ea2be12b0def"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5f0bea95c44ef332c49ded597b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7b8e15adca01a0ff7438743e93"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bb142a45206c02f3c0dceff300"`);
    await queryRunner.query(`DROP TABLE "delivery_orders"`);
    await queryRunner.query(`DROP TYPE "public"."delivery_orders_paymentstatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."delivery_orders_paymentmethod_enum"`);
    await queryRunner.query(`DROP TYPE "public"."delivery_orders_packagesize_enum"`);
    await queryRunner.query(`DROP TYPE "public"."delivery_orders_servicetype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."delivery_orders_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c11092ccde98234a27932113ea"`);
    await queryRunner.query(`DROP TABLE "ride_feedback"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8195bc746e2260f00202f5ee15"`);
    await queryRunner.query(`DROP TABLE "ride_events"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_69b4817b8decc25eae033a9962"`);
    await queryRunner.query(`DROP TABLE "ride_passengers"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_59e126ca76a45cf7bdd74b817a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e47debd3d44368f977ae7b6b81"`);
    await queryRunner.query(`DROP TABLE "ride_offers"`);
    await queryRunner.query(`DROP TYPE "public"."ride_offers_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_778341a31037fc7346624e524b"`);
    await queryRunner.query(`DROP TABLE "ride_stops"`);
    await queryRunner.query(`DROP TYPE "public"."ride_stops_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ride_stops_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0adda088d567495e71d21b6c69"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3c581fc8082dc803233ec676ef"`);
    await queryRunner.query(`DROP TABLE "rides"`);
    await queryRunner.query(`DROP TYPE "public"."rides_paymentstatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rides_paymentmethod_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rides_triptype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rides_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rides_mode_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rides_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_124c14495d8a41b06d83cc7c0c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_432bd34c495ea23e5c182eb0e4"`);
    await queryRunner.query(`DROP TABLE "payouts"`);
    await queryRunner.query(`DROP TYPE "public"."payouts_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_866ddee0e17d9385b4e3b86851"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7600aa630b6bf8732e8b91cebd"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1a507bb969c340d026fe11ac26"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d35cb3c13a18e1ea1705b2817b"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payments_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_wallet_tx_wallet_ref_direction"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4b3d5cb7b4480ca1c3c367ebb4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8a94d9d61a2b05123710b325fb"`);
    await queryRunner.query(`DROP TABLE "wallet_transactions"`);
    await queryRunner.query(`DROP TYPE "public"."wallet_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."wallet_transactions_direction_enum"`);
    await queryRunner.query(`DROP TYPE "public"."wallet_transactions_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2ecdb33f23e9a6fc392025c0b9"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d6ba170d54388257f185c84c7b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9dd3db646d996a8f638d90c658"`);
    await queryRunner.query(`DROP TABLE "promo_redemptions"`);
    await queryRunner.query(`DROP TYPE "public"."promo_redemptions_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2f096c406a9d9d5b8ce204190c"`);
    await queryRunner.query(`DROP TABLE "promo_codes"`);
    await queryRunner.query(`DROP TYPE "public"."promo_codes_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ef756b2e5400a70d822c12fdd2"`);
    await queryRunner.query(`DROP TABLE "surge_zones"`);
    await queryRunner.query(`DROP TYPE "public"."surge_zones_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_80d111aeacbb85cb29ffa629d6"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6d22f69730dda970167ca26546"`);
    await queryRunner.query(`DROP TABLE "pricing_rules"`);
    await queryRunner.query(`DROP TYPE "public"."pricing_rules_vehicletype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."pricing_rules_servicetype_enum"`);
    await queryRunner.query(`DROP TABLE "service_zones"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_47a904845ef60fd37cb324152c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d6b63745743bd512eaeaeb562a"`);
    await queryRunner.query(`DROP TABLE "training_progress"`);
    await queryRunner.query(`DROP TYPE "public"."training_progress_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_48ae68089b0861e4dc9f8fc4ae"`);
    await queryRunner.query(`DROP TABLE "training_modules"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ca73786f8cd0ecae41ae874ed0"`);
    await queryRunner.query(`DROP TABLE "driver_earning_goals"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ba8c704c51d05a857f00cd77f8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_62df81b116734099734d24a992"`);
    await queryRunner.query(`DROP TABLE "driver_locations"`);
    await queryRunner.query(`DROP TYPE "public"."driver_locations_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e98e0c9f007c60f7b2f1e8b6aa"`);
    await queryRunner.query(`DROP TABLE "driver_sessions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c9f5b9255565a956e5c0854320"`);
    await queryRunner.query(`DROP TABLE "vehicle_accessories"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_61c94219ae61c3752cf1e6582c"`);
    await queryRunner.query(`DROP TABLE "vehicle_documents"`);
    await queryRunner.query(`DROP TYPE "public"."vehicle_documents_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vehicle_documents_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_66ea96381a7a7ceb35c72f3662"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b8c98be05991478da0ec45bcdc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dbc1e0e10ed20a933d016d9313"`);
    await queryRunner.query(`DROP TABLE "vehicles"`);
    await queryRunner.query(`DROP TYPE "public"."vehicles_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vehicles_energytype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vehicles_vehicletype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_232e27e6a685f0b3b1406ece6c"`);
    await queryRunner.query(`DROP TABLE "driver_social_links"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_22eb4a151d293e1bdff7a4dcc5"`);
    await queryRunner.query(`DROP TABLE "driver_documents"`);
    await queryRunner.query(`DROP TYPE "public"."driver_documents_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."driver_documents_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c22d0ffc4bff60e9a39c003759"`);
    await queryRunner.query(`DROP TABLE "driver_profiles"`);
    await queryRunner.query(`DROP TYPE "public"."driver_profiles_availabilitystatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."driver_profiles_verificationstatus_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f23279fad63453147a8efb46cf"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e36d23e1e7cf81ea77758bef79"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8f1bbb232ce49e354e24a8e4fe"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6c311bca3715680ae133ebf5ab"`);
    await queryRunner.query(`DROP TABLE "file_assets"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_692a909ee0fa9383e7859f9b40"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b6202d1cacc63a0b9c8dac2abd"`);
    await queryRunner.query(`DROP TABLE "user_preferences"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_977c2b74b67a216b62ff881e2d"`);
    await queryRunner.query(`DROP TABLE "saved_contacts"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_781afdedafe920f331f6229cb6"`);
    await queryRunner.query(`DROP TABLE "user_addresses"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9d38771dd102800f389f4c73ae"`);
    await queryRunner.query(`DROP TABLE "otp_codes"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c25bc63d248ca90e8dcc1d92d0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_610102b60fea1455310ccd299d"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_80e795b8fa4371cfb1901dc837"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a000cca60bcf04454e72769949"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_exclusion_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_830a86ad398b808940f758bff3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e4f071c2b4e694b5dc4d9f61cf"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_exclusions"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_exclusions_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5d648fa1d6293019ebff6cd8d6"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_cancellations"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_cancellations_actorparty_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_outbox_status_available"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0f007af5567084a473492d9d66"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4b343c8485a29aa713e373ce7b"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_outbox"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_outbox_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_idempotency_unique"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_idempotency"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_trace_request"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_51af42b9be287b2088b4fce673"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_decision_traces"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_decision_traces_outcome_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_policy_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0c375b91bf1fd556c826e62c8b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_921b95883c1e6aa44ee978f075"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_da856fec8def51c23f15d9b865"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_policies"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_policies_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_policies_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_trip_stop_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_473f4dceb52346c9531ebeceac"`);
    await queryRunner.query(`DROP TABLE "universal_trip_stops"`);
    await queryRunner.query(`DROP TYPE "public"."universal_trip_stops_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."universal_trip_stops_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_trip_booking_request_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d02b60197af32bb8d4bcf2190b"`);
    await queryRunner.query(`DROP TABLE "universal_trip_bookings"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_197fae28857a1f1f5f7818ea0d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_728c0168cd09fe551c9263d2a9"`);
    await queryRunner.query(`DROP TABLE "universal_trip_sessions"`);
    await queryRunner.query(`DROP TYPE "public"."universal_trip_sessions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."universal_trip_sessions_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_assignment_request_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e96a532c75f65e47f0c929006b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d936b6396ef6f906db7cbe3a1e"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_assignments"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_assignments_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_offer_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_offer_pending_expiry"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d5d83fb688e0eb79f32ef48d02"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_629211eef8c3d83ed7b551c82b"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_offers"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_offers_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_request_requirement_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c9a5e0c27d7fa96df292d526e3"`);
    await queryRunner.query(`DROP TABLE "universal_request_requirements"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_request_stop_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_39940535991e9f20626fe76a10"`);
    await queryRunner.query(`DROP TABLE "universal_request_stops"`);
    await queryRunner.query(`DROP TYPE "public"."universal_request_stops_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."universal_request_stops_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_request_client_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_request_search"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_65f9bbb897a893ccf289b056a2"`);
    await queryRunner.query(`DROP TABLE "universal_service_requests"`);
    await queryRunner.query(`DROP TYPE "public"."universal_service_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."universal_service_requests_scheduletype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."universal_service_requests_servicetype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."universal_service_requests_servicefamily_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_location_unit_recorded"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_244af4f35397b3c1c77276569f"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_locations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_dispatch_unit_driver"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_dispatch_unit_market_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b016bcec5f2fc0be365e0da3f8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9ed687b08b9d2706a205d8f494"`);
    await queryRunner.query(`DROP TABLE "universal_dispatch_units"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_units_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."universal_dispatch_units_ownertype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5b6f68461cccad989eb3de1bff"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4703f66fd54d0b5a323108665c"`);
    await queryRunner.query(`DROP TABLE "dispatch_driver_schedules"`);
    await queryRunner.query(`DROP TYPE "public"."dispatch_driver_schedules_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5dc024c4f4d4674c261ea6f860"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7985d2ccbaee675cdca6814b35"`);
    await queryRunner.query(`DROP TABLE "dispatch_driver_shifts"`);
    await queryRunner.query(`DROP TYPE "public"."dispatch_driver_shifts_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_driver_vehicle_assignment_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e59ea1cecff17da39bdaf0bad2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_052772789f142dc969ab21da14"`);
    await queryRunner.query(`DROP TABLE "dispatch_driver_vehicle_assignments"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_fleet_rule_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_362b6899d43b2a9a6dc617adcb"`);
    await queryRunner.query(`DROP TABLE "dispatch_fleet_rules"`);
    await queryRunner.query(`DROP TYPE "public"."dispatch_fleet_rules_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_vehicle_capability_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7a9d08fbf00bee5a5d263920e7"`);
    await queryRunner.query(`DROP TABLE "dispatch_vehicle_capabilities"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_driver_entitlement_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c05d7ac629c5f0db93378cbd65"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dd155d6e01e083aa99e8b0982f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8ccd06d165b4d6c01edcc96ea3"`);
    await queryRunner.query(`DROP TABLE "dispatch_driver_entitlements"`);
    await queryRunner.query(`DROP TYPE "public"."dispatch_driver_entitlements_servicetype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ud_driver_certification_unique"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f1174103cde28c69f924079744"`);
    await queryRunner.query(`DROP TABLE "dispatch_driver_certifications"`);
    await queryRunner.query(`DROP TYPE "public"."dispatch_driver_certifications_status_enum"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "postgis"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "pgcrypto"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
