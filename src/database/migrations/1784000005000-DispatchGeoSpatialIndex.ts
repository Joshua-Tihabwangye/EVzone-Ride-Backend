import { MigrationInterface, QueryRunner } from 'typeorm';

export class DispatchGeoSpatialIndex1784000005000 implements MigrationInterface {
  name = 'DispatchGeoSpatialIndex1784000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqljs') {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "universal_dispatch_units" ADD COLUMN IF NOT EXISTS "lastAssignedAt" TIMESTAMP WITH TIME ZONE;`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ud_dispatch_unit_last_assigned" ON "universal_dispatch_units" ("lastAssignedAt");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ud_dispatch_unit_geo_gist" ON "universal_dispatch_units" USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqljs') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ud_dispatch_unit_geo_gist";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ud_dispatch_unit_last_assigned";`);
    await queryRunner.query(`ALTER TABLE "universal_dispatch_units" DROP COLUMN IF EXISTS "lastAssignedAt";`);
  }
}
