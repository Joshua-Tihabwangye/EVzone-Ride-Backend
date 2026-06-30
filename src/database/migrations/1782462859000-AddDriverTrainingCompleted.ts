import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverTrainingCompleted1782462859000 implements MigrationInterface {
  name = 'AddDriverTrainingCompleted1782462859000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "trainingCompleted" boolean NOT NULL DEFAULT false`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(`ALTER TABLE "driver_profiles" DROP COLUMN IF EXISTS "trainingCompleted"`);
  }
}
