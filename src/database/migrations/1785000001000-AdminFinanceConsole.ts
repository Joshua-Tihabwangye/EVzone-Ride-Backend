import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminFinanceConsole1785000001000 implements MigrationInterface {
  name = 'AdminFinanceConsole1785000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_reconciliation_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runId" character varying,
        "periodStart" TIMESTAMP NOT NULL,
        "periodEnd" TIMESTAMP NOT NULL,
        "type" character varying NOT NULL,
        "status" character varying NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'UGX',
        "totalWalletTransactions" integer NOT NULL DEFAULT 0,
        "totalWalletAmount" numeric(18,2) NOT NULL DEFAULT 0,
        "matchedCount" integer NOT NULL DEFAULT 0,
        "varianceCount" integer NOT NULL DEFAULT 0,
        "varianceAmount" numeric(18,2) NOT NULL DEFAULT 0,
        "details" jsonb,
        "createdByUserId" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_wallet_reconciliation_reports" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wallet_reconciliation_reports_runId"
        ON "wallet_reconciliation_reports" ("runId");
      CREATE INDEX IF NOT EXISTS "IDX_wallet_reconciliation_reports_period"
        ON "wallet_reconciliation_reports" ("periodStart", "periodEnd");
      CREATE INDEX IF NOT EXISTS "IDX_wallet_reconciliation_reports_status"
        ON "wallet_reconciliation_reports" ("status");
      CREATE INDEX IF NOT EXISTS "IDX_wallet_reconciliation_reports_type"
        ON "wallet_reconciliation_reports" ("type");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "finance_settlement_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reference" character varying NOT NULL,
        "status" character varying NOT NULL,
        "periodStart" TIMESTAMP NOT NULL,
        "periodEnd" TIMESTAMP NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'UGX',
        "totalAmount" numeric(18,2) NOT NULL DEFAULT 0,
        "totalCount" integer NOT NULL DEFAULT 0,
        "provider" character varying,
        "settlementDate" TIMESTAMP,
        "postedAt" TIMESTAMP,
        "postedByUserId" character varying,
        "details" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_finance_settlement_batches" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_finance_settlement_batches_reference" UNIQUE ("reference")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_finance_settlement_batches_reference"
        ON "finance_settlement_batches" ("reference");
      CREATE INDEX IF NOT EXISTS "IDX_finance_settlement_batches_status"
        ON "finance_settlement_batches" ("status");
      CREATE INDEX IF NOT EXISTS "IDX_finance_settlement_batches_period"
        ON "finance_settlement_batches" ("periodStart", "periodEnd");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_finance_settlement_batches_period";
      DROP INDEX IF EXISTS "IDX_finance_settlement_batches_status";
      DROP INDEX IF EXISTS "IDX_finance_settlement_batches_reference";
      DROP TABLE IF EXISTS "finance_settlement_batches";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_wallet_reconciliation_reports_type";
      DROP INDEX IF EXISTS "IDX_wallet_reconciliation_reports_status";
      DROP INDEX IF EXISTS "IDX_wallet_reconciliation_reports_period";
      DROP INDEX IF EXISTS "IDX_wallet_reconciliation_reports_runId";
      DROP TABLE IF EXISTS "wallet_reconciliation_reports";
    `);
  }
}
