import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFileAssetLifecycle1783000000003 implements MigrationInterface {
  name = 'AddFileAssetLifecycle1783000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'PENDING_SCAN'`,
    );
    await queryRunner.query(
      `ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "scanResult" character varying`,
    );
    await queryRunner.query(`ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "scanDetails" text`);
    await queryRunner.query(`ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP`);
    await queryRunner.query(
      `ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "rejectionReason" character varying`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_file_assets_status" ON "file_assets" ("status") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_file_assets_status"`);
    await queryRunner.query(`ALTER TABLE "file_assets" DROP COLUMN IF EXISTS "rejectionReason"`);
    await queryRunner.query(`ALTER TABLE "file_assets" DROP COLUMN IF EXISTS "scannedAt"`);
    await queryRunner.query(`ALTER TABLE "file_assets" DROP COLUMN IF EXISTS "scanDetails"`);
    await queryRunner.query(`ALTER TABLE "file_assets" DROP COLUMN IF EXISTS "scanResult"`);
    await queryRunner.query(`ALTER TABLE "file_assets" DROP COLUMN IF EXISTS "status"`);
  }
}
