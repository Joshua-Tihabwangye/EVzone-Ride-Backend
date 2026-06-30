import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookEventRecord1783000000001 implements MigrationInterface {
  name = 'AddWebhookEventRecord1783000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "provider" character varying NOT NULL,
        "externalEventId" character varying NOT NULL,
        "eventType" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'RECEIVED',
        "signatureValid" boolean NOT NULL DEFAULT false,
        "signatureVersion" character varying,
        "payload" text,
        "receivedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "processedAt" TIMESTAMP,
        "error" text,
        "relatedPaymentId" character varying,
        "relatedTransactionId" character varying,
        "metadata" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_webhook_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_webhook_events_provider_external_event_id" ON "webhook_events" ("provider", "externalEventId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_webhook_events_provider" ON "webhook_events" ("provider") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_event_type" ON "webhook_events" ("eventType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_related_payment_id" ON "webhook_events" ("relatedPaymentId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_related_transaction_id" ON "webhook_events" ("relatedTransactionId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_webhook_events_related_transaction_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_webhook_events_related_payment_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_webhook_events_event_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_webhook_events_provider"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_webhook_events_provider_external_event_id"`);
    await queryRunner.query(`DROP TABLE "webhook_events"`);
  }
}
