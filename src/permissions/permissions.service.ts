import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipStatus, OrganizationMemberRole, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { Organization, OrganizationMember } from '../database/entities';
import { ALL_PERMISSIONS_WILDCARD, ORGANIZATION_ROLE_PERMISSIONS, Permission } from './permission.registry';

export interface TenantContext {
  activeOrganizationId?: string;
  permissions: Permission[];
  isPlatformAdmin: boolean;
  membership?: OrganizationMember;
}

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(OrganizationMember) private readonly members: Repository<OrganizationMember>,
  ) {}

  /**
   * Resolve the caller's active tenant context. Platform admins bypass
   * membership checks. Non-admins must be active members of the resolved
   * organization; if they are not, a ForbiddenException is thrown.
   */
  async resolveContext(user: AuthUser, requestedOrganizationId?: string): Promise<TenantContext> {
    if (user.role === UserRole.ADMIN) {
      return {
        activeOrganizationId: requestedOrganizationId,
        permissions: [ALL_PERMISSIONS_WILDCARD],
        isPlatformAdmin: true,
      };
    }

    const organizationId = requestedOrganizationId ?? user.organizationId;
    if (!organizationId) {
      return { activeOrganizationId: undefined, permissions: [], isPlatformAdmin: false };
    }

    const organization = await this.organizations.findOne({ where: { id: organizationId } });
    if (!organization) throw new ForbiddenException('Organization not found');

    const membership = await this.members.findOne({
      where: { organizationId, userId: user.id, status: MembershipStatus.ACTIVE },
    });
    if (!membership) {
      throw new ForbiddenException('You are not an active member of this organization');
    }

    return {
      activeOrganizationId: organizationId,
      permissions: this.getEffectivePermissions(membership),
      isPlatformAdmin: false,
      membership,
    };
  }

  /**
   * Effective permissions = default grants for the member's role plus any
   * explicit overrides stored on the membership. Wildcard '*' grants all.
   */
  getEffectivePermissions(membership: OrganizationMember): Permission[] {
    if (membership.permissions?.includes(ALL_PERMISSIONS_WILDCARD)) {
      return [ALL_PERMISSIONS_WILDCARD];
    }

    const defaults = ORGANIZATION_ROLE_PERMISSIONS[membership.role] ?? [];
    const explicit = (membership.permissions ?? []).filter((p): p is Permission => !!p);
    const set = new Set([...defaults, ...explicit]);
    return Array.from(set);
  }

  hasPermission(user: AuthUser, permission: Permission): boolean {
    if (user.isPlatformAdmin) return true;
    if (!user.permissions?.length) return false;
    if (user.permissions.includes(ALL_PERMISSIONS_WILDCARD)) return true;
    return user.permissions.includes(permission);
  }

  hasAllPermissions(user: AuthUser, permissions: Permission[]): boolean {
    if (user.isPlatformAdmin) return true;
    if (!user.permissions?.length) return permissions.length === 0;
    if (user.permissions.includes(ALL_PERMISSIONS_WILDCARD)) return true;
    return permissions.every((p) => user.permissions!.includes(p));
  }

  /**
   * Convenience helper used by existing organization flows that still check
   * OrganizationMemberRole. Returns the membership and enforces the requested
   * organization roles when provided.
   */
  async assertOrganizationAccess(
    user: AuthUser,
    organizationId: string,
    roles?: OrganizationMemberRole[],
  ): Promise<OrganizationMember | undefined> {
    const organization = await this.organizations.findOne({ where: { id: organizationId } });
    if (!organization) throw new ForbiddenException('Organization not found');
    if (user.role === UserRole.ADMIN) return undefined;

    const membership = await this.members.findOne({
      where: { organizationId, userId: user.id, status: MembershipStatus.ACTIVE },
    });
    if (!membership) {
      throw new ForbiddenException('You are not an active member of this organization');
    }
    if (roles?.length && !roles.includes(membership.role)) {
      throw new ForbiddenException('Your organization role does not permit this action');
    }
    return membership;
  }
}
