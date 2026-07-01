import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReconciliationEngine1784000002000 implements MigrationInterface {
  name = 'ReconciliationEngine1784000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reconciliation_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" character varying NOT NULL,
        "periodStart" timestamp NOT NULL,
        "periodEnd" timestamp NOT NULL,
        "status" character varying NOT NULL DEFAULT 'OPEN',
        "summary" jsonb,
        "createdByUserId" character varying,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reconciliation_runs" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "IDX_reconciliation_runs_type" ON "reconciliation_runs" ("type");
      CREATE INDEX IF NOT EXISTS "IDX_reconciliation_runs_periodStart" ON "reconciliation_runs" ("periodStart");
      CREATE INDEX IF NOT EXISTS "IDX_reconciliation_runs_periodEnd" ON "reconciliation_runs" ("periodEnd");
      CREATE INDEX IF NOT EXISTS "IDX_reconciliation_runs_status" ON "reconciliation_runs" ("status");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reconciliation_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runId" uuid NOT NULL,
        "internalRecordType" character varying NOT NULL,
        "internalRecordId" character varying NOT NULL,
        "providerReference" character varying,
        "expectedAmount" numeric(16,2) NOT NULL,
        "settledAmount" numeric(16,2) NOT NULL,
        "variance" numeric(16,2) NOT NULL,
        "status" character varying NOT NULL DEFAULT 'OPEN',
        "resolution" text,
        "resolvedByUserId" character varying,
        "resolvedAt" TIMESTAMP,
        "provider" character varying,
        "statementDate" TIMESTAMP,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reconciliation_records" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "IDX_reconciliation_records_runId" ON "reconciliation_records" ("runId");
      CREATE INDEX IF NOT EXISTS "IDX_reconciliation_records_internalRecordId" ON "reconciliation_records" ("internalRecordId");
      CREATE INDEX IF NOT EXISTS "IDX_reconciliation_records_providerReference" ON "reconciliation_records" ("providerReference");
      CREATE INDEX IF NOT EXISTS "IDX_reconciliation_records_status" ON "reconciliation_records" ("status");
    `);

    await queryRunner.query(`
      UPDATE "corporate_pay_reconciliations"
      SET "status" = 'VARIANCE'
      WHERE "status" = 'MISMATCHED';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "corporate_pay_reconciliations"
      SET "status" = 'MISMATCHED'
      WHERE "status" = 'VARIANCE';
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciliation_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciliation_runs"`);
  }
}
