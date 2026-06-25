import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorporatePayPartnerV91782259200000 implements MigrationInterface {
  name = 'CorporatePayPartnerV91782259200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corporate_pay_subject_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "externalOrganizationId" varchar NOT NULL,
        "externalMemberId" varchar NOT NULL,
        "organizationId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "accountId" uuid,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "metadata" text
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cp_subject_external" ON "corporate_pay_subject_links" ("externalOrganizationId", "externalMemberId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cp_subject_organization" ON "corporate_pay_subject_links" ("organizationId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cp_subject_user" ON "corporate_pay_subject_links" ("userId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corporate_pay_partner_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "organizationId" uuid NOT NULL,
        "externalRequestId" varchar NOT NULL,
        "idempotencyKey" varchar NOT NULL,
        "externalOrderId" varchar,
        "externalOrganizationId" varchar,
        "externalMemberId" varchar,
        "accountId" uuid,
        "userId" uuid,
        "requestKind" varchar NOT NULL,
        "serviceType" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'DRAFT',
        "priority" varchar NOT NULL DEFAULT 'NORMAL',
        "customer" text NOT NULL,
        "servicePayload" text NOT NULL,
        "corporateContext" text,
        "quote" text,
        "amount" numeric(16,2),
        "currency" varchar NOT NULL DEFAULT 'UGX',
        "scheduledAt" timestamptz,
        "dueAt" timestamptz,
        "quoteExpiresAt" timestamptz,
        "approvalId" varchar,
        "authorizationId" uuid,
        "authorizationStatus" varchar NOT NULL DEFAULT 'PENDING',
        "policyId" varchar,
        "budgetId" varchar,
        "budgetReservationId" varchar,
        "costCenterId" varchar,
        "groupId" varchar,
        "purchaseOrderId" varchar,
        "manualBookingId" uuid,
        "serviceId" varchar,
        "transactionId" uuid,
        "parentRequestId" uuid,
        "lastError" text,
        "metadata" text,
        "confirmedAt" timestamptz,
        "completedAt" timestamptz,
        "cancelledAt" timestamptz,
        "lastSyncedAt" timestamptz
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cp_request_org_external" ON "corporate_pay_partner_requests" ("organizationId", "externalRequestId")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cp_request_idempotency" ON "corporate_pay_partner_requests" ("idempotencyKey")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cp_request_status" ON "corporate_pay_partner_requests" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cp_request_service" ON "corporate_pay_partner_requests" ("serviceType", "serviceId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corporate_pay_authorizations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "externalAuthorizationId" varchar NOT NULL,
        "requestId" uuid NOT NULL,
        "accountId" uuid,
        "status" varchar NOT NULL DEFAULT 'PENDING',
        "approvedAmount" numeric(16,2),
        "currency" varchar NOT NULL DEFAULT 'UGX',
        "approvalId" varchar,
        "policyId" varchar,
        "budgetId" varchar,
        "budgetReservationId" varchar,
        "policyDecision" text,
        "approvalContext" text,
        "budgetContext" text,
        "reason" text,
        "expiresAt" timestamptz,
        "consumedAt" timestamptz,
        "revokedAt" timestamptz,
        "metadata" text
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cp_authorization_external" ON "corporate_pay_authorizations" ("externalAuthorizationId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cp_authorization_request" ON "corporate_pay_authorizations" ("requestId", "createdAt")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corporate_pay_fulfillment_evidence" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "requestId" uuid NOT NULL,
        "externalEvidenceId" varchar,
        "type" varchar NOT NULL,
        "url" varchar,
        "fileAssetId" uuid,
        "sha256" varchar,
        "actor" varchar,
        "note" text,
        "capturedAt" timestamptz,
        "metadata" text
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cp_evidence_external" ON "corporate_pay_fulfillment_evidence" ("externalEvidenceId") WHERE "externalEvidenceId" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cp_evidence_request" ON "corporate_pay_fulfillment_evidence" ("requestId", "capturedAt")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "corporate_pay_fulfillment_disputes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "requestId" uuid NOT NULL,
        "externalDisputeId" varchar,
        "status" varchar NOT NULL DEFAULT 'OPEN',
        "reason" text NOT NULL,
        "amount" numeric(16,2),
        "currency" varchar NOT NULL DEFAULT 'UGX',
        "evidence" text,
        "resolution" text,
        "openedAt" timestamptz,
        "resolvedAt" timestamptz,
        "metadata" text
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cp_dispute_external" ON "corporate_pay_fulfillment_disputes" ("externalDisputeId") WHERE "externalDisputeId" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_cp_dispute_request" ON "corporate_pay_fulfillment_disputes" ("requestId", "status")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    for (const table of [
      'corporate_pay_fulfillment_disputes',
      'corporate_pay_fulfillment_evidence',
      'corporate_pay_authorizations',
      'corporate_pay_partner_requests',
      'corporate_pay_subject_links',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
