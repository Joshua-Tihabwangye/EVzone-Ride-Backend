import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentRefundAndIdempotency1782819261619 implements MigrationInterface {
  name = 'AddPaymentRefundAndIdempotency1782819261619';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('payments');
    if (table && !table.findColumnByName('refundedAmount')) {
      await queryRunner.query(
        `ALTER TABLE "payments" ADD "refundedAmount" numeric(16,2) NOT NULL DEFAULT '0'`,
      );
    }
    if (table && !table.indices.some((i) => i.name === 'IDX_payment_user_idempotency')) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_payment_user_idempotency" ON "payments" ("userId", "idempotencyKey") `,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('payments');
    if (table && table.indices.some((i) => i.name === 'IDX_payment_user_idempotency')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_payment_user_idempotency"`);
    }
    if (table?.findColumnByName('refundedAmount')) {
      await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "refundedAmount"`);
    }
  }
}
