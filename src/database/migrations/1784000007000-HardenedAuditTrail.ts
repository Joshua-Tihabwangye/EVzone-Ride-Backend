import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenedAuditTrail1784000007000 implements MigrationInterface {
  name = 'HardenedAuditTrail1784000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqljs') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "before" JSONB;`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "after" JSONB;`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "changedFields" JSONB;`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "reason" VARCHAR;`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "requestId" VARCHAR;`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "checksum" VARCHAR;`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_request_id" ON "audit_logs" ("requestId");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at" ON "audit_logs" ("createdAt");`,
    );

    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION enforce_audit_log_append_only()
       RETURNS TRIGGER AS $$
       BEGIN
         IF TG_OP = 'UPDATE' THEN
           RAISE EXCEPTION 'audit_logs rows are append-only and cannot be updated';
         ELSIF TG_OP = 'DELETE' THEN
           RAISE EXCEPTION 'audit_logs rows are append-only and cannot be deleted';
         END IF;
         RETURN NULL;
       END;
       $$ LANGUAGE plpgsql;`,
    );
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_log_append_only ON "audit_logs";`);
    await queryRunner.query(
      `CREATE TRIGGER trg_audit_log_append_only
       BEFORE UPDATE OR DELETE ON "audit_logs"
       FOR EACH ROW EXECUTE FUNCTION enforce_audit_log_append_only();`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqljs') {
      return;
    }

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_log_append_only ON "audit_logs";`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_audit_log_append_only();`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_created_at";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_request_id";`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "checksum";`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "requestId";`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "reason";`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "changedFields";`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "after";`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "before";`);
  }
}
