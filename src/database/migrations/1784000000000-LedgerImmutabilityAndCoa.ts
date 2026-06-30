import { MigrationInterface, QueryRunner } from 'typeorm';

export class LedgerImmutabilityAndCoa1784000000000 implements MigrationInterface {
  name = 'LedgerImmutabilityAndCoa1784000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(
      `ALTER TABLE "ledger_accounts" ADD COLUMN IF NOT EXISTS "accountCategory" varchar DEFAULT 'ASSET'`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_accounts" ADD COLUMN IF NOT EXISTS "organizationId" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ledger_accounts_organizationId" ON "ledger_accounts" ("organizationId")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ledger_account_period_balances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "accountId" uuid NOT NULL,
        "year" smallint NOT NULL,
        "month" smallint NOT NULL,
        "status" varchar NOT NULL DEFAULT 'OPEN',
        "openingBalance" numeric(18,2) NOT NULL DEFAULT 0,
        "closingBalance" numeric(18,2) NOT NULL DEFAULT 0,
        "totalDebits" numeric(18,2) NOT NULL DEFAULT 0,
        "totalCredits" numeric(18,2) NOT NULL DEFAULT 0,
        "closedAt" TIMESTAMP,
        "closedByUserId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_ledger_account_period_balances" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ledger_account_period_balances_account_year_month" UNIQUE ("accountId", "year", "month")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ledger_entries_journal_account_direction"
       ON "ledger_entries" ("journalId", "accountId", "direction")`,
    );

    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION enforce_ledger_immutability()
       RETURNS TRIGGER AS $$
       BEGIN
         IF TG_TABLE_NAME = 'journal_transactions' THEN
           IF OLD.status = 'POSTED' THEN
             IF NEW.status = 'REVERSED' AND OLD.status <> 'REVERSED' THEN
               RETURN NEW;
             END IF;
             RAISE EXCEPTION 'Posted journal_transactions row is immutable: %', OLD.id;
           END IF;
         ELSIF TG_TABLE_NAME = 'ledger_entries' THEN
           RAISE EXCEPTION 'ledger_entries rows are immutable';
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql;`,
    );

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_ledger_entries_immutable ON "ledger_entries";`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_ledger_entries_immutable
       BEFORE UPDATE OR DELETE ON "ledger_entries"
       FOR EACH ROW EXECUTE FUNCTION enforce_ledger_immutability();`,
    );

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_journal_transactions_immutable ON "journal_transactions";`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_journal_transactions_immutable
       BEFORE UPDATE OR DELETE ON "journal_transactions"
       FOR EACH ROW EXECUTE FUNCTION enforce_ledger_immutability();`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_journal_transactions_immutable ON "journal_transactions";`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_ledger_entries_immutable ON "ledger_entries";`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_ledger_immutability();`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ledger_entries_journal_account_direction";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_account_period_balances";`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ledger_accounts_organizationId";`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_accounts" DROP COLUMN IF EXISTS "organizationId";`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_accounts" DROP COLUMN IF EXISTS "accountCategory";`,
    );
  }
}
