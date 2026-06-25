import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentPortalV71782172800000 implements MigrationInterface {
  name = 'AgentPortalV71782172800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    const agentProfileColumns: Array<[string, string]> = [
      ['portalRole', "varchar NOT NULL DEFAULT 'support_t1'"],
      ['teamId', 'varchar'],
      ['title', 'varchar'],
      ['department', 'varchar'],
      ['availabilityStatus', "varchar NOT NULL DEFAULT 'AVAILABLE'"],
      ['timezone', "varchar NOT NULL DEFAULT 'Africa/Kampala'"],
      ['language', "varchar NOT NULL DEFAULT 'en'"],
      ['permissions', 'text'],
      ['preferences', 'text'],
      ['trainingGateCompletedAt', 'timestamptz'],
      ['lastActiveAt', 'timestamptz'],
    ];
    for (const [name, definition] of agentProfileColumns) {
      await queryRunner.query(
        `ALTER TABLE "agent_profiles" ADD COLUMN IF NOT EXISTS "${name}" ${definition}`,
      );
    }
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_profiles_team" ON "agent_profiles" ("teamId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_teams" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "organizationId" uuid NOT NULL,
        "name" varchar NOT NULL,
        "description" text,
        "supervisorUserId" uuid,
        "queueTypes" text,
        "serviceCapabilities" text,
        "memberUserIds" text,
        "active" boolean NOT NULL DEFAULT true,
        "metadata" text
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_teams_organization_name" ON "agent_teams" ("organizationId", "name")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_teams_organization" ON "agent_teams" ("organizationId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_role_definitions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "organizationId" uuid NOT NULL,
        "name" varchar NOT NULL,
        "description" text,
        "color" varchar NOT NULL DEFAULT '#03cd8c',
        "isSystem" boolean NOT NULL DEFAULT false,
        "active" boolean NOT NULL DEFAULT true,
        "permissions" text NOT NULL,
        "metadata" text
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_roles_organization_name" ON "agent_role_definitions" ("organizationId", "name")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_tasks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "organizationId" uuid NOT NULL,
        "assigneeUserId" uuid,
        "createdByUserId" uuid NOT NULL,
        "title" varchar NOT NULL,
        "description" text,
        "category" varchar NOT NULL DEFAULT 'GENERAL',
        "status" varchar NOT NULL DEFAULT 'OPEN',
        "priority" varchar NOT NULL DEFAULT 'NORMAL',
        "dueAt" timestamptz,
        "completedAt" timestamptz,
        "relatedType" varchar,
        "relatedId" varchar,
        "tags" text,
        "metadata" text
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_tasks_org_status" ON "agent_tasks" ("organizationId", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_tasks_assignee" ON "agent_tasks" ("assigneeUserId", "status")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_drafts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "organizationId" uuid NOT NULL,
        "agentUserId" uuid NOT NULL,
        "draftType" varchar NOT NULL,
        "title" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "lastStep" varchar,
        "payload" text NOT NULL,
        "expiresAt" timestamptz
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_drafts_owner_type" ON "agent_drafts" ("organizationId", "agentUserId", "draftType")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_qa_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "organizationId" uuid NOT NULL,
        "agentUserId" uuid NOT NULL,
        "reviewerUserId" uuid,
        "interactionType" varchar NOT NULL DEFAULT 'SUPPORT',
        "referenceType" varchar,
        "referenceId" varchar,
        "status" varchar NOT NULL DEFAULT 'PENDING',
        "score" numeric(5,2),
        "rubric" text,
        "feedback" text,
        "coachingPlan" text,
        "reviewedAt" timestamptz
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_qa_org_agent" ON "agent_qa_reviews" ("organizationId", "agentUserId", "status")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_training_modules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "code" varchar NOT NULL,
        "title" varchar NOT NULL,
        "description" text NOT NULL,
        "mediaUrl" varchar,
        "sequence" integer NOT NULL DEFAULT 0,
        "passingScore" integer NOT NULL DEFAULT 80,
        "roleScopes" text,
        "content" text,
        "quiz" text,
        "required" boolean NOT NULL DEFAULT true,
        "active" boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_training_code" ON "agent_training_modules" ("code")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_training_progress" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "agentUserId" uuid NOT NULL,
        "moduleId" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'NOT_STARTED',
        "progressPercent" integer NOT NULL DEFAULT 0,
        "score" integer NOT NULL DEFAULT 0,
        "attempts" integer NOT NULL DEFAULT 0,
        "answers" text,
        "startedAt" timestamptz,
        "completedAt" timestamptz,
        "certificateNumber" varchar,
        "certificateUrl" varchar
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_training_progress_user_module" ON "agent_training_progress" ("agentUserId", "moduleId")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_shift_plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "organizationId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "teamId" uuid,
        "timezone" varchar NOT NULL DEFAULT 'Africa/Kampala',
        "startsAt" timestamptz NOT NULL,
        "endsAt" timestamptz NOT NULL,
        "status" varchar NOT NULL DEFAULT 'SCHEDULED',
        "recurrence" text,
        "breaks" text,
        "checkedInAt" timestamptz,
        "checkedOutAt" timestamptz
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_agent_shifts_org_user" ON "agent_shift_plans" ("organizationId", "userId", "startsAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    for (const table of [
      'agent_shift_plans',
      'agent_training_progress',
      'agent_training_modules',
      'agent_qa_reviews',
      'agent_drafts',
      'agent_tasks',
      'agent_role_definitions',
      'agent_teams',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_agent_profiles_team"');
    for (const column of [
      'lastActiveAt',
      'trainingGateCompletedAt',
      'preferences',
      'permissions',
      'language',
      'timezone',
      'availabilityStatus',
      'department',
      'title',
      'teamId',
      'portalRole',
    ]) {
      await queryRunner.query(`ALTER TABLE "agent_profiles" DROP COLUMN IF EXISTS "${column}"`);
    }
  }
}
