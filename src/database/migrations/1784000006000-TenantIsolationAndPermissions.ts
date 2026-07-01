import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantIsolationAndPermissions1784000006000 implements MigrationInterface {
  name = 'TenantIsolationAndPermissions1784000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqljs') {
      return;
    }

    const tables = [
      'rides',
      'delivery_orders',
      'tourist_bookings',
      'ambulance_requests',
      'rental_bookings',
      'payments',
      'wallet_transactions',
      'payouts',
      'cashout_requests',
    ];

    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "organizationId" VARCHAR;`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_${table}_organization_id" ON "${table}" ("organizationId");`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "universal_service_requests" ADD COLUMN IF NOT EXISTS "organizationId" VARCHAR;`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_universal_service_requests_organization_id" ON "universal_service_requests" ("organizationId");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqljs') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_universal_service_requests_organization_id";`);
    await queryRunner.query(
      `ALTER TABLE "universal_service_requests" DROP COLUMN IF EXISTS "organizationId";`,
    );

    const tables = [
      'rides',
      'delivery_orders',
      'tourist_bookings',
      'ambulance_requests',
      'rental_bookings',
      'payments',
      'wallet_transactions',
      'payouts',
      'cashout_requests',
    ];

    for (const table of tables) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_${table}_organization_id";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "organizationId";`);
    }
  }
}
