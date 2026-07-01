import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommissionAndEarningsEngine1784000003000 implements MigrationInterface {
  name = 'CommissionAndEarningsEngine1784000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commission_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "serviceType" character varying NOT NULL,
        "marketId" character varying,
        "organizationId" character varying,
        "fleetId" character varying,
        "vehicleType" character varying,
        "priority" integer NOT NULL DEFAULT 0,
        "effectiveFrom" TIMESTAMP NOT NULL,
        "effectiveUntil" TIMESTAMP,
        "active" boolean NOT NULL DEFAULT true,
        "driverSharePercent" numeric(5,2) NOT NULL DEFAULT 85.00,
        "platformFeePercent" numeric(5,2) NOT NULL DEFAULT 15.00,
        "fixedPlatformFee" numeric(16,2) NOT NULL DEFAULT 0,
        "taxPercent" numeric(5,2) NOT NULL DEFAULT 0,
        "tipPayoutPercent" numeric(5,2) NOT NULL DEFAULT 100.00,
        "currency" character varying NOT NULL DEFAULT 'UGX',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commission_rules" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "IDX_commission_rules_serviceType" ON "commission_rules" ("serviceType");
      CREATE INDEX IF NOT EXISTS "IDX_commission_rules_marketId" ON "commission_rules" ("marketId");
      CREATE INDEX IF NOT EXISTS "IDX_commission_rules_organizationId" ON "commission_rules" ("organizationId");
      CREATE INDEX IF NOT EXISTS "IDX_commission_rules_fleetId" ON "commission_rules" ("fleetId");
      CREATE INDEX IF NOT EXISTS "IDX_commission_rules_active_priority" ON "commission_rules" ("active", "priority");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "commission_rules"`);
  }
}
