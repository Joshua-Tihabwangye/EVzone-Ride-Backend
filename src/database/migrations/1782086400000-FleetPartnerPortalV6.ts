import { MigrationInterface, QueryRunner } from 'typeorm';

export class FleetPartnerPortalV61782086400000 implements MigrationInterface {
  name = 'FleetPartnerPortalV61782086400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await queryRunner.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "externalSubject" varchar');
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "identityProvider" varchar');
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_external_subject" ON "users" ("externalSubject") WHERE "externalSubject" IS NOT NULL',
    );
    await queryRunner.query('ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "externalId" varchar');
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_organizations_external_id" ON "organizations" ("externalId") WHERE "externalId" IS NOT NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fleet_branches" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "fleetId" uuid NOT NULL,
        "code" varchar NOT NULL,
        "name" varchar NOT NULL,
        "address" varchar,
        "city" varchar,
        "country" varchar,
        "phone" varchar,
        "email" varchar,
        "managerName" varchar,
        "operatingHours" text,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "metadata" text
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fleet_branches_fleet_code" ON "fleet_branches" ("fleetId", "code")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_fleet_branches_fleet" ON "fleet_branches" ("fleetId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fleet_portal_resources" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "fleetId" uuid NOT NULL,
        "resourceType" varchar NOT NULL,
        "resourceKey" varchar NOT NULL,
        "parentId" varchar,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "title" varchar,
        "scheduledAt" timestamptz,
        "completedAt" timestamptz,
        "amount" numeric(16,2),
        "currency" varchar NOT NULL DEFAULT 'UGX',
        "createdByUserId" uuid,
        "updatedByUserId" uuid,
        "data" text
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fleet_portal_resource_key" ON "fleet_portal_resources" ("fleetId", "resourceType", "resourceKey")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_fleet_portal_resource_type" ON "fleet_portal_resources" ("fleetId", "resourceType", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_fleet_portal_resource_parent" ON "fleet_portal_resources" ("parentId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fleet_portal_configurations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "fleetId" uuid NOT NULL,
        "scope" varchar NOT NULL,
        "data" text NOT NULL,
        "updatedByUserId" uuid
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fleet_portal_configuration_scope" ON "fleet_portal_configurations" ("fleetId", "scope")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fleet_role_definitions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "fleetId" uuid NOT NULL,
        "name" varchar NOT NULL,
        "description" varchar,
        "color" varchar NOT NULL DEFAULT '#03cd8c',
        "isSystem" boolean NOT NULL DEFAULT false,
        "active" boolean NOT NULL DEFAULT true,
        "permissions" text NOT NULL
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fleet_role_name" ON "fleet_role_definitions" ("fleetId", "name")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fleet_member_invitations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "fleetId" uuid NOT NULL,
        "organizationId" uuid NOT NULL,
        "email" varchar NOT NULL,
        "role" varchar NOT NULL,
        "tokenHash" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'PENDING',
        "expiresAt" timestamptz NOT NULL,
        "invitedByUserId" uuid NOT NULL,
        "acceptedByUserId" uuid,
        "acceptedAt" timestamptz,
        "metadata" text
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_fleet_member_invitation_lookup" ON "fleet_member_invitations" ("fleetId", "email", "status")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    for (const table of [
      'fleet_member_invitations',
      'fleet_role_definitions',
      'fleet_portal_configurations',
      'fleet_portal_resources',
      'fleet_branches',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_organizations_external_id"');
    await queryRunner.query('ALTER TABLE "organizations" DROP COLUMN IF EXISTS "externalId"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_external_subject"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "identityProvider"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "externalSubject"');
  }
}
