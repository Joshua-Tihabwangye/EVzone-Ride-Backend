import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AuditLog } from '../../src/database/entities';
import { DatabaseModule } from '../../src/database/database.module';
import { ENTITIES, Organization, OrganizationMember, User } from '../../src/database/entities';
import { OrganizationsModule } from '../../src/organizations/organizations.module';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { PermissionsModule } from '../../src/permissions/permissions.module';
import { PermissionsService } from '../../src/permissions/permissions.service';
import { OrganizationMemberRole, OrganizationStatus, UserRole } from '../../src/common/enums';

describe('Month 2 integration: tenant permissions', () => {
  let app: INestApplication;
  let organizationsService: OrganizationsService;
  let permissionsService: PermissionsService;
  let users: Repository<User>;
  let members: Repository<OrganizationMember>;
  let audits: Repository<AuditLog>;
  let dataSource: DataSource;

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
        OrganizationsModule,
        PermissionsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    organizationsService = app.get(OrganizationsService);
    permissionsService = app.get(PermissionsService);
    dataSource = app.get(DataSource);
    users = dataSource.getRepository(User);
    members = dataSource.getRepository(OrganizationMember);
    audits = dataSource.getRepository(AuditLog);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM audit_logs');
    await dataSource.query('DELETE FROM organization_members');
    await dataSource.query('DELETE FROM organizations');
    await dataSource.query('DELETE FROM users');
  });

  async function seedUser(id: string, role = UserRole.CUSTOMER): Promise<User> {
    return users.save(
      users.create({
        id,
        email: `${id}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        role,
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
      const where: Record<string, unknown> = { action };
      if (entityId) where.entityId = entityId;
      const found = await audits.findOne({ where, order: { createdAt: 'DESC' } });
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  it('enforces tenant isolation between organizations', async () => {
    const ownerA = await seedUser('tenant-owner-a');
    const ownerB = await seedUser('tenant-owner-b');

    const orgA = await organizationsService.create(ownerA, {
      name: 'Tenant A',
      type: 'FLEET_PARTNER' as never,
    });
    const orgB = await organizationsService.create(ownerB, {
      name: 'Tenant B',
      type: 'FLEET_PARTNER' as never,
    });

    await expect(organizationsService.detail(ownerA, orgB.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(organizationsService.detail(ownerB, orgA.id)).rejects.toBeInstanceOf(ForbiddenException);

    const detailA = await organizationsService.detail(ownerA, orgA.id);
    expect(detailA.id).toBe(orgA.id);
  });

  it('audits organization membership lifecycle', async () => {
    const owner = await seedUser('tenant-owner');
    const invited = await seedUser('tenant-invited');

    const organization = await organizationsService.create(owner, {
      name: 'Tenant Org',
      type: 'FLEET_PARTNER' as never,
    });

    const createLog = await waitForAudit('ORGANIZATION_CREATED', organization.id);
    expect(createLog).toBeTruthy();

    const invitation = await organizationsService.invite(owner, organization.id, {
      userId: invited.id,
      role: OrganizationMemberRole.DISPATCH_MANAGER,
    });

    const inviteLog = await waitForAudit('ORGANIZATION_MEMBER_INVITED', invitation.id);
    expect(inviteLog).toBeTruthy();
    expect(inviteLog!.after).toMatchObject({ role: OrganizationMemberRole.DISPATCH_MANAGER });

    const accepted = await organizationsService.acceptInvitation(invited, organization.id);
    const acceptLog = await waitForAudit('ORGANIZATION_MEMBER_ACCEPTED', accepted.id);
    expect(acceptLog).toBeTruthy();
    expect(acceptLog!.changedFields).toContain('status');

    const updated = await organizationsService.updateMember(owner, organization.id, accepted.id, {
      role: OrganizationMemberRole.FLEET_MANAGER,
    });
    const updateLog = await waitForAudit('ORGANIZATION_MEMBER_UPDATED', updated.id);
    expect(updateLog).toBeTruthy();
    expect(updateLog!.changedFields).toContain('role');

    const reviewed = await organizationsService.adminReview('admin-1', organization.id, {
      status: OrganizationStatus.ACTIVE,
      reason: 'Approved during month-2 integration test',
    });
    const reviewLog = await waitForAudit('ORGANIZATION_REVIEWED', reviewed.id);
    expect(reviewLog).toBeTruthy();
    expect(reviewLog!.reason).toBe('Approved during month-2 integration test');
  });

  it('grants and verifies organization permissions', async () => {
    const owner = await seedUser('perm-owner');
    const member = await seedUser('perm-member');

    const organization = await organizationsService.create(owner, {
      name: 'Permission Org',
      type: 'FLEET_PARTNER' as never,
    });

    const invitation = await organizationsService.invite(owner, organization.id, {
      userId: member.id,
      role: OrganizationMemberRole.DISPATCHER,
    });
    await organizationsService.acceptInvitation(member, organization.id);

    const membership = await members.findOne({
      where: { organizationId: organization.id, userId: member.id, status: 'ACTIVE' as never },
    });
    const perms = permissionsService.getEffectivePermissions(membership!);
    expect(perms).toContain('dispatch:read');
    expect(perms).not.toContain('fleet:vehicle:write');

    await organizationsService.updateMember(owner, organization.id, invitation.id, {
      role: OrganizationMemberRole.FLEET_MANAGER,
    });

    const updatedMembership = await members.findOne({
      where: { organizationId: organization.id, userId: member.id, status: 'ACTIVE' as never },
    });
    const updatedPerms = permissionsService.getEffectivePermissions(updatedMembership!);
    expect(updatedPerms).toContain('fleet:vehicle:write');
  });
});
