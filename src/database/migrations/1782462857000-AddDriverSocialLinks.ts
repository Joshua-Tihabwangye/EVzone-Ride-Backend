import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverSocialLinks1782462857000 implements MigrationInterface {
  name = 'AddDriverSocialLinks1782462857000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_social_links" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "driverId" uuid NOT NULL,
        "platform" character varying NOT NULL,
        "url" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_driver_social_links_driverId" ON "driver_social_links" ("driverId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(`DROP TABLE IF EXISTS "driver_social_links"`);
  }
}
