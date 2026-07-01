import { MigrationInterface, QueryRunner } from 'typeorm';

export class PartnerIntegrationFramework1785000002000 implements MigrationInterface {
  name = 'PartnerIntegrationFramework1785000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partners" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "status" character varying NOT NULL,
        "type" character varying NOT NULL,
        "webhookUrl" character varying,
        "config" jsonb,
        "createdByUserId" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_partners" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_partners_code" UNIQUE ("code")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_partners_status" ON "partners" ("status");
      CREATE INDEX IF NOT EXISTS "IDX_partners_type" ON "partners" ("type");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_api_keys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "partnerId" character varying NOT NULL,
        "keyHash" character varying NOT NULL,
        "prefix" character varying NOT NULL,
        "scopes" jsonb NOT NULL,
        "status" character varying NOT NULL,
        "expiresAt" TIMESTAMP,
        "lastUsedAt" TIMESTAMP,
        "revokedAt" TIMESTAMP,
        "revokedByUserId" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_partner_api_keys" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_partner_api_keys_partnerId" ON "partner_api_keys" ("partnerId");
      CREATE INDEX IF NOT EXISTS "IDX_partner_api_keys_keyHash" ON "partner_api_keys" ("keyHash");
      CREATE INDEX IF NOT EXISTS "IDX_partner_api_keys_status" ON "partner_api_keys" ("status");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_webhook_subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "partnerId" character varying NOT NULL,
        "eventTypes" jsonb NOT NULL,
        "url" character varying NOT NULL,
        "secret" character varying,
        "status" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_partner_webhook_subscriptions" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_partner_webhook_subscriptions_partnerId"
        ON "partner_webhook_subscriptions" ("partnerId");
      CREATE INDEX IF NOT EXISTS "IDX_partner_webhook_subscriptions_status"
        ON "partner_webhook_subscriptions" ("status");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_quota_usage" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "partnerId" character varying NOT NULL,
        "period" character varying NOT NULL,
        "metric" character varying NOT NULL,
        "allowed" integer NOT NULL DEFAULT 0,
        "used" integer NOT NULL DEFAULT 0,
        "resetAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_partner_quota_usage" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_partner_quota_usage_partnerId"
        ON "partner_quota_usage" ("partnerId");
      CREATE INDEX IF NOT EXISTS "IDX_partner_quota_usage_period"
        ON "partner_quota_usage" ("period");
      CREATE INDEX IF NOT EXISTS "IDX_partner_quota_usage_metric"
        ON "partner_quota_usage" ("metric");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_webhook_outbox" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "partnerId" character varying NOT NULL,
        "subscriptionId" character varying NOT NULL,
        "eventType" character varying NOT NULL,
        "externalEventId" character varying,
        "payload" jsonb NOT NULL,
        "status" character varying NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "lastError" text,
        "nextAttemptAt" TIMESTAMP,
        "deliveredAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_partner_webhook_outbox" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_partner_webhook_outbox_partnerId"
        ON "partner_webhook_outbox" ("partnerId");
      CREATE INDEX IF NOT EXISTS "IDX_partner_webhook_outbox_subscriptionId"
        ON "partner_webhook_outbox" ("subscriptionId");
      CREATE INDEX IF NOT EXISTS "IDX_partner_webhook_outbox_eventType"
        ON "partner_webhook_outbox" ("eventType");
      CREATE INDEX IF NOT EXISTS "IDX_partner_webhook_outbox_status"
        ON "partner_webhook_outbox" ("status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_partner_webhook_outbox_status";
      DROP INDEX IF EXISTS "IDX_partner_webhook_outbox_eventType";
      DROP INDEX IF EXISTS "IDX_partner_webhook_outbox_subscriptionId";
      DROP INDEX IF EXISTS "IDX_partner_webhook_outbox_partnerId";
      DROP TABLE IF EXISTS "partner_webhook_outbox";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_partner_quota_usage_metric";
      DROP INDEX IF EXISTS "IDX_partner_quota_usage_period";
      DROP INDEX IF EXISTS "IDX_partner_quota_usage_partnerId";
      DROP TABLE IF EXISTS "partner_quota_usage";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_partner_webhook_subscriptions_status";
      DROP INDEX IF EXISTS "IDX_partner_webhook_subscriptions_partnerId";
      DROP TABLE IF EXISTS "partner_webhook_subscriptions";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_partner_api_keys_status";
      DROP INDEX IF EXISTS "IDX_partner_api_keys_keyHash";
      DROP INDEX IF EXISTS "IDX_partner_api_keys_partnerId";
      DROP TABLE IF EXISTS "partner_api_keys";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_partners_type";
      DROP INDEX IF EXISTS "IDX_partners_status";
      DROP TABLE IF EXISTS "partners";
    `);
  }
}
