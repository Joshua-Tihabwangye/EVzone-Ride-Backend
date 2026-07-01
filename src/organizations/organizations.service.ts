import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { MembershipStatus, OrganizationMemberRole, OrganizationStatus, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { Organization, OrganizationMember, User } from '../database/entities';
import {
  CreateOrganizationDto,
  InviteOrganizationMemberDto,
  OrganizationQueryDto,
  ReviewOrganizationDto,
  UpdateOrganizationDto,
  UpdateOrganizationMemberDto,
} from './organizations.dto';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(OrganizationMember) private readonly members: Repository<OrganizationMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async create(owner: AuthUser, dto: CreateOrganizationDto) {
    const prefix =
      dto.name
        .replace(/[^a-zA-Z0-9]+/g, '')
        .slice(0, 6)
        .toUpperCase() || 'EVZONE';
    const organization = await this.organizations.save(
      this.organizations.create({
        ...dto,
        code: `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`,
        primaryOwnerUserId: owner.id,
        status: OrganizationStatus.PENDING,
        countryCode: dto.countryCode ?? 'UG',
        timezone: dto.timezone ?? 'Africa/Kampala',
        currency: dto.currency ?? 'UGX',
      }),
    );
    await this.members.save(
      this.members.create({
        organizationId: organization.id,
        userId: owner.id,
        role: OrganizationMemberRole.OWNER,
        status: MembershipStatus.ACTIVE,
        invitedByUserId: owner.id,
        invitedAt: new Date(),
        joinedAt: new Date(),
        permissions: ['*'],
      }),
    );
    void this.auditService
      .record({
        actorUserId: owner.id,
        action: 'ORGANIZATION_CREATED',
        entityType: 'Organization',
        entityId: organization.id,
        after: {
          organization,
          membership: { role: OrganizationMemberRole.OWNER, status: MembershipStatus.ACTIVE },
        },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return this.detail(owner, organization.id);
  }

  async mine(user: AuthUser) {
    if (user.role === UserRole.ADMIN) {
      return this.organizations.find({ order: { createdAt: 'DESC' } });
    }
    const memberships = await this.members.find({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
    if (!memberships.length) return [];
    const ids = memberships.map((member) => member.organizationId);
    const organizations = await this.organizations
      .createQueryBuilder('organization')
      .where('organization.id IN (:...ids)', { ids })
      .orderBy('organization.createdAt', 'DESC')
      .getMany();
    const membershipByOrganization = new Map(memberships.map((item) => [item.organizationId, item]));
    return organizations.map((organization) => ({
      ...organization,
      membership: membershipByOrganization.get(organization.id),
    }));
  }

  async detail(user: AuthUser, id: string) {
    await this.assertAccess(user, id);
    const organization = await this.organizations.findOne({ where: { id } });
    if (!organization) throw new NotFoundException('Organization not found');
    const [memberCount, activeMemberCount] = await Promise.all([
      this.members.count({ where: { organizationId: id } }),
      this.members.count({ where: { organizationId: id, status: MembershipStatus.ACTIVE } }),
    ]);
    return { ...organization, memberCount, activeMemberCount };
  }

  async update(user: AuthUser, id: string, dto: UpdateOrganizationDto) {
    await this.assertAccess(user, id, [OrganizationMemberRole.OWNER, OrganizationMemberRole.ADMIN]);
    const organization = await this.organizations.findOne({ where: { id } });
    if (!organization) throw new NotFoundException('Organization not found');
    const before = { ...organization };
    Object.assign(organization, dto);
    const saved = await this.organizations.save(organization);
    void this.auditService
      .record({
        actorUserId: user.id,
        action: 'ORGANIZATION_UPDATED',
        entityType: 'Organization',
        entityId: saved.id,
        before,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async invite(user: AuthUser, id: string, dto: InviteOrganizationMemberDto) {
    await this.assertAccess(user, id, [OrganizationMemberRole.OWNER, OrganizationMemberRole.ADMIN]);
    const target = await this.resolveUser(dto);
    if (!target) throw new NotFoundException('The invited user must already have an EVzone account');
    let membership = await this.members.findOne({ where: { organizationId: id, userId: target.id } });
    if (membership?.status === MembershipStatus.ACTIVE) {
      throw new BadRequestException('User is already an active organization member');
    }
    const before = membership ? { ...membership } : null;
    membership = this.members.create({
      ...(membership ?? {}),
      organizationId: id,
      userId: target.id,
      role: dto.role,
      status: MembershipStatus.INVITED,
      invitedByUserId: user.id,
      invitedAt: new Date(),
      permissions: dto.permissions,
    });
    const saved = await this.members.save(membership);
    void this.auditService
      .record({
        actorUserId: user.id,
        action: 'ORGANIZATION_MEMBER_INVITED',
        entityType: 'OrganizationMember',
        entityId: saved.id,
        before: before ?? undefined,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async acceptInvitation(user: AuthUser, organizationId: string) {
    const membership = await this.members.findOne({
      where: { organizationId, userId: user.id, status: MembershipStatus.INVITED },
    });
    if (!membership) throw new NotFoundException('Invitation not found');
    const before = { ...membership };
    membership.status = MembershipStatus.ACTIVE;
    membership.joinedAt = new Date();
    const saved = await this.members.save(membership);
    void this.auditService
      .record({
        actorUserId: user.id,
        action: 'ORGANIZATION_MEMBER_ACCEPTED',
        entityType: 'OrganizationMember',
        entityId: saved.id,
        before,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async listMembers(user: AuthUser, organizationId: string) {
    await this.assertAccess(user, organizationId);
    const memberships = await this.members.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
    });
    const ids = memberships.map((item) => item.userId);
    const users = ids.length
      ? await this.users.createQueryBuilder('user').where('user.id IN (:...ids)', { ids }).getMany()
      : [];
    const userById = new Map(users.map((item) => [item.id, item]));
    return memberships.map((membership) => ({ ...membership, user: userById.get(membership.userId) }));
  }

  async updateMember(
    user: AuthUser,
    organizationId: string,
    memberId: string,
    dto: UpdateOrganizationMemberDto,
  ) {
    await this.assertAccess(user, organizationId, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
    ]);
    const membership = await this.members.findOne({ where: { id: memberId, organizationId } });
    if (!membership) throw new NotFoundException('Organization member not found');
    if (membership.role === OrganizationMemberRole.OWNER && membership.userId !== user.id) {
      throw new ForbiddenException('Only the owner can update their own owner membership');
    }
    if (dto.role === OrganizationMemberRole.OWNER && membership.role !== OrganizationMemberRole.OWNER) {
      throw new BadRequestException('Ownership transfer requires the dedicated ownership workflow');
    }
    const before = { ...membership };
    Object.assign(membership, dto);
    const saved = await this.members.save(membership);
    void this.auditService
      .record({
        actorUserId: user.id,
        action: 'ORGANIZATION_MEMBER_UPDATED',
        entityType: 'OrganizationMember',
        entityId: saved.id,
        before,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async removeMember(user: AuthUser, organizationId: string, memberId: string) {
    await this.assertAccess(user, organizationId, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
    ]);
    const membership = await this.members.findOne({ where: { id: memberId, organizationId } });
    if (!membership) throw new NotFoundException('Organization member not found');
    if (membership.role === OrganizationMemberRole.OWNER) {
      throw new BadRequestException('The primary owner cannot be removed');
    }
    const before = { ...membership };
    membership.status = MembershipStatus.REVOKED;
    const saved = await this.members.save(membership);
    void this.auditService
      .record({
        actorUserId: user.id,
        action: 'ORGANIZATION_MEMBER_REMOVED',
        entityType: 'OrganizationMember',
        entityId: saved.id,
        before,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async adminList(query: OrganizationQueryDto) {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const builder = this.organizations.createQueryBuilder('organization');
    if (query.type) builder.andWhere('organization.type = :type', { type: query.type });
    if (query.status) builder.andWhere('organization.status = :status', { status: query.status });
    if (query.search) {
      builder.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(organization.name) LIKE :search', { search: `%${query.search!.toLowerCase()}%` })
            .orWhere('LOWER(organization.code) LIKE :search', { search: `%${query.search!.toLowerCase()}%` });
        }),
      );
    }
    const [items, total] = await builder
      .orderBy('organization.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async adminReview(adminUserId: string, id: string, dto: ReviewOrganizationDto) {
    const organization = await this.organizations.findOne({ where: { id } });
    if (!organization) throw new NotFoundException('Organization not found');
    organization.status = dto.status;
    if (dto.status === OrganizationStatus.ACTIVE) {
      organization.approvedAt = new Date();
      organization.approvedByUserId = adminUserId;
    }
    const before = { ...organization };
    organization.settings = { ...(organization.settings ?? {}), reviewReason: dto.reason };
    const saved = await this.organizations.save(organization);
    void this.auditService
      .record({
        actorUserId: adminUserId,
        action: 'ORGANIZATION_REVIEWED',
        entityType: 'Organization',
        entityId: saved.id,
        before,
        after: { ...saved },
        reason: dto.reason,
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async assertAccess(
    user: AuthUser,
    organizationId: string,
    roles?: OrganizationMemberRole[],
  ): Promise<OrganizationMember | undefined> {
    const organization = await this.organizations.findOne({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organization not found');
    if (user.role === UserRole.ADMIN) return undefined;
    const membership = await this.members.findOne({
      where: { organizationId, userId: user.id, status: MembershipStatus.ACTIVE },
    });
    if (!membership) throw new ForbiddenException('You are not an active member of this organization');
    if (roles?.length && !roles.includes(membership.role)) {
      throw new ForbiddenException('Your organization role does not permit this action');
    }
    return membership;
  }

  private async resolveUser(dto: InviteOrganizationMemberDto) {
    if (dto.userId) return this.users.findOne({ where: { id: dto.userId } });
    if (dto.email) return this.users.findOne({ where: { email: dto.email.toLowerCase() } });
    if (dto.phone) return this.users.findOne({ where: { phone: dto.phone } });
    throw new BadRequestException('Provide userId, email or phone');
  }
}
