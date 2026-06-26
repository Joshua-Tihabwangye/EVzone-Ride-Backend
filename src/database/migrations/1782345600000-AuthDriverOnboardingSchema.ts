import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthDriverOnboardingSchema1782345600000 implements MigrationInterface {
  name = 'AuthDriverOnboardingSchema1782345600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "email" varchar,
        "phone" varchar,
        "passwordHash" varchar NOT NULL,
        "firstName" varchar NOT NULL,
        "lastName" varchar NOT NULL,
        "role" varchar NOT NULL DEFAULT 'CUSTOMER',
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "avatarUrl" varchar,
        "locale" varchar NOT NULL DEFAULT 'en',
        "currency" varchar NOT NULL DEFAULT 'UGX',
        "countryCode" varchar NOT NULL DEFAULT 'UG',
        "isEmailVerified" boolean NOT NULL DEFAULT false,
        "isPhoneVerified" boolean NOT NULL DEFAULT false,
        "externalSubject" varchar,
        "identityProvider" varchar,
        "metadata" text,
        "lastLoginAt" timestamptz
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email") WHERE "email" IS NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_phone" ON "users" ("phone") WHERE "phone" IS NOT NULL');
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_external_subject" ON "users" ("externalSubject") WHERE "externalSubject" IS NOT NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "userId" uuid NOT NULL,
        "currency" varchar NOT NULL DEFAULT 'UGX',
        "availableBalance" numeric(16,2) NOT NULL DEFAULT 0,
        "pendingBalance" numeric(16,2) NOT NULL DEFAULT 0,
        "lockedBalance" numeric(16,2) NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wallets_user_currency" ON "wallets" ("userId", "currency")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "userId" uuid NOT NULL,
        "tokenHash" varchar NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "userAgent" varchar,
        "ipAddress" varchar
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_user" ON "refresh_tokens" ("userId")');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refresh_tokens_hash" ON "refresh_tokens" ("tokenHash")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "otp_codes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "destination" varchar NOT NULL,
        "channel" varchar NOT NULL,
        "purpose" varchar NOT NULL,
        "codeHash" varchar NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "attempts" integer NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_otp_codes_destination" ON "otp_codes" ("destination")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "userId" uuid NOT NULL,
        "tokenHash" varchar NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "requestedFromIp" varchar
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_password_reset_tokens_user" ON "password_reset_tokens" ("userId")');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_password_reset_tokens_hash" ON "password_reset_tokens" ("tokenHash")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_profiles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "userId" uuid NOT NULL,
        "verificationStatus" varchar NOT NULL DEFAULT 'NOT_STARTED',
        "availabilityStatus" varchar NOT NULL DEFAULT 'OFFLINE',
        "level" varchar NOT NULL DEFAULT 'BEGINNER',
        "rating" numeric(3,2) NOT NULL DEFAULT 5,
        "ratingsCount" integer NOT NULL DEFAULT 0,
        "completedRides" integer NOT NULL DEFAULT 0,
        "completedDeliveries" integer NOT NULL DEFAULT 0,
        "experienceYears" numeric(5,2) NOT NULL DEFAULT 0,
        "currentVehicleId" uuid,
        "serviceCapabilities" text,
        "lastLatitude" numeric(10,7),
        "lastLongitude" numeric(10,7),
        "lastLocationAt" timestamptz,
        "surgeEnabled" boolean NOT NULL DEFAULT true,
        "rideSharingEnabled" boolean NOT NULL DEFAULT true,
        "drivingMinutesToday" integer NOT NULL DEFAULT 0,
        "mandatoryRestMinutesRemaining" integer NOT NULL DEFAULT 0,
        "preferences" text
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_driver_profiles_user" ON "driver_profiles" ("userId")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "driverId" uuid NOT NULL,
        "type" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'IN_REVIEW',
        "fileUrl" varchar NOT NULL,
        "issueDate" timestamptz,
        "expiryDate" timestamptz,
        "rejectionReason" varchar,
        "reviewedByUserId" uuid,
        "reviewedAt" timestamptz,
        "metadata" text
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_driver_documents_driver" ON "driver_documents" ("driverId")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "ownerUserId" uuid NOT NULL,
        "assignedDriverId" uuid,
        "make" varchar NOT NULL,
        "model" varchar NOT NULL,
        "year" integer NOT NULL,
        "plateNumber" varchar NOT NULL,
        "vehicleType" varchar NOT NULL,
        "energyType" varchar NOT NULL DEFAULT 'ELECTRIC',
        "status" varchar NOT NULL DEFAULT 'PENDING_VERIFICATION',
        "seats" integer NOT NULL DEFAULT 4,
        "cargoCapacityKg" numeric(10,2) NOT NULL DEFAULT 0,
        "color" varchar,
        "imageUrl" varchar,
        "serviceCapabilities" text,
        "features" text,
        "isActive" boolean NOT NULL DEFAULT false,
        "dailyRentalRate" numeric(14,2),
        "includedDailyKm" numeric(10,2),
        "extraKmRate" numeric(14,2)
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_vehicles_owner" ON "vehicles" ("ownerUserId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_vehicles_driver" ON "vehicles" ("assignedDriverId")');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vehicles_plate" ON "vehicles" ("plateNumber")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicle_documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "vehicleId" uuid NOT NULL,
        "type" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'IN_REVIEW',
        "fileUrl" varchar NOT NULL,
        "issueDate" timestamptz,
        "expiryDate" timestamptz,
        "rejectionReason" varchar
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_vehicle_documents_vehicle" ON "vehicle_documents" ("vehicleId")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "emergency_contacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "userId" uuid NOT NULL,
        "name" varchar NOT NULL,
        "phone" varchar NOT NULL,
        "relationship" varchar,
        "isPrimary" boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_emergency_contacts_user" ON "emergency_contacts" ("userId")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "onboarding_applications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "userId" uuid NOT NULL,
        "applicationType" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'DRAFT',
        "completionPercent" integer NOT NULL DEFAULT 0,
        "profileData" text,
        "submittedAt" timestamptz,
        "reviewedAt" timestamptz,
        "reviewedByUserId" uuid,
        "reviewNotes" text
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_onboarding_applications_user" ON "onboarding_applications" ("userId")');
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_onboarding_applications_type_status" ON "onboarding_applications" ("applicationType", "status")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "onboarding_checklist_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "applicationId" uuid NOT NULL,
        "key" varchar NOT NULL,
        "label" varchar NOT NULL,
        "required" boolean NOT NULL DEFAULT true,
        "status" varchar NOT NULL DEFAULT 'PENDING',
        "data" text,
        "completedAt" timestamptz
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_onboarding_checklist_application" ON "onboarding_checklist_items" ("applicationId")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_onboarding_checklist_application_key" ON "onboarding_checklist_items" ("applicationId", "key")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "training_progress" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "driverId" uuid NOT NULL,
        "moduleId" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'NOT_STARTED',
        "score" integer NOT NULL DEFAULT 0,
        "answers" text,
        "completedAt" timestamptz
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_training_progress_driver" ON "training_progress" ("driverId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_training_progress_module" ON "training_progress" ("moduleId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    for (const table of [
      'training_progress',
      'onboarding_checklist_items',
      'onboarding_applications',
      'emergency_contacts',
      'vehicle_documents',
      'vehicles',
      'driver_documents',
      'driver_profiles',
      'password_reset_tokens',
      'otp_codes',
      'refresh_tokens',
      'wallets',
      'users',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
