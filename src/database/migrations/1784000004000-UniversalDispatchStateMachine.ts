import { MigrationInterface, QueryRunner } from 'typeorm';

const DISPATCH_UNIT_TRANSITIONS: Record<string, string[]> = {
  OFFLINE: ['AVAILABLE', 'DOCUMENT_BLOCKED', 'SUSPENDED', 'CHARGING'],
  AVAILABLE: [
    'OFFERED',
    'RESERVED',
    'OFFLINE',
    'CHARGING',
    'BREAK_REQUIRED',
    'DOCUMENT_BLOCKED',
    'SUSPENDED',
  ],
  OFFERED: ['AVAILABLE', 'RESERVED', 'OFFLINE', 'SUSPENDED'],
  RESERVED: ['EN_ROUTE_PICKUP', 'AVAILABLE', 'OFFLINE', 'SUSPENDED'],
  EN_ROUTE_PICKUP: ['WAITING', 'AVAILABLE', 'SUSPENDED'],
  WAITING: ['ON_TRIP', 'ON_DELIVERY_ROUTE', 'AVAILABLE', 'SUSPENDED'],
  ON_TRIP: ['AVAILABLE', 'OFFLINE', 'BREAK_REQUIRED', 'SUSPENDED'],
  ON_DELIVERY_ROUTE: ['AVAILABLE', 'OFFLINE', 'BREAK_REQUIRED', 'SUSPENDED'],
  CHARGING: ['AVAILABLE', 'OFFLINE', 'SUSPENDED'],
  BREAK_REQUIRED: ['AVAILABLE', 'OFFLINE', 'SUSPENDED'],
  DOCUMENT_BLOCKED: ['OFFLINE', 'SUSPENDED'],
  SUSPENDED: ['OFFLINE'],
};

const REQUEST_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['SCHEDULED', 'SEARCHING', 'CANCELLED', 'EXPIRED'],
  SCHEDULED: ['SEARCHING', 'CANCELLED', 'EXPIRED'],
  SEARCHING: ['OFFERING', 'ASSIGNED', 'NO_QUALIFIED_DRIVER', 'CANCELLED', 'EXPIRED'],
  OFFERING: ['SEARCHING', 'ASSIGNED', 'NO_QUALIFIED_DRIVER', 'CANCELLED', 'EXPIRED'],
  ASSIGNED: ['DRIVER_EN_ROUTE', 'SEARCHING', 'CANCELLED'],
  DRIVER_EN_ROUTE: ['ARRIVED', 'SEARCHING', 'CANCELLED'],
  ARRIVED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_QUALIFIED_DRIVER: ['SEARCHING', 'CANCELLED', 'EXPIRED'],
  EXPIRED: [],
};

const OFFER_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'LOST_RACE'],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
  LOST_RACE: [],
};

const ASSIGNMENT_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['RELEASED', 'COMPLETED', 'CANCELLED', 'FAILED'],
  RELEASED: ['ACTIVE', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};

const TRIP_TRANSITIONS: Record<string, string[]> = {
  ASSIGNED: ['DRIVER_EN_ROUTE_PICKUP', 'CANCELLED', 'FAILED'],
  DRIVER_EN_ROUTE_PICKUP: ['DRIVER_ARRIVED', 'CANCELLED', 'FAILED'],
  DRIVER_ARRIVED: ['WAITING_FOR_RIDER', 'RIDER_VERIFIED', 'PACKAGE_QR_VERIFIED', 'NO_SHOW', 'CANCELLED'],
  WAITING_FOR_RIDER: ['RIDER_VERIFIED', 'PACKAGE_QR_VERIFIED', 'NO_SHOW', 'CANCELLED'],
  RIDER_VERIFIED: ['TRIP_STARTED', 'CANCELLED'],
  PACKAGE_QR_VERIFIED: ['PACKAGE_PICKED_UP', 'CANCELLED'],
  PACKAGE_PICKED_UP: ['EN_ROUTE_DELIVERY', 'CANCELLED'],
  EN_ROUTE_DELIVERY: ['DELIVERY_ARRIVED', 'STOP_ARRIVED', 'CANCELLED'],
  DELIVERY_ARRIVED: ['RECIPIENT_VERIFIED', 'PACKAGE_DELIVERED', 'CANCELLED'],
  RECIPIENT_VERIFIED: ['PACKAGE_DELIVERED', 'CANCELLED'],
  PACKAGE_DELIVERED: ['COMPLETED', 'STOP_COMPLETED'],
  TRIP_STARTED: ['STOP_ARRIVED', 'COMPLETED', 'CANCELLED'],
  STOP_ARRIVED: ['STOP_COMPLETED', 'CANCELLED'],
  STOP_COMPLETED: ['STOP_ARRIVED', 'TRIP_STARTED', 'EN_ROUTE_DELIVERY', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  FAILED: [],
};

function buildRuleInserts(entityType: string, transitions: Record<string, string[]>): string {
  const rows: string[] = [];
  for (const [fromStatus, targets] of Object.entries(transitions)) {
    for (const toStatus of targets) {
      rows.push(`('${entityType}', '${fromStatus}', '${toStatus}')`);
    }
  }
  if (rows.length === 0) return '';
  return `INSERT INTO "universal_dispatch_transition_rules" ("entityType", "fromStatus", "toStatus") VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING;`;
}

export class UniversalDispatchStateMachine1784000004000 implements MigrationInterface {
  name = 'UniversalDispatchStateMachine1784000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "universal_service_requests" ADD COLUMN IF NOT EXISTS "previousStatus" character varying;
      ALTER TABLE "universal_dispatch_offers" ADD COLUMN IF NOT EXISTS "previousStatus" character varying;
      ALTER TABLE "universal_dispatch_units" ADD COLUMN IF NOT EXISTS "previousStatus" character varying;
      ALTER TABLE "universal_dispatch_assignments" ADD COLUMN IF NOT EXISTS "previousStatus" character varying;
      ALTER TABLE "universal_trip_sessions" ADD COLUMN IF NOT EXISTS "previousStatus" character varying;

      CREATE TABLE IF NOT EXISTS "state_transition_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "entityType" character varying NOT NULL,
        "entityId" character varying NOT NULL,
        "fromStatus" character varying,
        "toStatus" character varying NOT NULL,
        "actorType" character varying,
        "actorId" character varying,
        "reasonCode" character varying,
        "metadata" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_state_transition_logs" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "IDX_state_transition_log_entity" ON "state_transition_logs" ("entityType", "entityId", "createdAt");
      CREATE INDEX IF NOT EXISTS "IDX_state_transition_log_entityId" ON "state_transition_logs" ("entityId");
    `);

    if (queryRunner.connection.options.type === 'sqljs') {
      return;
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ud_assignment_active_unit"
      ON "universal_dispatch_assignments" ("dispatchUnitId")
      WHERE status = 'ACTIVE';

      CREATE TABLE IF NOT EXISTS "universal_dispatch_transition_rules" (
        "entityType" character varying NOT NULL,
        "fromStatus" character varying NOT NULL,
        "toStatus" character varying NOT NULL,
        CONSTRAINT "PK_universal_dispatch_transition_rules" PRIMARY KEY ("entityType", "fromStatus", "toStatus")
      );

      CREATE OR REPLACE FUNCTION enforce_universal_dispatch_transition()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.status = OLD.status THEN
          RETURN NEW;
        END IF;
        IF EXISTS (
          SELECT 1 FROM "universal_dispatch_transition_rules"
          WHERE "entityType" = TG_ARGV[0]
            AND "fromStatus" = OLD.status
            AND "toStatus" = NEW.status
        ) THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'INVALID_%_TRANSITION:%->%', TG_ARGV[0], OLD.status, NEW.status;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_universal_service_request_transition ON "universal_service_requests";
      CREATE TRIGGER trg_universal_service_request_transition
        BEFORE UPDATE ON "universal_service_requests"
        FOR EACH ROW EXECUTE FUNCTION enforce_universal_dispatch_transition('service_request');

      DROP TRIGGER IF EXISTS trg_universal_dispatch_offer_transition ON "universal_dispatch_offers";
      CREATE TRIGGER trg_universal_dispatch_offer_transition
        BEFORE UPDATE ON "universal_dispatch_offers"
        FOR EACH ROW EXECUTE FUNCTION enforce_universal_dispatch_transition('dispatch_offer');

      DROP TRIGGER IF EXISTS trg_universal_dispatch_unit_transition ON "universal_dispatch_units";
      CREATE TRIGGER trg_universal_dispatch_unit_transition
        BEFORE UPDATE ON "universal_dispatch_units"
        FOR EACH ROW EXECUTE FUNCTION enforce_universal_dispatch_transition('dispatch_unit');

      DROP TRIGGER IF EXISTS trg_universal_dispatch_assignment_transition ON "universal_dispatch_assignments";
      CREATE TRIGGER trg_universal_dispatch_assignment_transition
        BEFORE UPDATE ON "universal_dispatch_assignments"
        FOR EACH ROW EXECUTE FUNCTION enforce_universal_dispatch_transition('dispatch_assignment');

      DROP TRIGGER IF EXISTS trg_universal_trip_session_transition ON "universal_trip_sessions";
      CREATE TRIGGER trg_universal_trip_session_transition
        BEFORE UPDATE ON "universal_trip_sessions"
        FOR EACH ROW EXECUTE FUNCTION enforce_universal_dispatch_transition('trip_session');
    `);

    await queryRunner.query(buildRuleInserts('service_request', REQUEST_TRANSITIONS));
    await queryRunner.query(buildRuleInserts('dispatch_offer', OFFER_TRANSITIONS));
    await queryRunner.query(buildRuleInserts('dispatch_unit', DISPATCH_UNIT_TRANSITIONS));
    await queryRunner.query(buildRuleInserts('dispatch_assignment', ASSIGNMENT_TRANSITIONS));
    await queryRunner.query(buildRuleInserts('trip_session', TRIP_TRANSITIONS));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'sqljs') {
      await queryRunner.query(`
        DROP TRIGGER IF EXISTS trg_universal_service_request_transition ON "universal_service_requests";
        DROP TRIGGER IF EXISTS trg_universal_dispatch_offer_transition ON "universal_dispatch_offers";
        DROP TRIGGER IF EXISTS trg_universal_dispatch_unit_transition ON "universal_dispatch_units";
        DROP TRIGGER IF EXISTS trg_universal_dispatch_assignment_transition ON "universal_dispatch_assignments";
        DROP TRIGGER IF EXISTS trg_universal_trip_session_transition ON "universal_trip_sessions";
        DROP FUNCTION IF EXISTS enforce_universal_dispatch_transition();
        DROP TABLE IF EXISTS "universal_dispatch_transition_rules";
        DROP INDEX IF EXISTS "IDX_ud_assignment_active_unit";
      `);
    }

    await queryRunner.query(`
      DROP TABLE IF EXISTS "state_transition_logs";
      ALTER TABLE "universal_service_requests" DROP COLUMN IF EXISTS "previousStatus";
      ALTER TABLE "universal_dispatch_offers" DROP COLUMN IF EXISTS "previousStatus";
      ALTER TABLE "universal_dispatch_units" DROP COLUMN IF EXISTS "previousStatus";
      ALTER TABLE "universal_dispatch_assignments" DROP COLUMN IF EXISTS "previousStatus";
      ALTER TABLE "universal_trip_sessions" DROP COLUMN IF EXISTS "previousStatus";
    `);
  }
}
