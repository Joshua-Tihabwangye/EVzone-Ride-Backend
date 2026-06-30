import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeFileAssetUrlNullable1783000000004 implements MigrationInterface {
  name = 'MakeFileAssetUrlNullable1783000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "file_assets" ALTER COLUMN "url" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "file_assets" ALTER COLUMN "url" SET NOT NULL`);
  }
}
