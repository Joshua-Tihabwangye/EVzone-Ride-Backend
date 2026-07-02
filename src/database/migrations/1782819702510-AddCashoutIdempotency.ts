import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCashoutIdempotency1782819702510 implements MigrationInterface {
  name = 'AddCashoutIdempotency1782819702510';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('cashout_requests');
    if (table && !table.findColumnByName('idempotencyKey')) {
      await queryRunner.query(`ALTER TABLE "cashout_requests" ADD "idempotencyKey" character varying`);
    }
    if (table && !table.indices.some((i) => i.name === 'IDX_cashout_user_idempotency')) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_cashout_user_idempotency" ON "cashout_requests" ("userId", "idempotencyKey") `,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('cashout_requests');
    if (table && table.indices.some((i) => i.name === 'IDX_cashout_user_idempotency')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_cashout_user_idempotency"`);
    }
    if (table?.findColumnByName('idempotencyKey')) {
      await queryRunner.query(`ALTER TABLE "cashout_requests" DROP COLUMN "idempotencyKey"`);
    }
  }
}
