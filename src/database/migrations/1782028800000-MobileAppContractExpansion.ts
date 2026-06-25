import { MigrationInterface, QueryRunner } from 'typeorm';

export class MobileAppContractExpansion1782028800000 implements MigrationInterface {
  name = 'MobileAppContractExpansion1782028800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_places" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "userId" uuid NOT NULL,
        "label" varchar NOT NULL,
        "address" varchar NOT NULL,
        "providerPlaceId" varchar,
        "latitude" numeric(10,7) NOT NULL,
        "longitude" numeric(10,7) NOT NULL,
        "source" varchar NOT NULL DEFAULT 'SEARCH',
        "pinned" boolean NOT NULL DEFAULT false,
        "pinLabel" varchar,
        "useCount" integer NOT NULL DEFAULT 1,
        "lastUsedAt" timestamptz NOT NULL,
        "lastServiceType" varchar,
        "metadata" jsonb
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_user_places_user_last_used" ON "user_places" ("userId", "lastUsedAt")',
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rental_branches" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "operatorUserId" uuid NOT NULL,
        "organizationId" uuid,
        "code" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "address" varchar NOT NULL,
        "latitude" numeric(10,7) NOT NULL,
        "longitude" numeric(10,7) NOT NULL,
        "phone" varchar,
        "timezone" varchar NOT NULL DEFAULT 'Africa/Kampala',
        "openingHours" jsonb,
        "serviceAreas" jsonb,
        "active" boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rental_vehicle_classes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "operatorUserId" uuid,
        "branchId" uuid,
        "code" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "description" text,
        "vehicleTypes" jsonb NOT NULL,
        "minimumSeats" integer NOT NULL DEFAULT 1,
        "maximumPassengers" integer NOT NULL DEFAULT 4,
        "luggageCapacity" integer NOT NULL DEFAULT 0,
        "features" jsonb,
        "pricing" jsonb,
        "imageUrl" varchar,
        "active" boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "custom_rental_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "renterId" uuid NOT NULL,
        "branchId" uuid,
        "requestedVehicleClassId" uuid,
        "status" varchar NOT NULL DEFAULT 'REQUESTED',
        "pickupAt" timestamptz NOT NULL,
        "returnAt" timestamptz NOT NULL,
        "pickupLocation" varchar NOT NULL,
        "returnLocation" varchar NOT NULL,
        "passengerCount" integer NOT NULL DEFAULT 1,
        "luggageCount" integer NOT NULL DEFAULT 0,
        "withDriver" boolean NOT NULL DEFAULT false,
        "requirements" jsonb,
        "budgetAmount" numeric(16,2),
        "currency" varchar NOT NULL DEFAULT 'UGX',
        "paymentMethod" varchar NOT NULL DEFAULT 'CARD',
        "quotedVehicleId" uuid,
        "quoteAmount" numeric(16,2),
        "quoteExpiresAt" timestamptz,
        "quotedByUserId" uuid,
        "quotedAt" timestamptz,
        "acceptedAt" timestamptz,
        "rejectedAt" timestamptz,
        "rejectionReason" varchar,
        "bookingId" uuid
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_training_assessments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "driverId" uuid NOT NULL,
        "moduleId" uuid NOT NULL,
        "attemptNumber" integer NOT NULL DEFAULT 1,
        "answers" jsonb,
        "score" integer NOT NULL DEFAULT 0,
        "passed" boolean NOT NULL DEFAULT false,
        "submittedAt" timestamptz NOT NULL,
        "feedback" jsonb,
        CONSTRAINT "UQ_driver_training_assessment_attempt" UNIQUE ("driverId", "moduleId", "attemptNumber")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_training_certificates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "driverId" uuid NOT NULL,
        "moduleId" uuid,
        "certificateNumber" varchar NOT NULL UNIQUE,
        "title" varchar NOT NULL,
        "issuedAt" timestamptz NOT NULL,
        "expiresAt" timestamptz,
        "verificationCode" varchar NOT NULL UNIQUE,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "serviceType" varchar NOT NULL,
        "serviceId" uuid NOT NULL,
        "reviewerUserId" uuid NOT NULL,
        "revieweeUserId" uuid,
        "reviewerRole" varchar NOT NULL DEFAULT 'CUSTOMER',
        "rating" integer NOT NULL,
        "categoryRatings" jsonb,
        "tags" jsonb,
        "comment" text,
        "status" varchar NOT NULL DEFAULT 'PUBLISHED',
        "visibility" varchar NOT NULL DEFAULT 'PUBLIC',
        "response" text,
        "respondedByUserId" uuid,
        "respondedAt" timestamptz,
        "reportedByUserId" uuid,
        "reportReason" varchar,
        "reportedAt" timestamptz,
        "moderatedByUserId" uuid,
        "moderatedAt" timestamptz,
        "metadata" jsonb,
        CONSTRAINT "UQ_service_review_reviewer" UNIQUE ("serviceType", "serviceId", "reviewerUserId")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    for (const table of [
      'service_reviews',
      'driver_training_certificates',
      'driver_training_assessments',
      'custom_rental_requests',
      'rental_vehicle_classes',
      'rental_branches',
      'user_places',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
