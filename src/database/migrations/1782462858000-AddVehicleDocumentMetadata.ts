import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleDocumentMetadata1782462858000 implements MigrationInterface {
  name = 'AddVehicleDocumentMetadata1782462858000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(`ALTER TABLE "vehicle_documents" ADD COLUMN IF NOT EXISTS "metadata" jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(`ALTER TABLE "vehicle_documents" DROP COLUMN IF EXISTS "metadata"`);
  }
}
