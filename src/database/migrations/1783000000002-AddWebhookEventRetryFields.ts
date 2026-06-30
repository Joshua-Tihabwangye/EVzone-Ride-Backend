import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookEventRetryFields1783000000002 implements MigrationInterface {
  name = 'AddWebhookEventRetryFields1783000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_next_attempt_at" ON "webhook_events" ("nextAttemptAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_webhook_events_next_attempt_at"`);
    await queryRunner.query(`ALTER TABLE "webhook_events" DROP COLUMN IF EXISTS "nextAttemptAt"`);
    await queryRunner.query(`ALTER TABLE "webhook_events" DROP COLUMN IF EXISTS "attempts"`);
  }
}
