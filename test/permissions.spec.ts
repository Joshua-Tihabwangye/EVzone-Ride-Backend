import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { PermissionGuard } from '../src/permissions/permission.guard';
import { PermissionsService } from '../src/permissions/permissions.service';
import { Permission, RequirePermission } from '../src/permissions';
import { TenantScopeHelper } from '../src/permissions/tenant-scope.helper';
import { ACTIVE_ORGANIZATION_HEADER } from '../src/permissions/tenant-context.interceptor';
import { ENTITIES } from '../src/database/entities';
import {
  MembershipStatus,
  OrganizationMemberRole,
  OrganizationStatus,
  OrganizationType,
  UserRole,
} from '../src/common/enums';
import { Organization, OrganizationMember, User } from '../src/database/entities';
import { AuthUser } from '../src/common/interfaces';

function createMockContext(user?: AuthUser, organizationHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        headers: organizationHeader ? { [ACTIVE_ORGANIZATION_HEADER]: organizationHeader } : {},
      }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('Permissions infrastructure', () => {
  let db: DataSource;
  let permissionsService: PermissionsService;
  let organizations: Repository<Organization>;
  let members: Repository<OrganizationMember>;
  let users: Repository<User>;

  beforeAll(async () => {
    db = new DataSource({
      type: 'sqljs',
      location: ':memory:',
      synchronize: true,
      entities: [...ENTITIES],
      logging: false,
    });
    await db.initialize();
    organizations = db.getRepository(Organization);
    members = db.getRepository(OrganizationMember);
    users = db.getRepository(User);
    permissionsService = new PermissionsService(organizations, members);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  async function seedUser(id: string, role = UserRole.CUSTOMER) {
    const existing = await users.findOne({ where: { id } });
    if (existing) return existing;
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

  async function seedOrganization(owner: User) {
    const organization = await organizations.save(
      organizations.create({
        name: 'Test Org',
        type: OrganizationType.FLEET_PARTNER,
        status: OrganizationStatus.ACTIVE,
        code: `ORG-${Date.now()}`,
        primaryOwnerUserId: owner.id,
      }),
    );
    await members.save(
      members.create({
        organizationId: organization.id,
        userId: owner.id,
        role: OrganizationMemberRole.OWNER,
        status: MembershipStatus.ACTIVE,
        permissions: [],
      }),
    );
    return organization;
  }

  async function addMember(
    organizationId: string,
    userId: string,
    role: OrganizationMemberRole,
    permissions?: string[],
  ) {
    return members.save(
      members.create({
        organizationId,
        userId,
        role,
        status: MembershipStatus.ACTIVE,
        permissions,
      }),
    );
  }

  describe('PermissionsService.resolveContext', () => {
    it('platform admin bypasses membership checks and gets wildcard permissions', async () => {
      const ctx = await permissionsService.resolveContext(
        { id: 'admin_1', role: UserRole.ADMIN, firstName: 'Admin', lastName: 'User' },
        'any-org',
      );
      expect(ctx.isPlatformAdmin).toBe(true);
      expect(ctx.permissions).toContain('*');
    });

    it('resolves active membership and effective role permissions', async () => {
      const user = await seedUser('member_1');
      const owner = await seedUser('owner_1');
      const organization = await seedOrganization(owner);
      await addMember(organization.id, user.id, OrganizationMemberRole.FINANCE);

      const ctx = await permissionsService.resolveContext(
        { id: user.id, role: UserRole.CUSTOMER, firstName: user.firstName, lastName: user.lastName },
        organization.id,
      );

      expect(ctx.activeOrganizationId).toBe(organization.id);
      expect(ctx.permissions).toContain(Permission.FINANCE_CASHOUT_READ);
      expect(ctx.permissions).toContain(Permission.FINANCE_PAYOUT_READ);
      expect(ctx.permissions).not.toContain(Permission.FLEET_DRIVER_WRITE);
    });

    it('merges explicit permissions on top of role defaults', async () => {
      const user = await seedUser('member_2');
      const owner = await seedUser('owner_2');
      const organization = await seedOrganization(owner);
      await addMember(organization.id, user.id, OrganizationMemberRole.VIEWER, [
        Permission.FLEET_DRIVER_WRITE,
      ]);

      const ctx = await permissionsService.resolveContext(
        { id: user.id, role: UserRole.CUSTOMER, firstName: user.firstName, lastName: user.lastName },
        organization.id,
      );

      expect(ctx.permissions).toContain(Permission.ORGANIZATION_READ);
      expect(ctx.permissions).toContain(Permission.FLEET_DRIVER_WRITE);
    });

    it('wildcard permission grants all permissions', async () => {
      const user = await seedUser('member_3');
      const owner = await seedUser('owner_3');
      const organization = await seedOrganization(owner);
      await addMember(organization.id, user.id, OrganizationMemberRole.VIEWER, ['*']);

      const ctx = await permissionsService.resolveContext(
        { id: user.id, role: UserRole.CUSTOMER, firstName: user.firstName, lastName: user.lastName },
        organization.id,
      );

      expect(ctx.permissions).toContain('*');
    });

    it('throws when non-admin user is not an active member', async () => {
      const user = await seedUser('outsider_1');
      const owner = await seedUser('owner_4');
      const organization = await seedOrganization(owner);

      await expect(
        permissionsService.resolveContext(
          { id: user.id, role: UserRole.CUSTOMER, firstName: user.firstName, lastName: user.lastName },
          organization.id,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('PermissionGuard', () => {
    it('allows requests with no permission metadata', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [PermissionGuard, Reflector],
      }).compile();
      const guard = moduleRef.get(PermissionGuard);
      const context = createMockContext({
        id: 'u1',
        role: UserRole.CUSTOMER,
        firstName: 'Test',
        lastName: 'User',
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows platform admin regardless of metadata', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [PermissionGuard, Reflector],
      }).compile();
      const guard = moduleRef.get(PermissionGuard);

      class ProtectedHandler {
        @RequirePermission(Permission.FLEET_DRIVER_WRITE)
        handler() {}
      }

      const context = {
        ...createMockContext({ id: 'admin', role: UserRole.ADMIN, firstName: 'A', lastName: 'B' }),
        getHandler: () => ProtectedHandler.prototype.handler,
        getClass: () => ProtectedHandler,
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('denies when user lacks the required permission', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [PermissionGuard, Reflector],
      }).compile();
      const guard = moduleRef.get(PermissionGuard);

      class ProtectedHandler {
        @RequirePermission(Permission.FLEET_DRIVER_WRITE)
        handler() {}
      }

      const context = {
        ...createMockContext({
          id: 'u1',
          role: UserRole.CUSTOMER,
          firstName: 'Test',
          lastName: 'User',
          activeOrganizationId: 'org-1',
          permissions: [Permission.ORGANIZATION_READ],
        }),
        getHandler: () => ProtectedHandler.prototype.handler,
        getClass: () => ProtectedHandler,
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('allows when user has the required permission', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [PermissionGuard, Reflector],
      }).compile();
      const guard = moduleRef.get(PermissionGuard);

      class ProtectedHandler {
        @RequirePermission(Permission.FLEET_DRIVER_WRITE)
        handler() {}
      }

      const context = {
        ...createMockContext({
          id: 'u1',
          role: UserRole.CUSTOMER,
          firstName: 'Test',
          lastName: 'User',
          activeOrganizationId: 'org-1',
          permissions: [Permission.FLEET_DRIVER_WRITE],
        }),
        getHandler: () => ProtectedHandler.prototype.handler,
        getClass: () => ProtectedHandler,
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('TenantScopeHelper', () => {
    it('adds organizationId filter to a query builder', async () => {
      const repo = db.getRepository(User);
      const qb = repo.createQueryBuilder('user');
      const scoped = TenantScopeHelper.applyTenantScope(qb, 'user', 'org-1', false);
      const sql = scoped.getSql();
      expect(sql).toContain('user.organizationId =');
    });

    it('leaves query builder unchanged for platform admin', () => {
      const repo = db.getRepository(User);
      const qb = repo.createQueryBuilder('user');
      const scoped = TenantScopeHelper.applyTenantScope(qb, 'user', 'org-1', true);
      expect(scoped.getSql()).not.toContain('organizationId');
    });

    it('adds organizationId to find options', () => {
      const where = TenantScopeHelper.withOrganizationId({ status: 'ACTIVE' as never }, 'org-1', false);
      expect(where).toEqual({ status: 'ACTIVE', organizationId: 'org-1' });
    });

    it('leaves find options unchanged when organizationId is missing', () => {
      const where = TenantScopeHelper.withOrganizationId({ status: 'ACTIVE' as never }, undefined, false);
      expect(where).toEqual({ status: 'ACTIVE' });
    });
  });
});
