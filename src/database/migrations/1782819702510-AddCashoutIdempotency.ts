import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCashoutIdempotency1782819702510 implements MigrationInterface {
  name = 'AddCashoutIdempotency1782819702510';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cashout_requests" ADD "idempotencyKey" character varying`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cashout_user_idempotency" ON "cashout_requests" ("userId", "idempotencyKey") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_cashout_user_idempotency"`);
    await queryRunner.query(`ALTER TABLE "cashout_requests" DROP COLUMN "idempotencyKey"`);
  }
}
