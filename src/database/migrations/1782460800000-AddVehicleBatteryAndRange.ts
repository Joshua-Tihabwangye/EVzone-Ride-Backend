import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleBatteryAndRange1782460800000 implements MigrationInterface {
  name = 'AddVehicleBatteryAndRange1782460800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "batteryCapacityKwh" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "estimatedRangeKm" numeric(10,2)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "batteryCapacityKwh"`);
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "estimatedRangeKm"`);
  }
}
