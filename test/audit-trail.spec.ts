import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
let dataSource: DataSource = undefined as unknown as DataSource;
import { AuditModule } from '../src/audit/audit.module';
import { AuditService } from '../src/audit/audit.service';
import { AuditLog } from '../src/database/entities';
import { DatabaseModule } from '../src/database/database.module';
import { ENTITIES, Organization, User } from '../src/database/entities';
import { GovernanceModule } from '../src/governance/governance.module';
import { GovernanceService } from '../src/governance/governance.service';
import { OrganizationsModule } from '../src/organizations/organizations.module';
import { OrganizationsService } from '../src/organizations/organizations.service';
import { UserRole } from '../src/common/enums';

describe('Hardened audit trail', () => {
  let app: INestApplication;
  let auditService: AuditService;
  let organizationsService: OrganizationsService;
  let governanceService: GovernanceService;
  let audits: Repository<AuditLog>;
  let users: Repository<User>;
  let organizations: Repository<Organization>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        TypeOrmModule.forRoot({
          type: 'sqljs',
          location: ':memory:',
          synchronize: true,
          entities: [...ENTITIES],
          logging: false,
        }),
        AuditModule,
        OrganizationsModule,
        GovernanceModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    auditService = app.get(AuditService);
    organizationsService = app.get(OrganizationsService);
    governanceService = app.get(GovernanceService);

    dataSource = app.get(DataSource);
    audits = dataSource.getRepository(AuditLog);
    users = dataSource.getRepository(User);
    organizations = dataSource.getRepository(Organization);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM audit_logs');
    await dataSource.query('DELETE FROM feature_flags');
    await dataSource.query('DELETE FROM organization_members');
    await dataSource.query('DELETE FROM organizations');
    await dataSource.query('DELETE FROM users');
  });

  async function seedUser(id: string): Promise<User> {
    const existing = await users.findOne({ where: { id } });
    if (existing) return existing;
    return users.save(
      users.create({
        id,
        email: `${id}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.CUSTOMER,
        status: 'ACTIVE' as never,
        passwordHash: 'hash',
      }),
    );
  }

  async function waitForAudit(
    action: string,
    entityId?: string,
    timeoutMs = 2000,
  ): Promise<AuditLog | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const query: Record<string, unknown> = { action };
      if (entityId) query.entityId = entityId;
      const found = await audits.findOne({ where: query, order: { createdAt: 'DESC' } });
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  it('records and verifies an audit entry from a service call', async () => {
    const audit = await auditService.record({
      actorUserId: 'user-1',
      action: 'TEST_ACTION',
      entityType: 'TestEntity',
      entityId: 'entity-1',
      after: { value: 42 },
    });

    expect(audit.checksum).toBeTruthy();

    const result = await auditService.verify(audit.id);
    expect(result.valid).toBe(true);
    expect(result.audit).not.toBeNull();
  });

  it('detects tampering when the checksum does not match', async () => {
    const audit = await auditService.record({
      action: 'TAMPER_TEST',
      entityType: 'TestEntity',
      entityId: 'entity-2',
      after: { value: 1 },
    });

    await audits.update(audit.id, { checksum: 'invalid-checksum' });

    const result = await auditService.verify(audit.id);
    expect(result.valid).toBe(false);
  });

  it('computes changed fields for update operations', async () => {
    const owner = await seedUser('audit-org-owner');
    const organization = await organizationsService.create(owner, {
      name: 'Audit Org',
      type: 'FLEET_PARTNER' as never,
    });

    const createLog = await waitForAudit('ORGANIZATION_CREATED', organization.id);
    expect(createLog).toBeTruthy();
    expect(createLog!.changedFields == null).toBe(true);

    await organizationsService.update(owner, organization.id, { name: 'Audit Org Updated' });

    const updateLog = await waitForAudit('ORGANIZATION_UPDATED', organization.id);
    expect(updateLog).toBeTruthy();
    expect(updateLog!.changedFields).toContain('name');

    const verifyResult = await auditService.verify(updateLog!.id);
    expect(verifyResult.valid).toBe(true);
  });

  it('records governance changes with actor attribution', async () => {
    const flag = await governanceService.upsertFlag('admin-1', {
      key: 'audit-flag',
      enabled: true,
    });

    const createLog = await waitForAudit('FEATURE_FLAG_CREATED', `${flag.key}:${flag.scope}`);
    expect(createLog).toBeTruthy();
    expect(createLog!.actorUserId).toBe('admin-1');

    await governanceService.upsertFlag('admin-1', {
      key: 'audit-flag',
      enabled: false,
    });

    const updateLog = await waitForAudit('FEATURE_FLAG_UPDATED', `${flag.key}:${flag.scope}`);
    expect(updateLog).toBeTruthy();
    expect(updateLog!.changedFields).toContain('enabled');
  });
});
