import { MigrationInterface, QueryRunner } from 'typeorm';

export class PayoutLifecycleAndCashoutEnum1784000001000 implements MigrationInterface {
  name = 'PayoutLifecycleAndCashoutEnum1784000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wallets"
        ADD COLUMN IF NOT EXISTS "reservedForCashout" numeric(16,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0;
      UPDATE "wallets" SET "reservedForCashout" = 0 WHERE "reservedForCashout" IS NULL;
      UPDATE "wallets" SET "version" = 0 WHERE "version" IS NULL;
      ALTER TABLE "wallets"
        ALTER COLUMN "reservedForCashout" SET NOT NULL,
        ALTER COLUMN "version" SET NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "payouts"
        ADD COLUMN IF NOT EXISTS "idempotencyKey" character varying,
        ADD COLUMN IF NOT EXISTS "cashoutRequestId" character varying,
        ADD COLUMN IF NOT EXISTS "provider" character varying DEFAULT 'flutterwave',
        ADD COLUMN IF NOT EXISTS "providerReference" character varying,
        ADD COLUMN IF NOT EXISTS "destinationDetails" jsonb,
        ADD COLUMN IF NOT EXISTS "providerBatchId" character varying,
        ADD COLUMN IF NOT EXISTS "providerTransactionId" character varying,
        ADD COLUMN IF NOT EXISTS "fee" numeric(16,2),
        ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "providerPayload" jsonb,
        ADD COLUMN IF NOT EXISTS "providerError" jsonb,
        ADD COLUMN IF NOT EXISTS "initiatedAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "initiatedByUserId" character varying;
      UPDATE "payouts" SET "idempotencyKey" = reference WHERE "idempotencyKey" IS NULL;
      ALTER TABLE "payouts" ALTER COLUMN "idempotencyKey" SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payouts_cashout_idempotency"
        ON "payouts" ("cashoutRequestId", "idempotencyKey");
    `);

    await queryRunner.query(`
      ALTER TABLE "cashout_requests"
        ADD COLUMN IF NOT EXISTS "reference" character varying,
        ADD COLUMN IF NOT EXISTS "currency" character varying DEFAULT 'UGX',
        ADD COLUMN IF NOT EXISTS "payoutId" character varying,
        ADD COLUMN IF NOT EXISTS "provider" character varying,
        ADD COLUMN IF NOT EXISTS "providerReference" character varying,
        ADD COLUMN IF NOT EXISTS "ledgerJournalReference" character varying;
      UPDATE "cashout_requests" SET "reference" = id WHERE "reference" IS NULL;
      ALTER TABLE "cashout_requests" ALTER COLUMN "reference" SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cashout_requests_reference"
        ON "cashout_requests" ("reference");
      ALTER TABLE "cashout_requests"
        ADD CONSTRAINT "chk_cashout_requests_amount_positive" CHECK (amount > 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cashout_requests"
        DROP CONSTRAINT IF EXISTS "chk_cashout_requests_amount_positive",
        DROP COLUMN IF EXISTS "reference",
        DROP COLUMN IF EXISTS "currency",
        DROP COLUMN IF EXISTS "payoutId",
        DROP COLUMN IF EXISTS "provider",
        DROP COLUMN IF EXISTS "providerReference",
        DROP COLUMN IF EXISTS "ledgerJournalReference";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_payouts_cashout_idempotency";
      ALTER TABLE "payouts"
        DROP COLUMN IF EXISTS "idempotencyKey",
        DROP COLUMN IF EXISTS "cashoutRequestId",
        DROP COLUMN IF EXISTS "provider",
        DROP COLUMN IF EXISTS "destinationDetails",
        DROP COLUMN IF EXISTS "providerBatchId",
        DROP COLUMN IF EXISTS "providerTransactionId",
        DROP COLUMN IF EXISTS "fee",
        DROP COLUMN IF EXISTS "verifiedAt",
        DROP COLUMN IF EXISTS "reconciledAt",
        DROP COLUMN IF EXISTS "providerPayload",
        DROP COLUMN IF EXISTS "providerError",
        DROP COLUMN IF EXISTS "initiatedAt",
        DROP COLUMN IF EXISTS "completedAt",
        DROP COLUMN IF EXISTS "failedAt",
        DROP COLUMN IF EXISTS "reversedAt",
        DROP COLUMN IF EXISTS "initiatedByUserId";
    `);

    await queryRunner.query(`
      ALTER TABLE "wallets"
        DROP COLUMN IF EXISTS "reservedForCashout",
        DROP COLUMN IF EXISTS "version";
    `);
  }
}
