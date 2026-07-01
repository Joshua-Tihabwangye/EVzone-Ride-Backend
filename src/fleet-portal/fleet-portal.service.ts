import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { DataSource, In, Not } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CreateCashoutRequestDto } from '../financial-operations/financial-operations.dto';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { BusinessMetricsService } from '../observability/metrics/business-metrics.service';
import {
  AccountStatus,
  BookingStatus,
  DocumentStatus,
  DocumentType,
  DriverAvailabilityStatus,
  DriverVerificationStatus,
  EnergyType,
  FleetAssetStatus,
  FleetAssignmentStatus,
  MaintenanceStatus,
  MembershipStatus,
  NotificationType,
  OrganizationMemberRole,
  OrganizationStatus,
  PayoutStatus,
  ServiceType,
  SupportPriority,
  SupportTicketStatus,
  TrainingProgressStatus,
  UserRole,
  VehicleStatus,
  VehicleType,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { randomToken, sha256 } from '../common/utils/security';
import {
  AmbulanceRequest,
  AuditLog,
  DeliveryOrder,
  DriverProfile,
  EarningsLedger,
  FleetAssignment,
  FleetBranchRecord,
  FleetDriver,
  FleetMaintenanceRecord,
  FleetMemberInvitation,
  FleetPortalConfiguration,
  FleetPortalResource,
  FleetProfile,
  FleetRoleDefinition,
  FleetVehicle,
  Notification,
  Organization,
  OrganizationMember,
  Payout,
  RefreshToken,
  RentalBooking,
  Ride,
  ServiceReview,
  SupportTicket,
  TouristBooking,
  TrainingModule,
  TrainingProgress,
  User,
  Vehicle,
  VehicleAccessory,
  VehicleDocument,
  Wallet,
} from '../database/entities';
import {
  CreateFleetIncidentDto,
  CreateFleetPortalDispatchDto,
  CreateFleetPortalDriverDto,
  CreateFleetPortalVehicleDto,
  CreateFleetServiceOrderDto,
  FleetDateRangeQueryDto,
  FleetPortalListQueryDto,
  PatchFleetBranchDto,
  PatchFleetPortalDispatchDto,
  PatchFleetPortalDriverDto,
  PatchFleetPortalVehicleDto,
  PatchFleetServiceOrderDto,
  RequestFleetPayoutDto,
  UpdateFleetPortalProfileDto,
  UpsertFleetBranchDto,
} from './fleet-portal.dto';

export type FleetPortalContext = {
  organization: Organization;
  membership?: OrganizationMember;
  fleet: FleetProfile;
};

export type PortalEvent = {
  fleetId: string;
  event: string;
  data: unknown;
  aliases?: string[];
};

@Injectable()
export class FleetPortalService {
  private readonly logger = new Logger(FleetPortalService.name);

  constructor(
    private readonly db: DataSource,
    private readonly events: EventEmitter2,
    private readonly financialOperations: FinancialOperationsService,
    private readonly auditService: AuditService,
    private readonly businessMetrics: BusinessMetricsService,
  ) {}

  async context(user: AuthUser, organizationId?: string): Promise<FleetPortalContext> {
    organizationId = organizationId ?? user.organizationId;
    const organizations = this.db.getRepository(Organization);
    const memberships = this.db.getRepository(OrganizationMember);
    const fleets = this.db.getRepository(FleetProfile);

    let membership: OrganizationMember | null = null;
    if (organizationId) {
      const requestedId = organizationId;
      let selectedOrganization = await organizations.findOne({
        where: [{ id: requestedId }, { externalId: requestedId }, { code: requestedId }],
      });
      if (!selectedOrganization) {
        const selectedFleet = await fleets.findOne({
          where: [{ id: requestedId }, { code: requestedId }],
        });
        if (selectedFleet) {
          selectedOrganization = await organizations.findOne({
            where: { id: selectedFleet.organizationId },
          });
        }
      }
      organizationId = selectedOrganization?.id ?? requestedId;
      membership = await memberships.findOne({
        where: { organizationId, userId: user.id, status: MembershipStatus.ACTIVE },
      });
      if (!membership && user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('You do not have access to this fleet organization');
      }
    } else {
      membership = await memberships.findOne({
        where: { userId: user.id, status: MembershipStatus.ACTIVE },
        order: { createdAt: 'ASC' },
      });
      organizationId = membership?.organizationId;
    }

    if (!organizationId && user.role === UserRole.ADMIN) {
      const firstFleet = await fleets.findOne({ order: { createdAt: 'ASC' } });
      organizationId = firstFleet?.organizationId;
    }
    if (!organizationId)
      throw new NotFoundException('No active fleet organization is linked to this account');

    const [organization, fleet] = await Promise.all([
      organizations.findOne({ where: { id: organizationId } }),
      fleets.findOne({ where: { organizationId } }),
    ]);
    if (!organization) throw new NotFoundException('Fleet organization not found');
    if (!fleet) throw new NotFoundException('Fleet profile not found');
    if ([OrganizationStatus.SUSPENDED, OrganizationStatus.CLOSED].includes(organization.status)) {
      throw new ForbiddenException(`Fleet organization is ${organization.status.toLowerCase()}`);
    }
    return { organization, membership: membership ?? undefined, fleet };
  }

  async fleetIdsForUser(userId: string): Promise<string[]> {
    const memberships = await this.db.getRepository(OrganizationMember).find({
      where: { userId, status: MembershipStatus.ACTIVE },
    });
    if (!memberships.length) return [];
    const fleets = await this.db.getRepository(FleetProfile).find({
      where: { organizationId: In(memberships.map((item) => item.organizationId)) },
    });
    return fleets.map((item) => item.id);
  }

  async organizationsForUser(user: AuthUser) {
    if (user.role === UserRole.ADMIN) {
      const fleets = await this.db.getRepository(FleetProfile).find({ order: { createdAt: 'ASC' } });
      if (!fleets.length) return [];
      const organizations = await this.db.getRepository(Organization).find({
        where: { id: In(fleets.map((item) => item.organizationId)) },
      });
      const organizationById = new Map(organizations.map((item) => [item.id, item]));
      return fleets.map((fleet) => {
        const organization = organizationById.get(fleet.organizationId);
        return {
          id: organization?.id ?? fleet.organizationId,
          externalId: organization?.externalId ?? null,
          name: organization?.name ?? fleet.displayName,
          fleetId: fleet.id,
          fleetCode: fleet.code,
          role: OrganizationMemberRole.ADMIN,
          status: fleet.status,
        };
      });
    }

    const memberships = await this.db.getRepository(OrganizationMember).find({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });
    if (!memberships.length) return [];
    const organizations = await this.db.getRepository(Organization).find({
      where: { id: In(memberships.map((item) => item.organizationId)) },
    });
    const fleets = await this.db.getRepository(FleetProfile).find({
      where: { organizationId: In(memberships.map((item) => item.organizationId)) },
    });
    const organizationById = new Map(organizations.map((item) => [item.id, item]));
    const fleetByOrganizationId = new Map(fleets.map((item) => [item.organizationId, item]));
    return memberships
      .map((membership) => {
        const organization = organizationById.get(membership.organizationId);
        const fleet = fleetByOrganizationId.get(membership.organizationId);
        if (!organization || !fleet) return undefined;
        return {
          id: organization.id,
          externalId: organization.externalId ?? null,
          name: organization.name,
          fleetId: fleet.id,
          fleetCode: fleet.code,
          role: membership.role,
          status: fleet.status,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  }

  async profile(user: AuthUser, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const [branches, drivers, vehicles, dispatches] = await Promise.all([
      this.db.getRepository(FleetBranchRecord).count({ where: { fleetId: context.fleet.id } }),
      this.db.getRepository(FleetDriver).count({ where: { fleetId: context.fleet.id } }),
      this.db.getRepository(FleetVehicle).count({ where: { fleetId: context.fleet.id } }),
      this.db.getRepository(FleetAssignment).count({ where: { fleetId: context.fleet.id } }),
    ]);
    const settings = context.organization.settings ?? {};
    return {
      fleetAccountId: context.fleet.id,
      fleetId: context.fleet.id,
      id: context.organization.id,
      organizationId: context.organization.id,
      companyName: context.fleet.displayName,
      name: context.organization.name,
      code: context.fleet.code,
      contactEmail: context.organization.contactEmail ?? context.fleet.operationsEmail ?? null,
      contactPhone: context.organization.contactPhone ?? context.fleet.operationsPhone ?? null,
      registrationNumber: context.organization.registrationNumber ?? null,
      taxId: context.organization.taxIdentificationNumber ?? null,
      status: context.fleet.status,
      currency: context.organization.currency,
      monthlySpendLimit: this.numberValue(settings.monthlySpendLimit),
      dailySpendLimit: this.numberValue(settings.dailySpendLimit),
      serviceCapabilities: context.fleet.serviceCapabilities ?? [],
      metadata: settings,
      _count: { branches, drivers, vehicles, dispatches },
      createdAt: context.fleet.createdAt,
      updatedAt: context.fleet.updatedAt,
    };
  }

  async updateProfile(user: AuthUser, dto: UpdateFleetPortalProfileDto, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const organizations = this.db.getRepository(Organization);
    const fleets = this.db.getRepository(FleetProfile);

    if (dto.companyName || dto.name) {
      context.fleet.displayName = dto.companyName ?? dto.name ?? context.fleet.displayName;
      context.organization.name = dto.name ?? dto.companyName ?? context.organization.name;
    }
    if (dto.contactEmail !== undefined) {
      context.organization.contactEmail = dto.contactEmail;
      context.fleet.operationsEmail = dto.contactEmail;
    }
    if (dto.contactPhone !== undefined) {
      context.organization.contactPhone = dto.contactPhone;
      context.fleet.operationsPhone = dto.contactPhone;
    }
    if (dto.registrationNumber !== undefined)
      context.organization.registrationNumber = dto.registrationNumber;
    if (dto.taxId !== undefined) context.organization.taxIdentificationNumber = dto.taxId;
    if (dto.currency !== undefined) context.organization.currency = dto.currency.toUpperCase();
    if (dto.status && Object.values(OrganizationStatus).includes(dto.status as OrganizationStatus)) {
      context.organization.status = dto.status as OrganizationStatus;
      context.fleet.status = dto.status as OrganizationStatus;
    }
    context.organization.settings = {
      ...(context.organization.settings ?? {}),
      ...(dto.metadata ?? {}),
      ...(dto.monthlySpendLimit !== undefined ? { monthlySpendLimit: dto.monthlySpendLimit } : {}),
      ...(dto.dailySpendLimit !== undefined ? { dailySpendLimit: dto.dailySpendLimit } : {}),
    };
    await Promise.all([organizations.save(context.organization), fleets.save(context.fleet)]);
    await this.emit(context.fleet.id, 'fleet.profile.updated', { fleetId: context.fleet.id });
    return this.profile(user, context.organization.id);
  }

  async listBranches(user: AuthUser, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    return this.db.getRepository(FleetBranchRecord).find({
      where: { fleetId: fleet.id },
      order: { name: 'ASC' },
    });
  }

  async branch(user: AuthUser, id: string, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const branch = await this.db
      .getRepository(FleetBranchRecord)
      .findOne({ where: { id, fleetId: fleet.id } });
    if (!branch) throw new NotFoundException('Fleet branch not found');
    return branch;
  }

  async createBranch(user: AuthUser, dto: UpsertFleetBranchDto, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const repository = this.db.getRepository(FleetBranchRecord);
    const branch = await repository.save(
      repository.create({
        fleetId: context.fleet.id,
        code: `BR-${randomUUID().slice(0, 8).toUpperCase()}`,
        ...dto,
        status: dto.status?.toUpperCase() ?? 'ACTIVE',
        country: dto.country ?? context.organization.countryCode,
      }),
    );
    await this.emit(context.fleet.id, 'fleet.branch.created', branch);
    return branch;
  }

  async updateBranch(user: AuthUser, id: string, dto: PatchFleetBranchDto, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const repository = this.db.getRepository(FleetBranchRecord);
    const branch = await this.branch(user, id, context.organization.id);
    Object.assign(branch, dto, dto.status ? { status: dto.status.toUpperCase() } : {});
    const saved = await repository.save(branch);
    await this.emit(context.fleet.id, 'fleet.branch.updated', saved);
    return saved;
  }

  async deleteBranch(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const branch = await this.branch(user, id, context.organization.id);
    await this.db.getRepository(FleetBranchRecord).softRemove(branch);
    await this.emit(context.fleet.id, 'fleet.branch.deleted', { id });
    return { deleted: true, id };
  }

  async configuration(
    user: AuthUser,
    scope: string,
    defaults: Record<string, unknown>,
    organizationId?: string,
  ) {
    const { fleet } = await this.context(user, organizationId);
    const record = await this.db.getRepository(FleetPortalConfiguration).findOne({
      where: { fleetId: fleet.id, scope },
    });
    return { ...defaults, ...(record?.data ?? {}) };
  }

  async updateConfiguration(
    user: AuthUser,
    scope: string,
    patch: Record<string, unknown>,
    defaults: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const repository = this.db.getRepository(FleetPortalConfiguration);
    let record = await repository.findOne({ where: { fleetId: context.fleet.id, scope } });
    const current = { ...defaults, ...(record?.data ?? {}) };
    const merged = this.deepMerge(current, patch);
    if (!record) record = repository.create({ fleetId: context.fleet.id, scope, data: merged });
    record.data = merged;
    record.updatedByUserId = user.id;
    await repository.save(record);
    await this.emit(context.fleet.id, `fleet.${scope.toLowerCase()}.updated`, merged);
    return merged;
  }

  portalSettings(user: AuthUser, organizationId?: string) {
    return this.configuration(
      user,
      'PORTAL_SETTINGS',
      { language: 'en', timezone: 'Africa/Kampala', notifications: { email: true, sms: true, portal: true } },
      organizationId,
    );
  }

  updatePortalSettings(user: AuthUser, patch: Record<string, unknown>, organizationId?: string) {
    return this.updateConfiguration(
      user,
      'PORTAL_SETTINGS',
      patch,
      { language: 'en', timezone: 'Africa/Kampala', notifications: { email: true, sms: true, portal: true } },
      organizationId,
    );
  }

  async securitySettings(user: AuthUser, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const base = await this.configuration(
      user,
      'SECURITY',
      { twoFactorEnabled: false, loginAlerts: true, allowedIpRanges: [] },
      context.organization.id,
    );
    const members = await this.db.getRepository(OrganizationMember).find({
      where: { organizationId: context.organization.id, status: MembershipStatus.ACTIVE },
    });
    const tokens = members.length
      ? await this.db.getRepository(RefreshToken).find({
          where: { userId: In(members.map((item) => item.userId)) },
          order: { createdAt: 'DESC' },
          take: 50,
        })
      : [];
    return {
      ...base,
      sessions: tokens.map((token) => ({
        id: token.id,
        userId: token.userId,
        userAgent: token.userAgent,
        ipAddress: token.ipAddress,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt,
        active: !token.revokedAt && token.expiresAt > new Date(),
      })),
    };
  }

  updateSecuritySettings(user: AuthUser, patch: Record<string, unknown>, organizationId?: string) {
    const safePatch = { ...patch };
    delete safePatch.sessions;
    return this.updateConfiguration(
      user,
      'SECURITY',
      safePatch,
      { twoFactorEnabled: false, loginAlerts: true, allowedIpRanges: [] },
      organizationId,
    );
  }

  integrations(user: AuthUser, organizationId?: string) {
    return this.configuration(
      user,
      'INTEGRATIONS',
      {
        integrations: [
          { key: 'corporate_pay', name: 'CorporatePay', status: 'available', enabled: false },
          { key: 'school_app', name: 'EVzone School', status: 'available', enabled: true },
          { key: 'maps', name: 'Maps & Geocoding', status: 'available', enabled: true },
        ],
      },
      organizationId,
    );
  }

  updateIntegrations(user: AuthUser, patch: Record<string, unknown>, organizationId?: string) {
    return this.updateConfiguration(user, 'INTEGRATIONS', patch, { integrations: [] }, organizationId);
  }

  async roles(user: AuthUser, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const repository = this.db.getRepository(FleetRoleDefinition);
    let roles = await repository.find({ where: { fleetId: context.fleet.id }, order: { createdAt: 'ASC' } });
    if (!roles.length) {
      roles = await repository.save([
        repository.create({
          fleetId: context.fleet.id,
          name: 'Fleet Owner',
          description: 'Full fleet administration access',
          color: '#03cd8c',
          isSystem: true,
          permissions: { all: true },
        }),
        repository.create({
          fleetId: context.fleet.id,
          name: 'Fleet Manager',
          description: 'Manage drivers, vehicles, services and reporting',
          color: '#f77f00',
          isSystem: true,
          permissions: { drivers: 'manage', vehicles: 'manage', services: 'manage', finance: 'view' },
        }),
        repository.create({
          fleetId: context.fleet.id,
          name: 'Dispatcher',
          description: 'Create and assign dispatches',
          color: '#a6a6a6',
          isSystem: true,
          permissions: { dispatches: 'manage', drivers: 'view', vehicles: 'view' },
        }),
        repository.create({
          fleetId: context.fleet.id,
          name: 'Finance',
          description: 'View statements, earnings and payouts',
          color: '#f2f2f2',
          isSystem: true,
          permissions: { finance: 'manage', fleet: 'view' },
        }),
      ]);
    }
    return { roles };
  }

  async updateRoles(user: AuthUser, patch: Record<string, unknown>, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context, [OrganizationMemberRole.OWNER, OrganizationMemberRole.ADMIN]);
    const incoming = Array.isArray(patch.roles) ? patch.roles : [];
    const repository = this.db.getRepository(FleetRoleDefinition);
    for (const raw of incoming) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const name = this.optionalString(item.name);
      if (!name) continue;
      const roleId = this.optionalString(item.id);
      let role = roleId
        ? await repository.findOne({ where: { id: roleId, fleetId: context.fleet.id } })
        : await repository.findOne({ where: { name, fleetId: context.fleet.id } });
      role ??= repository.create({ fleetId: context.fleet.id, name, permissions: {} });
      role.name = name;
      role.description = this.optionalString(item.description);
      role.color = this.optionalString(item.color) ?? role.color ?? '#03cd8c';
      role.active = item.active === undefined ? role.active : Boolean(item.active);
      role.permissions = this.objectValue(item.permissions);
      await repository.save(role);
    }
    await this.emit(context.fleet.id, 'fleet.roles.updated', { count: incoming.length });
    return this.roles(user, context.organization.id);
  }

  async listDrivers(user: AuthUser, query: FleetPortalListQueryDto = {}, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const links = await this.db.getRepository(FleetDriver).find({
      where: {
        fleetId: fleet.id,
        status: query.status ? this.fleetStatus(query.status) : Not(FleetAssetStatus.REMOVED),
      },
      order: { createdAt: 'DESC' },
    });
    if (!links.length) return [];
    const profiles = await this.db
      .getRepository(DriverProfile)
      .find({ where: { id: In(links.map((item) => item.driverId)) } });
    const users = profiles.length
      ? await this.db.getRepository(User).find({ where: { id: In(profiles.map((item) => item.userId)) } })
      : [];
    const profileById = new Map(profiles.map((item) => [item.id, item]));
    const userById = new Map(users.map((item) => [item.id, item]));
    const search = query.search?.trim().toLowerCase();
    return links
      .map((link) => {
        const profile = profileById.get(link.driverId);
        const account = profile ? userById.get(profile.userId) : undefined;
        return this.driverResponse(link, profile, account);
      })
      .filter(
        (item) =>
          !search ||
          `${item.displayName} ${item.email ?? ''} ${item.phone ?? ''}`.toLowerCase().includes(search),
      );
  }

  async driver(user: AuthUser, id: string, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const link = await this.db.getRepository(FleetDriver).findOne({ where: { id, fleetId: fleet.id } });
    if (!link) throw new NotFoundException('Fleet driver not found');
    const profile = await this.db.getRepository(DriverProfile).findOne({ where: { id: link.driverId } });
    const account = profile
      ? await this.db.getRepository(User).findOne({ where: { id: profile.userId } })
      : null;
    return this.driverResponse(link, profile ?? undefined, account ?? undefined);
  }

  async createDriver(user: AuthUser, dto: CreateFleetPortalDriverDto, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const users = this.db.getRepository(User);
    const profiles = this.db.getRepository(DriverProfile);
    const links = this.db.getRepository(FleetDriver);
    const wallets = this.db.getRepository(Wallet);

    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone?.trim();
    let account = email ? await users.findOne({ where: { email } }) : null;
    if (!account && phone) account = await users.findOne({ where: { phone } });
    const [firstName, ...lastParts] = dto.displayName.trim().split(/\s+/);
    if (!account) {
      account = await users.save(
        users.create({
          email,
          phone,
          firstName: firstName || 'Fleet',
          lastName: lastParts.join(' ') || 'Driver',
          passwordHash: await bcrypt.hash(randomToken(36), 12),
          role: UserRole.DRIVER,
          status: AccountStatus.ACTIVE,
          metadata: { invitedByFleetId: context.fleet.id },
        }),
      );
      await wallets.save(
        wallets.create({ userId: account.id, currency: context.organization.currency, availableBalance: 0 }),
      );
    }
    let profile = await profiles.findOne({ where: { userId: account.id } });
    if (!profile) {
      profile = await profiles.save(
        profiles.create({
          userId: account.id,
          verificationStatus: DriverVerificationStatus.PENDING,
          availabilityStatus: DriverAvailabilityStatus.OFFLINE,
          serviceCapabilities: dto.serviceCapabilities ?? context.fleet.serviceCapabilities ?? [],
        }),
      );
    }
    if (await links.findOne({ where: { fleetId: context.fleet.id, driverId: profile.id } })) {
      throw new ConflictException('Driver is already linked to this fleet');
    }
    const link = await links.save(
      links.create({
        fleetId: context.fleet.id,
        driverId: profile.id,
        status: this.fleetStatus(dto.status ?? 'ACTIVE'),
        serviceCapabilities: dto.serviceCapabilities ?? profile.serviceCapabilities ?? [],
        joinedAt: new Date(),
        metadata: dto.metadata,
      }),
    );
    await this.notify(
      account.id,
      'Fleet invitation',
      `You have been added to ${context.fleet.displayName}.`,
      {
        fleetId: context.fleet.id,
      },
    );
    const response = this.driverResponse(link, profile, account);
    await this.emit(context.fleet.id, 'fleet.driver.created', response, ['notification.new']);
    return response;
  }

  async updateDriver(user: AuthUser, id: string, dto: PatchFleetPortalDriverDto, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const links = this.db.getRepository(FleetDriver);
    const profiles = this.db.getRepository(DriverProfile);
    const users = this.db.getRepository(User);
    const link = await links.findOne({ where: { id, fleetId: context.fleet.id } });
    if (!link) throw new NotFoundException('Fleet driver not found');
    const profile = await profiles.findOne({ where: { id: link.driverId } });
    if (!profile) throw new NotFoundException('Driver profile not found');
    const account = await users.findOne({ where: { id: profile.userId } });
    if (!account) throw new NotFoundException('Driver account not found');
    if (dto.displayName) {
      const [firstName, ...rest] = dto.displayName.trim().split(/\s+/);
      account.firstName = firstName;
      account.lastName = rest.join(' ') || account.lastName;
    }
    if (dto.email !== undefined) account.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) account.phone = dto.phone.trim();
    if (dto.status !== undefined) link.status = this.fleetStatus(dto.status);
    if (dto.serviceCapabilities) {
      link.serviceCapabilities = dto.serviceCapabilities;
      profile.serviceCapabilities = dto.serviceCapabilities;
    }
    if (dto.metadata) link.metadata = { ...(link.metadata ?? {}), ...dto.metadata };
    await Promise.all([users.save(account), profiles.save(profile), links.save(link)]);
    const response = this.driverResponse(link, profile, account);
    await this.emit(context.fleet.id, 'fleet.driver.updated', response);
    return response;
  }

  async removeDriver(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const links = this.db.getRepository(FleetDriver);
    const link = await links.findOne({ where: { id, fleetId: context.fleet.id } });
    if (!link) throw new NotFoundException('Fleet driver not found');
    link.status = FleetAssetStatus.REMOVED;
    await links.save(link);
    await this.emit(context.fleet.id, 'fleet.driver.removed', { id });
    return { removed: true, id };
  }

  async listVehicles(user: AuthUser, query: FleetPortalListQueryDto = {}, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const links = await this.db.getRepository(FleetVehicle).find({
      where: {
        fleetId: fleet.id,
        status: query.status ? this.fleetStatus(query.status) : Not(FleetAssetStatus.REMOVED),
      },
      order: { createdAt: 'DESC' },
    });
    if (!links.length) return [];
    const vehicles = await this.db
      .getRepository(Vehicle)
      .find({ where: { id: In(links.map((item) => item.vehicleId)) } });
    const vehicleById = new Map(vehicles.map((item) => [item.id, item]));
    const search = query.search?.trim().toLowerCase();
    return links
      .map((link) => this.vehicleResponse(link, vehicleById.get(link.vehicleId)))
      .filter(
        (item) => !search || `${item.make} ${item.model} ${item.licensePlate}`.toLowerCase().includes(search),
      );
  }

  async vehicle(user: AuthUser, id: string, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const link = await this.db.getRepository(FleetVehicle).findOne({ where: { id, fleetId: fleet.id } });
    if (!link) throw new NotFoundException('Fleet vehicle not found');
    const vehicle = await this.db.getRepository(Vehicle).findOne({ where: { id: link.vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return this.vehicleResponse(link, vehicle);
  }

  async createVehicle(user: AuthUser, dto: CreateFleetPortalVehicleDto, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const vehicles = this.db.getRepository(Vehicle);
    const links = this.db.getRepository(FleetVehicle);
    const plate = dto.licensePlate.trim().toUpperCase();
    if (await vehicles.findOne({ where: { plateNumber: plate } }))
      throw new ConflictException('License plate already exists');
    const requestedVehicleStatus = dto.vehicleStatus ?? 'ACTIVE';
    const vehicle = await vehicles.save(
      vehicles.create({
        ownerUserId: user.id,
        make: dto.make.trim(),
        model: dto.model.trim(),
        year: dto.yearOfManufacture,
        plateNumber: plate,
        vehicleType: this.vehicleType(dto.bodyType),
        energyType: this.energyType(dto.powertrain),
        status: this.vehicleStatus(requestedVehicleStatus),
        color: dto.color,
        isActive: requestedVehicleStatus.toUpperCase() === 'ACTIVE',
        serviceCapabilities: dto.serviceCapabilities ?? context.fleet.serviceCapabilities ?? [],
        features: {
          vehicleName: dto.vehicleName,
          vin: dto.vin,
          countryOfRegistration: dto.countryOfRegistration,
          bodyType: dto.bodyType,
          powertrain: dto.powertrain,
          connectors: dto.connectors ?? [],
          batteryKwh: dto.batteryKwh,
          acMaxKw: dto.acMaxKw,
          dcMaxKw: dto.dcMaxKw,
          ...(dto.metadata ?? {}),
        },
      }),
    );
    const link = await links.save(
      links.create({
        fleetId: context.fleet.id,
        vehicleId: vehicle.id,
        status: this.fleetStatus(requestedVehicleStatus),
        serviceCapabilities: dto.serviceCapabilities ?? vehicle.serviceCapabilities ?? [],
        activatedAt: vehicle.isActive ? new Date() : undefined,
        metadata: dto.metadata,
      }),
    );
    const response = this.vehicleResponse(link, vehicle);
    await this.emit(context.fleet.id, 'fleet.vehicle.created', response, ['notification.new']);
    return response;
  }

  async updateVehicle(user: AuthUser, id: string, dto: PatchFleetPortalVehicleDto, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const links = this.db.getRepository(FleetVehicle);
    const vehicles = this.db.getRepository(Vehicle);
    const link = await links.findOne({ where: { id, fleetId: context.fleet.id } });
    if (!link) throw new NotFoundException('Fleet vehicle not found');
    const vehicle = await vehicles.findOne({ where: { id: link.vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (dto.make !== undefined) vehicle.make = dto.make;
    if (dto.model !== undefined) vehicle.model = dto.model;
    if (dto.yearOfManufacture !== undefined) vehicle.year = dto.yearOfManufacture;
    if (dto.licensePlate !== undefined) {
      const plate = dto.licensePlate.trim().toUpperCase();
      const duplicate = await vehicles.findOne({ where: { plateNumber: plate } });
      if (duplicate && duplicate.id !== vehicle.id)
        throw new ConflictException('License plate already exists');
      vehicle.plateNumber = plate;
    }
    if (dto.bodyType !== undefined) vehicle.vehicleType = this.vehicleType(dto.bodyType);
    if (dto.powertrain !== undefined) vehicle.energyType = this.energyType(dto.powertrain);
    if (dto.vehicleStatus !== undefined) {
      vehicle.status = this.vehicleStatus(dto.vehicleStatus);
      link.status = this.fleetStatus(dto.vehicleStatus);
      if (dto.isActive === undefined) vehicle.isActive = dto.vehicleStatus.trim().toUpperCase() === 'ACTIVE';
    }
    if (dto.isActive !== undefined) vehicle.isActive = dto.isActive;
    if (dto.color !== undefined) vehicle.color = dto.color;
    if (dto.serviceCapabilities) {
      vehicle.serviceCapabilities = dto.serviceCapabilities;
      link.serviceCapabilities = dto.serviceCapabilities;
    }
    vehicle.features = {
      ...(vehicle.features ?? {}),
      ...(dto.vehicleName !== undefined ? { vehicleName: dto.vehicleName } : {}),
      ...(dto.vin !== undefined ? { vin: dto.vin } : {}),
      ...(dto.countryOfRegistration !== undefined
        ? { countryOfRegistration: dto.countryOfRegistration }
        : {}),
      ...(dto.bodyType !== undefined ? { bodyType: dto.bodyType } : {}),
      ...(dto.powertrain !== undefined ? { powertrain: dto.powertrain } : {}),
      ...(dto.connectors !== undefined ? { connectors: dto.connectors } : {}),
      ...(dto.batteryKwh !== undefined ? { batteryKwh: dto.batteryKwh } : {}),
      ...(dto.acMaxKw !== undefined ? { acMaxKw: dto.acMaxKw } : {}),
      ...(dto.dcMaxKw !== undefined ? { dcMaxKw: dto.dcMaxKw } : {}),
      ...(dto.metadata ?? {}),
    };
    await Promise.all([vehicles.save(vehicle), links.save(link)]);
    const response = this.vehicleResponse(link, vehicle);
    await this.emit(context.fleet.id, 'fleet.vehicle.updated', response);
    return response;
  }

  async removeVehicle(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const links = this.db.getRepository(FleetVehicle);
    const link = await links.findOne({ where: { id, fleetId: context.fleet.id } });
    if (!link) throw new NotFoundException('Fleet vehicle not found');
    link.status = FleetAssetStatus.REMOVED;
    await links.save(link);
    await this.emit(context.fleet.id, 'fleet.vehicle.removed', { id });
    return { removed: true, id };
  }

  async listDispatches(user: AuthUser, query: FleetPortalListQueryDto = {}, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const assignments = await this.db.getRepository(FleetAssignment).find({
      where: { fleetId: fleet.id },
      order: { createdAt: 'DESC' },
      take: query.limit ?? 250,
    });
    return assignments
      .map((item) => this.dispatchResponse(item))
      .filter((item) => !query.status || item.status === query.status.toUpperCase());
  }

  async dispatch(user: AuthUser, id: string, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const assignment = await this.db
      .getRepository(FleetAssignment)
      .findOne({ where: { id, fleetId: fleet.id } });
    if (!assignment) throw new NotFoundException('Dispatch not found');
    return this.dispatchResponse(assignment);
  }

  async createDispatch(user: AuthUser, dto: CreateFleetPortalDispatchDto, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanDispatch(context);
    await this.assertFleetAssets(context.fleet.id, dto.driverId, dto.vehicleId);
    const repository = this.db.getRepository(FleetAssignment);
    const assignment = await repository.save(
      repository.create({
        fleetId: context.fleet.id,
        serviceType: this.serviceType(dto.type),
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        status: this.assignmentStatus(dto.status ?? (dto.driverId ? 'ASSIGNED' : 'PENDING')),
        startsAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
        assignedByUserId: user.id,
        metadata: {
          pickup: dto.pickup,
          dropoff: dto.dropoff,
          notes: dto.notes,
          type: dto.type,
          customer: dto.customer,
          quotedAmount: dto.quotedAmount,
          currency: dto.currency ?? context.organization.currency,
          portalStatus: (dto.status ?? (dto.driverId ? 'ASSIGNED' : 'PENDING')).toUpperCase(),
        },
      }),
    );
    const response = this.dispatchResponse(assignment);
    await this.emit(context.fleet.id, 'dispatch.created', response, ['dispatch.create', 'notification.new']);
    return response;
  }

  async updateDispatch(
    user: AuthUser,
    id: string,
    dto: PatchFleetPortalDispatchDto,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanDispatch(context);
    const repository = this.db.getRepository(FleetAssignment);
    const assignment = await repository.findOne({ where: { id, fleetId: context.fleet.id } });
    if (!assignment) throw new NotFoundException('Dispatch not found');
    await this.assertFleetAssets(context.fleet.id, dto.driverId, dto.vehicleId);
    if (dto.driverId !== undefined) assignment.driverId = dto.driverId;
    if (dto.vehicleId !== undefined) assignment.vehicleId = dto.vehicleId;
    if (dto.status !== undefined) assignment.status = this.assignmentStatus(dto.status);
    if (dto.scheduledAt !== undefined) assignment.startsAt = new Date(dto.scheduledAt);
    if (dto.type !== undefined) assignment.serviceType = this.serviceType(dto.type);
    assignment.metadata = {
      ...(assignment.metadata ?? {}),
      ...(dto.pickup !== undefined ? { pickup: dto.pickup } : {}),
      ...(dto.dropoff !== undefined ? { dropoff: dto.dropoff } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.customer !== undefined ? { customer: dto.customer } : {}),
      ...(dto.quotedAmount !== undefined ? { quotedAmount: dto.quotedAmount } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.status !== undefined ? { portalStatus: dto.status.toUpperCase() } : {}),
    };
    if (assignment.status === FleetAssignmentStatus.COMPLETED) assignment.endsAt = new Date();
    const saved = await repository.save(assignment);
    const response = this.dispatchResponse(saved);
    const event =
      saved.status === FleetAssignmentStatus.COMPLETED ? 'dispatch.completed' : 'dispatch.updated';
    await this.emit(context.fleet.id, event, response, ['dispatch.update']);
    return response;
  }

  listServiceOrders(
    user: AuthUser,
    resourceType: string,
    query: FleetPortalListQueryDto = {},
    organizationId?: string,
  ) {
    return this.listResources(user, resourceType, query, organizationId).then((records) =>
      records.map((record) => this.serviceOrderResponse(record, resourceType)),
    );
  }

  async serviceOrder(user: AuthUser, id: string, resourceType: string, organizationId?: string) {
    const record = await this.resource(user, id, resourceType, organizationId);
    return this.serviceOrderResponse(record, resourceType);
  }

  async createServiceOrder(
    user: AuthUser,
    resourceType: string,
    dto: CreateFleetServiceOrderDto,
    organizationId?: string,
  ) {
    const record = await this.createResource(
      user,
      resourceType,
      {
        status: dto.status ?? 'PENDING',
        title: dto.customerName,
        scheduledAt: dto.scheduledAt,
        data: {
          customerName: dto.customerName,
          assetId: dto.assetId,
          notes: dto.notes,
          ...(dto.details ?? {}),
        },
      },
      organizationId,
    );
    return this.serviceOrderResponse(record, resourceType);
  }

  async updateServiceOrder(
    user: AuthUser,
    id: string,
    resourceType: string,
    dto: PatchFleetServiceOrderDto,
    organizationId?: string,
  ) {
    const patch: Record<string, unknown> = {
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.customerName !== undefined ? { title: dto.customerName } : {}),
      ...(dto.scheduledAt !== undefined ? { scheduledAt: dto.scheduledAt } : {}),
      data: {
        ...(dto.customerName !== undefined ? { customerName: dto.customerName } : {}),
        ...(dto.assetId !== undefined ? { assetId: dto.assetId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.details ?? {}),
      },
    };
    const record = await this.updateResource(user, id, resourceType, patch, organizationId);
    return this.serviceOrderResponse(record, resourceType);
  }

  async listTourMessages(user: AuthUser, tourId: string, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    await this.assertResourceBelongs(fleet.id, tourId, 'TOUR');
    return this.db
      .getRepository(FleetPortalResource)
      .find({
        where: { fleetId: fleet.id, resourceType: 'TOUR_MESSAGE', parentId: tourId },
        order: { createdAt: 'ASC' },
      })
      .then((items) =>
        items.map((item) => ({ id: item.id, ...(item.data ?? {}), createdAt: item.createdAt })),
      );
  }

  async createTourMessage(
    user: AuthUser,
    tourId: string,
    body: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    await this.assertResourceBelongs(context.fleet.id, tourId, 'TOUR');
    const record = await this.createResource(
      user,
      'TOUR_MESSAGE',
      {
        parentId: tourId,
        title: this.optionalString(body.sender) ?? `${user.firstName} ${user.lastName}`,
        data: {
          sender: this.optionalString(body.sender) ?? `${user.firstName} ${user.lastName}`,
          text: this.requiredString(body.text, 'text'),
          isOwn: body.isOwn === undefined ? true : Boolean(body.isOwn),
          senderUserId: user.id,
        },
      },
      context.organization.id,
    );
    return { id: record.id, ...(record.data ?? {}), createdAt: record.createdAt };
  }

  async listResources(
    user: AuthUser,
    resourceType: string,
    query: FleetPortalListQueryDto = {},
    organizationId?: string,
  ) {
    const { fleet } = await this.context(user, organizationId);
    const repository = this.db.getRepository(FleetPortalResource);
    const qb = repository
      .createQueryBuilder('resource')
      .where('resource.fleetId = :fleetId', { fleetId: fleet.id })
      .andWhere('resource.resourceType = :resourceType', { resourceType })
      .orderBy('resource.createdAt', 'DESC');
    if (query.status) qb.andWhere('resource.status = :status', { status: query.status.toUpperCase() });
    if (query.parentId) qb.andWhere('resource.parentId = :parentId', { parentId: query.parentId });
    if (query.from) qb.andWhere('resource.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('resource.createdAt <= :to', { to: new Date(query.to) });
    const items = await qb.take(query.limit ?? 250).getMany();
    const search = query.search?.trim().toLowerCase();
    return items.filter((item) => !search || JSON.stringify(item).toLowerCase().includes(search));
  }

  async resource(user: AuthUser, id: string, resourceType: string, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const record = await this.db.getRepository(FleetPortalResource).findOne({
      where: { id, fleetId: fleet.id, resourceType },
    });
    if (!record) throw new NotFoundException(`${resourceType.toLowerCase().replaceAll('_', ' ')} not found`);
    return record;
  }

  async createResource(
    user: AuthUser,
    resourceType: string,
    body: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const repository = this.db.getRepository(FleetPortalResource);
    const data = this.objectValue(body.data);
    const record = await repository.save(
      repository.create({
        fleetId: context.fleet.id,
        resourceType,
        resourceKey: this.optionalString(body.resourceKey) ?? `${resourceType}-${randomUUID()}`,
        parentId: this.optionalString(body.parentId),
        status: this.optionalString(body.status)?.toUpperCase() ?? 'ACTIVE',
        title:
          this.optionalString(body.title) ??
          this.optionalString(data.name) ??
          this.optionalString(data.customerName),
        scheduledAt: this.dateValue(body.scheduledAt),
        completedAt: this.dateValue(body.completedAt),
        amount: this.numberValue(body.amount),
        currency: this.optionalString(body.currency) ?? context.organization.currency,
        createdByUserId: user.id,
        updatedByUserId: user.id,
        data,
      }),
    );
    await this.emit(context.fleet.id, `fleet.${resourceType.toLowerCase()}.created`, record);
    return record;
  }

  async createLooseResource(
    user: AuthUser,
    resourceType: string,
    body: Record<string, unknown>,
    parentId?: string,
    organizationId?: string,
  ) {
    const data = { ...body };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    return this.createResource(
      user,
      resourceType,
      {
        parentId: parentId ?? this.optionalString(body.parentId),
        status: this.optionalString(body.status) ?? 'ACTIVE',
        title:
          this.optionalString(body.title) ??
          this.optionalString(body.name) ??
          this.optionalString(body.customerName),
        scheduledAt: body.scheduledAt ?? body.date ?? body.startAt,
        amount: body.amount,
        currency: body.currency,
        data,
      },
      organizationId,
    ).then((record) => this.resourceData(record));
  }

  async updateResource(
    user: AuthUser,
    id: string,
    resourceType: string,
    patch: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const repository = this.db.getRepository(FleetPortalResource);
    const record = await repository.findOne({ where: { id, fleetId: context.fleet.id, resourceType } });
    if (!record) throw new NotFoundException(`${resourceType.toLowerCase().replaceAll('_', ' ')} not found`);
    if (patch.status !== undefined) record.status = this.requiredString(patch.status, 'status').toUpperCase();
    if (patch.title !== undefined) record.title = this.optionalString(patch.title);
    if (patch.parentId !== undefined) record.parentId = this.optionalString(patch.parentId);
    if (patch.scheduledAt !== undefined) record.scheduledAt = this.dateValue(patch.scheduledAt);
    if (patch.completedAt !== undefined) record.completedAt = this.dateValue(patch.completedAt);
    if (patch.amount !== undefined) record.amount = this.numberValue(patch.amount);
    if (patch.currency !== undefined) record.currency = this.requiredString(patch.currency, 'currency');
    record.data = { ...(record.data ?? {}), ...this.objectValue(patch.data) };
    record.updatedByUserId = user.id;
    const saved = await repository.save(record);
    await this.emit(context.fleet.id, `fleet.${resourceType.toLowerCase()}.updated`, saved);
    return saved;
  }

  async getLooseResource(user: AuthUser, id: string, resourceType: string, organizationId?: string) {
    return this.resourceData(await this.resource(user, id, resourceType, organizationId));
  }

  async updateLooseResource(
    user: AuthUser,
    id: string,
    resourceType: string,
    patch: Record<string, unknown>,
    organizationId?: string,
  ) {
    const data = { ...patch };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    const record = await this.updateResource(
      user,
      id,
      resourceType,
      {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.title !== undefined || patch.name !== undefined
          ? { title: patch.title ?? patch.name }
          : {}),
        ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
        ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt } : {}),
        ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        data,
      },
      organizationId,
    );
    return this.resourceData(record);
  }

  async deleteLooseResource(user: AuthUser, id: string, resourceType: string, organizationId?: string) {
    return this.deleteResource(user, id, resourceType, organizationId);
  }

  async deleteResource(user: AuthUser, id: string, resourceType: string, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const repository = this.db.getRepository(FleetPortalResource);
    const record = await repository.findOne({ where: { id, fleetId: context.fleet.id, resourceType } });
    if (!record) throw new NotFoundException('Resource not found');
    await repository.softRemove(record);
    await this.emit(context.fleet.id, `fleet.${resourceType.toLowerCase()}.deleted`, { id });
    return { deleted: true, id };
  }

  async listLooseResources(
    user: AuthUser,
    resourceType: string,
    query: FleetPortalListQueryDto = {},
    organizationId?: string,
  ) {
    return (await this.listResources(user, resourceType, query, organizationId)).map((record) =>
      this.resourceData(record),
    );
  }

  async incidents(user: AuthUser, query: FleetPortalListQueryDto = {}, organizationId?: string) {
    return (await this.listResources(user, 'INCIDENT', query, organizationId)).map((record) => ({
      id: record.id,
      category: this.optionalString(record.data?.category) ?? record.title ?? 'general',
      severity: (this.optionalString(record.data?.severity) ?? 'LOW').toLowerCase(),
      status: record.status.toLowerCase(),
      description: this.optionalString(record.data?.description) ?? '',
      reporterId: record.createdByUserId,
      vehicleId: this.optionalString(record.data?.vehicleId),
      driverId: this.optionalString(record.data?.driverId),
      fleetAccountId: record.fleetId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      metadata: record.data?.metadata,
    }));
  }

  async createIncident(user: AuthUser, dto: CreateFleetIncidentDto, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const record = await this.createResource(
      user,
      'INCIDENT',
      {
        status: dto.status ?? 'OPEN',
        title: dto.category,
        data: {
          category: dto.category,
          severity: dto.severity?.toUpperCase() ?? 'LOW',
          description: dto.description,
          sourceReporterId: dto.reporterId,
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
          metadata: dto.metadata,
        },
      },
      context.organization.id,
    );
    const result = (await this.incidents(user, {}, context.organization.id)).find(
      (item) => item.id === record.id,
    );
    await this.emit(context.fleet.id, 'fleet.alert', result, ['notification.new']);
    return result;
  }

  async trainingCourses(user: AuthUser, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const modules = await this.db.getRepository(TrainingModule).find({ order: { sequence: 'ASC' } });
    const driverLinks = await this.db
      .getRepository(FleetDriver)
      .find({ where: { fleetId: context.fleet.id } });
    const progress = driverLinks.length
      ? await this.db.getRepository(TrainingProgress).find({
          where: { driverId: In(driverLinks.map((item) => item.driverId)) },
        })
      : [];
    return modules.map((module) => {
      const assignments = progress.filter((item) => item.moduleId === module.id);
      return {
        id: module.id,
        code: module.code,
        title: module.title,
        description: module.description,
        mediaUrl: module.mediaUrl,
        sequence: module.sequence,
        quiz: module.quiz,
        status: module.active ? 'published' : 'archived',
        assignedTo: assignments.length ? `${assignments.length} driver(s)` : null,
        completion: {
          assigned: assignments.length,
          completed: assignments.filter((item) =>
            [TrainingProgressStatus.COMPLETED, TrainingProgressStatus.PASSED].includes(item.status),
          ).length,
        },
        createdAt: module.createdAt,
        updatedAt: module.updatedAt,
      };
    });
  }

  async assignTraining(
    user: AuthUser,
    moduleId: string,
    body: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const module = await this.db.getRepository(TrainingModule).findOne({ where: { id: moduleId } });
    if (!module) throw new NotFoundException('Training course not found');
    const driverIds = Array.isArray(body.driverIds) ? body.driverIds.map(String) : [];
    const links = await this.db.getRepository(FleetDriver).find({ where: { fleetId: context.fleet.id } });
    const allowed = new Set(links.map((item) => item.driverId));
    const targets = driverIds.length ? driverIds.filter((id) => allowed.has(id)) : [...allowed];
    const repository = this.db.getRepository(TrainingProgress);
    for (const driverId of targets) {
      let progress = await repository.findOne({ where: { driverId, moduleId } });
      progress ??= repository.create({
        driverId,
        moduleId,
        status: TrainingProgressStatus.NOT_STARTED,
        score: 0,
      });
      await repository.save(progress);
    }
    await this.emit(context.fleet.id, 'fleet.training.assigned', { moduleId, driverIds: targets });
    return { assigned: targets.length, moduleId };
  }

  async notifications(user: AuthUser, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const own = await this.db.getRepository(Notification).find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const fleetNotices = await this.listResources(
      user,
      'NOTIFICATION',
      { limit: 100 },
      context.organization.id,
    );
    return [
      ...own.map((item) => ({
        id: item.id,
        title: item.title,
        message: item.body,
        read: !!item.readAt,
        type: item.type,
        data: item.data,
        createdAt: item.createdAt,
      })),
      ...fleetNotices.map((item) => ({
        id: item.id,
        title: item.title ?? 'Fleet notification',
        message: this.optionalString(item.data?.message) ?? '',
        read: Boolean(item.data?.read),
        type: this.optionalString(item.data?.type) ?? 'SYSTEM',
        data: item.data,
        createdAt: item.createdAt,
      })),
    ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  async markNotification(user: AuthUser, id: string, read: boolean, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const repository = this.db.getRepository(Notification);
    const notification = await repository.findOne({ where: { id, userId: user.id } });
    if (notification) {
      notification.readAt = read ? new Date() : undefined;
      await repository.save(notification);
      return { id, read };
    }
    const resource = await this.db.getRepository(FleetPortalResource).findOne({
      where: { id, fleetId: context.fleet.id, resourceType: 'NOTIFICATION' },
    });
    if (!resource) throw new NotFoundException('Notification not found');
    resource.data = { ...(resource.data ?? {}), read };
    await this.db.getRepository(FleetPortalResource).save(resource);
    return { id, read };
  }

  async payouts(user: AuthUser, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const links = await this.db.getRepository(FleetDriver).find({ where: { fleetId: fleet.id } });
    if (!links.length) return [];
    return this.db
      .getRepository(Payout)
      .find({
        where: { driverId: In(links.map((item) => item.driverId)) },
        order: { createdAt: 'DESC' },
        take: 250,
      })
      .then((items) =>
        items.map((item) => ({
          id: item.id,
          driverId: item.driverId,
          amount: item.amount,
          currency: item.currency,
          status: this.payoutStatus(item.status),
          destination: item.destination,
          reference: item.reference,
          createdAt: item.createdAt,
        })),
      );
  }

  async earningsSummary(user: AuthUser, organizationId?: string) {
    const { fleet, organization } = await this.context(user, organizationId);
    const links = await this.db.getRepository(FleetDriver).find({ where: { fleetId: fleet.id } });
    const driverIds = links.map((item) => item.driverId);
    const ledger = driverIds.length
      ? await this.db.getRepository(EarningsLedger).find({ where: { driverId: In(driverIds) } })
      : [];
    const assignments = await this.db.getRepository(FleetAssignment).find({ where: { fleetId: fleet.id } });
    return {
      totalEarnings: ledger.reduce((sum, item) => sum + Number(item.netAmount ?? 0), 0),
      grossEarnings: ledger.reduce((sum, item) => sum + Number(item.grossAmount ?? 0), 0),
      platformFees: ledger.reduce((sum, item) => sum + Number(item.platformFee ?? 0), 0),
      tips: ledger.reduce((sum, item) => sum + Number(item.tipAmount ?? 0), 0),
      totalTrips: assignments.filter((item) => item.status === FleetAssignmentStatus.COMPLETED).length,
      totalDrivers: links.length,
      activeDrivers: links.filter((item) => item.status === FleetAssetStatus.ACTIVE).length,
      currency: ledger[0]?.currency ?? organization.currency,
      generatedAt: new Date(),
    };
  }

  async earningsStatements(user: AuthUser, query: FleetPortalListQueryDto = {}, organizationId?: string) {
    const { fleet, organization } = await this.context(user, organizationId);
    const links = await this.db.getRepository(FleetDriver).find({ where: { fleetId: fleet.id } });
    const driverIds = links.map((item) => item.driverId);
    const ledger = driverIds.length
      ? await this.db.getRepository(EarningsLedger).find({
          where: { driverId: In(driverIds) },
          order: { createdAt: 'DESC' },
        })
      : [];
    const groups = new Map<string, EarningsLedger[]>();
    for (const item of ledger) {
      if (query.from && item.createdAt < new Date(query.from)) continue;
      if (query.to && item.createdAt > new Date(query.to)) continue;
      const key = item.createdAt.toISOString().slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([period, items]) => ({
      id: `statement:${fleet.id}:${period}`,
      period,
      fleetId: fleet.id,
      grossAmount: items.reduce((sum, item) => sum + Number(item.grossAmount), 0),
      platformFee: items.reduce((sum, item) => sum + Number(item.platformFee), 0),
      netAmount: items.reduce((sum, item) => sum + Number(item.netAmount), 0),
      tipAmount: items.reduce((sum, item) => sum + Number(item.tipAmount), 0),
      transactionCount: items.length,
      currency: items[0]?.currency ?? organization.currency,
      status: 'FINAL',
    }));
  }

  async earningsStatement(user: AuthUser, period: string, organizationId?: string) {
    const statements = await this.earningsStatements(user, {}, organizationId);
    const statement = statements.find((item) => item.period === period || item.id === period);
    if (!statement) throw new NotFoundException('Earnings statement not found');
    const context = await this.context(user, organizationId);
    const links = await this.db.getRepository(FleetDriver).find({ where: { fleetId: context.fleet.id } });
    const entries = links.length
      ? await this.db.getRepository(EarningsLedger).find({
          where: { driverId: In(links.map((item) => item.driverId)) },
          order: { createdAt: 'DESC' },
        })
      : [];
    return {
      ...statement,
      entries: entries.filter((item) => item.createdAt.toISOString().startsWith(statement.period)),
    };
  }

  async earningsDetailed(user: AuthUser, query: FleetDateRangeQueryDto = {}, organizationId?: string) {
    return this.earningsStatements(user, query, organizationId);
  }

  async requestPayout(user: AuthUser, dto: RequestFleetPayoutDto, organizationId?: string) {
    const { fleet, organization } = await this.context(user, organizationId);
    const driverLink = await this.db.getRepository(FleetDriver).findOne({
      where: { fleetId: fleet.id, driverId: dto.driverId },
    });
    if (!driverLink) throw new NotFoundException('Driver is not assigned to this fleet');

    const driver = await this.db.getRepository(DriverProfile).findOne({ where: { id: dto.driverId } });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const cashoutDto: CreateCashoutRequestDto = {
      amount: dto.amount,
      currency: dto.currency ?? organization.currency ?? 'UGX',
      method: dto.method,
      idempotencyKey: `fleet-payout-${fleet.id}-${dto.driverId}-${Date.now()}`,
      metadata: { requestedBy: user.id, fleetId: fleet.id, reason: dto.reason },
    };

    const cashout = await this.financialOperations.requestCashout(driver.userId, cashoutDto, organization.id);

    this.businessMetrics.recordFleetPayoutRequested();
    void this.auditService
      .record({
        actorUserId: user.id,
        action: 'FLEET_PAYOUT_REQUESTED',
        entityType: 'CashoutRequest',
        entityId: cashout.id,
        after: { ...cashout },
        reason: dto.reason,
        metadata: { fleetId: fleet.id, driverId: dto.driverId },
      })
      .catch((error) =>
        this.logger?.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );

    this.events.emit('fleet.portal.event', {
      fleetId: fleet.id,
      event: 'payout.requested',
      data: { cashoutId: cashout.id, driverId: dto.driverId, amount: dto.amount },
    });

    return {
      id: cashout.id,
      driverId: dto.driverId,
      amount: cashout.amount,
      currency: cashout.currency,
      status: cashout.status,
      reference: cashout.reference,
      requestedAt: cashout.createdAt,
    };
  }

  async fleetComplianceScore(user: AuthUser, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const driverLinks = await this.db.getRepository(FleetDriver).find({ where: { fleetId: fleet.id } });
    const vehicleLinks = await this.db.getRepository(FleetVehicle).find({ where: { fleetId: fleet.id } });

    const totalDrivers = driverLinks.length;
    const activeDrivers = driverLinks.filter((item) => item.status === FleetAssetStatus.ACTIVE).length;
    const totalVehicles = vehicleLinks.length;
    const activeVehicles = vehicleLinks.filter((item) => item.status === FleetAssetStatus.ACTIVE).length;

    const incidents = await this.db.getRepository(FleetPortalResource).find({
      where: { fleetId: fleet.id, resourceType: 'INCIDENT' },
    });
    const openIncidents = incidents.filter(
      (item) => (item.data as Record<string, unknown>)?.status === 'OPEN',
    ).length;

    const driverIds = driverLinks.map((item) => item.driverId);
    const vehicleIds = vehicleLinks.map((item) => item.vehicleId);

    const [trainingProgress, vehicleDocuments] = await Promise.all([
      driverIds.length
        ? this.db.getRepository(TrainingProgress).find({ where: { driverId: In(driverIds) } })
        : Promise.resolve([]),
      vehicleIds.length
        ? this.db.getRepository(VehicleDocument).find({ where: { vehicleId: In(vehicleIds) } })
        : Promise.resolve([]),
    ]);

    const completedTraining = trainingProgress.filter(
      (item) => item.status === TrainingProgressStatus.COMPLETED,
    ).length;
    const verifiedDocuments = vehicleDocuments.filter(
      (item) => item.status === DocumentStatus.VERIFIED,
    ).length;

    const denominator = totalDrivers + totalVehicles + incidents.length || 1;
    const score = Math.round(
      ((activeDrivers + activeVehicles + completedTraining + verifiedDocuments - openIncidents) /
        denominator) *
        100,
    );

    this.businessMetrics.recordFleetComplianceScored();

    return {
      score: Math.max(0, Math.min(100, score)),
      fleetId: fleet.id,
      generatedAt: new Date(),
      breakdown: {
        totalDrivers,
        activeDrivers,
        totalVehicles,
        activeVehicles,
        openIncidents,
        totalIncidents: incidents.length,
        completedTraining,
        totalTraining: trainingProgress.length,
        verifiedDocuments,
        totalDocuments: vehicleDocuments.length,
      },
    };
  }

  async fleetPerformanceMetrics(user: AuthUser, query: FleetDateRangeQueryDto = {}, organizationId?: string) {
    const { fleet, organization } = await this.context(user, organizationId);
    const assignments = await this.db.getRepository(FleetAssignment).find({
      where: { fleetId: fleet.id },
      order: { createdAt: 'DESC' },
    });

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const filtered = assignments.filter((item) => {
      if (from && item.createdAt < from) return false;
      if (to && item.createdAt > to) return false;
      return true;
    });

    const completed = filtered.filter((item) => item.status === FleetAssignmentStatus.COMPLETED);
    const cancelled = filtered.filter((item) => item.status === FleetAssignmentStatus.CANCELLED);
    const active = filtered.filter((item) => item.status === FleetAssignmentStatus.ACTIVE);

    const driverLinks = await this.db.getRepository(FleetDriver).find({ where: { fleetId: fleet.id } });
    const driverIds = driverLinks.map((item) => item.driverId);
    const earnings = driverIds.length
      ? await this.db.getRepository(EarningsLedger).find({ where: { driverId: In(driverIds) } })
      : [];

    const serviceIds = completed.map((item) => item.serviceId).filter((id): id is string => Boolean(id));
    const reviews = serviceIds.length
      ? await this.db.getRepository(ServiceReview).find({ where: { serviceId: In(serviceIds) } })
      : [];
    const averageRating =
      reviews.length > 0 ? reviews.reduce((sum, item) => sum + Number(item.rating), 0) / reviews.length : 0;

    return {
      fleetId: fleet.id,
      currency: organization.currency,
      generatedAt: new Date(),
      totals: {
        assignments: filtered.length,
        completed: completed.length,
        cancelled: cancelled.length,
        active: active.length,
        completionRate: filtered.length > 0 ? Math.round((completed.length / filtered.length) * 100) : 0,
      },
      earnings: {
        gross: earnings.reduce((sum, item) => sum + Number(item.grossAmount), 0),
        net: earnings.reduce((sum, item) => sum + Number(item.netAmount), 0),
        platformFees: earnings.reduce((sum, item) => sum + Number(item.platformFee), 0),
        tips: earnings.reduce((sum, item) => sum + Number(item.tipAmount), 0),
      },
      quality: {
        averageRating: Math.round(averageRating * 10) / 10,
        reviewCount: reviews.length,
      },
    };
  }

  async listVehicleDocuments(user: AuthUser, fleetVehicleId: string, organizationId?: string) {
    const { vehicleId } = await this.vehicleLink(user, fleetVehicleId, organizationId);
    return this.db
      .getRepository(VehicleDocument)
      .find({ where: { vehicleId }, order: { createdAt: 'DESC' } });
  }

  async createVehicleDocument(
    user: AuthUser,
    fleetVehicleId: string,
    body: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const { vehicleId } = await this.vehicleLink(user, fleetVehicleId, context.organization.id);
    const repository = this.db.getRepository(VehicleDocument);
    const type = this.enumValue(DocumentType, body.type, DocumentType.OTHER);
    const document = await repository.save(
      repository.create({
        vehicleId,
        type,
        status: this.enumValue(DocumentStatus, body.status, DocumentStatus.IN_REVIEW),
        fileUrl: this.requiredString(body.fileUrl ?? body.url, 'fileUrl'),
        issueDate: this.dateValue(body.issueDate),
        expiryDate: this.dateValue(body.expiryDate),
        rejectionReason: this.optionalString(body.rejectionReason),
      }),
    );
    await this.emit(context.fleet.id, 'fleet.vehicle.document.created', document, ['notification.new']);
    return document;
  }

  async updateVehicleDocument(
    user: AuthUser,
    fleetVehicleId: string,
    documentId: string,
    body: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const { vehicleId } = await this.vehicleLink(user, fleetVehicleId, context.organization.id);
    const repository = this.db.getRepository(VehicleDocument);
    const document = await repository.findOne({ where: { id: documentId, vehicleId } });
    if (!document) throw new NotFoundException('Vehicle document not found');
    if (body.type !== undefined) document.type = this.enumValue(DocumentType, body.type, document.type);
    if (body.status !== undefined)
      document.status = this.enumValue(DocumentStatus, body.status, document.status);
    if (body.fileUrl !== undefined || body.url !== undefined)
      document.fileUrl = String(body.fileUrl ?? body.url);
    if (body.issueDate !== undefined) document.issueDate = this.dateValue(body.issueDate);
    if (body.expiryDate !== undefined) document.expiryDate = this.dateValue(body.expiryDate);
    if (body.rejectionReason !== undefined)
      document.rejectionReason = this.optionalString(body.rejectionReason);
    const saved = await repository.save(document);
    await this.emit(context.fleet.id, 'fleet.vehicle.document.updated', saved);
    return saved;
  }

  async listVehicleAccessories(user: AuthUser, fleetVehicleId: string, organizationId?: string) {
    const { vehicleId } = await this.vehicleLink(user, fleetVehicleId, organizationId);
    return this.db
      .getRepository(VehicleAccessory)
      .find({ where: { vehicleId }, order: { category: 'ASC', code: 'ASC' } });
  }

  async replaceVehicleAccessories(
    user: AuthUser,
    fleetVehicleId: string,
    body: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const { vehicleId } = await this.vehicleLink(user, fleetVehicleId, context.organization.id);
    const entries = Array.isArray(body.accessories) ? body.accessories : [];
    const repository = this.db.getRepository(VehicleAccessory);
    const saved: VehicleAccessory[] = [];
    for (const raw of entries) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const code = this.requiredString(item.code ?? item.name, 'accessory code');
      let accessory = await repository.findOne({ where: { vehicleId, code } });
      accessory ??= repository.create({ vehicleId, code, category: 'GENERAL' });
      accessory.category = this.optionalString(item.category) ?? accessory.category;
      accessory.enabled = item.enabled === undefined ? true : Boolean(item.enabled);
      accessory.details = this.objectValue(item.details);
      saved.push(await repository.save(accessory));
    }
    await this.emit(context.fleet.id, 'fleet.vehicle.accessories.updated', {
      vehicleId,
      count: saved.length,
    });
    return saved;
  }

  async listMaintenance(user: AuthUser, fleetVehicleId?: string, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const vehicleId = fleetVehicleId
      ? (await this.vehicleLink(user, fleetVehicleId, organizationId)).vehicleId
      : undefined;
    return this.db.getRepository(FleetMaintenanceRecord).find({
      where: { fleetId: fleet.id, ...(vehicleId ? { vehicleId } : {}) },
      order: { scheduledAt: 'DESC' },
    });
  }

  async createMaintenance(
    user: AuthUser,
    fleetVehicleId: string,
    body: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const { vehicleId } = await this.vehicleLink(user, fleetVehicleId, context.organization.id);
    const repository = this.db.getRepository(FleetMaintenanceRecord);
    const record = await repository.save(
      repository.create({
        fleetId: context.fleet.id,
        vehicleId,
        status: this.enumValue(MaintenanceStatus, body.status, MaintenanceStatus.SCHEDULED),
        category: this.optionalString(body.category) ?? 'GENERAL',
        title: this.requiredString(body.title, 'title'),
        description: this.optionalString(body.description),
        odometerKm: this.numberValue(body.odometerKm),
        scheduledAt: this.dateValue(body.scheduledAt) ?? new Date(),
        completedAt: this.dateValue(body.completedAt),
        cost: this.numberValue(body.cost),
        currency: this.optionalString(body.currency) ?? context.organization.currency,
        serviceProvider: this.optionalString(body.serviceProvider),
        attachments: Array.isArray(body.attachments) ? body.attachments.map(String) : undefined,
      }),
    );
    await this.emit(context.fleet.id, 'fleet.maintenance.created', record, ['fleet.alert']);
    return record;
  }

  async updateMaintenance(
    user: AuthUser,
    id: string,
    body: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context);
    const repository = this.db.getRepository(FleetMaintenanceRecord);
    const record = await repository.findOne({ where: { id, fleetId: context.fleet.id } });
    if (!record) throw new NotFoundException('Maintenance record not found');
    if (body.status !== undefined)
      record.status = this.enumValue(MaintenanceStatus, body.status, record.status);
    if (body.category !== undefined) record.category = this.requiredString(body.category, 'category');
    if (body.title !== undefined) record.title = this.requiredString(body.title, 'title');
    if (body.description !== undefined) record.description = this.optionalString(body.description);
    if (body.odometerKm !== undefined) record.odometerKm = this.numberValue(body.odometerKm);
    if (body.scheduledAt !== undefined)
      record.scheduledAt = this.dateValue(body.scheduledAt) ?? record.scheduledAt;
    if (body.completedAt !== undefined) record.completedAt = this.dateValue(body.completedAt);
    if (body.cost !== undefined) record.cost = this.numberValue(body.cost);
    if (body.serviceProvider !== undefined)
      record.serviceProvider = this.optionalString(body.serviceProvider);
    if (body.attachments !== undefined)
      record.attachments = Array.isArray(body.attachments) ? body.attachments.map(String) : [];
    const saved = await repository.save(record);
    await this.emit(context.fleet.id, 'fleet.maintenance.updated', saved);
    return saved;
  }

  async dashboard(user: AuthUser, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const [profile, earnings, drivers, vehicles, dispatches, incidents, maintenance, notifications] =
      await Promise.all([
        this.profile(user, context.organization.id),
        this.earningsSummary(user, context.organization.id),
        this.listDrivers(user, {}, context.organization.id),
        this.listVehicles(user, {}, context.organization.id),
        this.listDispatches(user, { limit: 20 }, context.organization.id),
        this.incidents(user, { limit: 20 }, context.organization.id),
        this.listMaintenance(user, undefined, context.organization.id),
        this.notifications(user, context.organization.id),
      ]);
    return {
      profile,
      earnings,
      drivers: {
        total: drivers.length,
        available: drivers.filter((item) => item.status === FleetAssetStatus.ACTIVE).length,
        onTrip: drivers.filter((item) => item.availabilityStatus === DriverAvailabilityStatus.BUSY).length,
      },
      vehicles: {
        total: vehicles.length,
        active: vehicles.filter((item) => item.vehicleStatus === VehicleStatus.ACTIVE).length,
        maintenance: vehicles.filter((item) => item.vehicleStatus === VehicleStatus.MAINTENANCE).length,
      },
      dispatches: {
        total: dispatches.length,
        pending: dispatches.filter((item) => item.status === 'PENDING').length,
        active: dispatches.filter((item) => item.status === 'ASSIGNED').length,
        recent: dispatches.slice(0, 10),
      },
      compliance: {
        openIncidents: incidents.filter((item) => item.status !== 'RESOLVED').length,
        openMaintenance: maintenance.filter(
          (item) => ![MaintenanceStatus.COMPLETED, MaintenanceStatus.CANCELLED].includes(item.status),
        ).length,
      },
      notifications: {
        unread: notifications.filter((item) => !item.read).length,
        recent: notifications.slice(0, 5),
      },
      generatedAt: new Date(),
    };
  }

  async map(user: AuthUser, organizationId?: string) {
    const drivers = await this.listDrivers(user, {}, organizationId);
    const vehicles = await this.listVehicles(user, {}, organizationId);
    return {
      drivers: drivers.map((item) => ({
        id: item.id,
        name: item.displayName,
        status: item.status,
        latitude: item.lastLatitude,
        longitude: item.lastLongitude,
        lastLocationAt: item.lastLocationAt,
      })),
      vehicles,
      generatedAt: new Date(),
    };
  }

  async trips(user: AuthUser, query: FleetPortalListQueryDto = {}, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const driverLinks = await this.db
      .getRepository(FleetDriver)
      .find({ where: { fleetId: context.fleet.id } });
    const vehicleLinks = await this.db
      .getRepository(FleetVehicle)
      .find({ where: { fleetId: context.fleet.id } });
    const driverIds = driverLinks.map((item) => item.driverId);
    const vehicleIds = vehicleLinks.map((item) => item.vehicleId);
    if (!driverIds.length && !vehicleIds.length) return [];
    const [rides, deliveries, tours, ambulances, rentals] = await Promise.all([
      driverIds.length
        ? this.db
            .getRepository(Ride)
            .find({ where: { driverId: In(driverIds) }, order: { createdAt: 'DESC' }, take: 100 })
        : [],
      driverIds.length
        ? this.db
            .getRepository(DeliveryOrder)
            .find({ where: { driverId: In(driverIds) }, order: { createdAt: 'DESC' }, take: 100 })
        : [],
      driverIds.length
        ? this.db
            .getRepository(TouristBooking)
            .find({ where: { driverId: In(driverIds) }, order: { createdAt: 'DESC' }, take: 100 })
        : [],
      driverIds.length
        ? this.db
            .getRepository(AmbulanceRequest)
            .find({ where: { driverId: In(driverIds) }, order: { createdAt: 'DESC' }, take: 100 })
        : [],
      vehicleIds.length
        ? this.db
            .getRepository(RentalBooking)
            .find({ where: { vehicleId: In(vehicleIds) }, order: { createdAt: 'DESC' }, take: 100 })
        : [],
    ]);
    const all = [
      ...rides.map((item) => ({
        id: item.id,
        serviceType: ServiceType.RIDE,
        status: item.status,
        driverId: item.driverId,
        vehicleId: item.vehicleId,
        amount: item.finalFare ?? item.estimatedFare,
        currency: item.currency,
        createdAt: item.createdAt,
      })),
      ...deliveries.map((item) => ({
        id: item.id,
        serviceType: ServiceType.DELIVERY,
        status: item.status,
        driverId: item.driverId,
        vehicleId: item.vehicleId,
        amount: item.finalCost ?? item.estimatedCost,
        currency: item.currency,
        createdAt: item.createdAt,
      })),
      ...tours.map((item) => ({
        id: item.id,
        serviceType: ServiceType.TOURIST_VEHICLE,
        status: item.status,
        driverId: item.driverId,
        vehicleId: item.vehicleId,
        amount: item.finalAmount ?? item.estimatedAmount,
        currency: item.currency,
        createdAt: item.createdAt,
      })),
      ...ambulances.map((item) => ({
        id: item.id,
        serviceType: ServiceType.AMBULANCE,
        status: item.status,
        driverId: item.driverId,
        vehicleId: item.vehicleId,
        amount: item.finalCost ?? item.estimatedCost,
        currency: 'UGX',
        createdAt: item.createdAt,
      })),
      ...rentals.map((item) => ({
        id: item.id,
        serviceType: ServiceType.CAR_RENTAL,
        status: item.status,
        driverId: item.driverId,
        vehicleId: item.vehicleId,
        amount: item.finalAmount ?? item.estimatedAmount,
        currency: item.currency,
        createdAt: item.createdAt,
      })),
    ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return all
      .filter((item) => !query.status || String(item.status).toUpperCase() === query.status.toUpperCase())
      .slice(0, query.limit ?? 250);
  }

  async trip(user: AuthUser, id: string, organizationId?: string) {
    const item = (await this.trips(user, { limit: 250 }, organizationId)).find((entry) => entry.id === id);
    if (!item) throw new NotFoundException('Fleet trip not found');
    return item;
  }

  async riderServices(user: AuthUser, query: FleetPortalListQueryDto = {}, organizationId?: string) {
    const services = await this.trips(user, query, organizationId);
    return services
      .filter((item) =>
        [ServiceType.CAR_RENTAL, ServiceType.TOURIST_VEHICLE, ServiceType.AMBULANCE].includes(
          item.serviceType,
        ),
      )
      .map((item) => ({
        id: item.id,
        riderId: '',
        driverId: item.driverId,
        serviceType:
          item.serviceType === ServiceType.CAR_RENTAL
            ? 'rental'
            : item.serviceType === ServiceType.TOURIST_VEHICLE
              ? 'tour'
              : 'ambulance',
        status: item.status,
        payload: item,
        createdAt: +new Date(item.createdAt),
        updatedAt: +new Date(item.createdAt),
      }));
  }

  async ambulanceCases(user: AuthUser, query: FleetPortalListQueryDto = {}, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const driverLinks = await this.db
      .getRepository(FleetDriver)
      .find({ where: { fleetId: context.fleet.id } });
    const vehicleLinks = await this.db
      .getRepository(FleetVehicle)
      .find({ where: { fleetId: context.fleet.id } });
    const conditions: Array<{ driverId?: ReturnType<typeof In>; vehicleId?: ReturnType<typeof In> }> = [];
    if (driverLinks.length) conditions.push({ driverId: In(driverLinks.map((item) => item.driverId)) });
    if (vehicleLinks.length) conditions.push({ vehicleId: In(vehicleLinks.map((item) => item.vehicleId)) });
    const cases = conditions.length
      ? await this.db
          .getRepository(AmbulanceRequest)
          .find({ where: conditions, order: { createdAt: 'DESC' }, take: query.limit ?? 250 })
      : [];
    const requestedStatus = query.status ? this.enumValue(BookingStatus, query.status, undefined) : undefined;
    return cases.filter((item) => !requestedStatus || item.status === requestedStatus);
  }

  async supportTickets(user: AuthUser, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const members = await this.db
      .getRepository(OrganizationMember)
      .find({ where: { organizationId: context.organization.id } });
    if (!members.length) return [];
    return this.db.getRepository(SupportTicket).find({
      where: { userId: In(members.map((item) => item.userId)) },
      order: { createdAt: 'DESC' },
      take: 250,
    });
  }

  async createSupportTicket(user: AuthUser, body: Record<string, unknown>, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const repository = this.db.getRepository(SupportTicket);
    const ticket = await repository.save(
      repository.create({
        userId: user.id,
        serviceType: this.optionalString(body.serviceType)
          ? this.serviceType(this.requiredString(body.serviceType, 'serviceType'))
          : undefined,
        serviceId: this.optionalString(body.serviceId),
        category: this.optionalString(body.category) ?? 'FLEET_PORTAL',
        priority: this.enumValue(SupportPriority, body.priority, SupportPriority.NORMAL),
        status: SupportTicketStatus.OPEN,
        subject: this.requiredString(body.subject, 'subject'),
        description: this.requiredString(body.description ?? body.message, 'description'),
        messages: [
          {
            senderUserId: user.id,
            message: this.requiredString(body.description ?? body.message, 'description'),
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );
    await this.emit(context.fleet.id, 'fleet.support.ticket.created', ticket, ['notification.new']);
    return ticket;
  }

  async addSupportMessage(
    user: AuthUser,
    ticketId: string,
    body: Record<string, unknown>,
    organizationId?: string,
  ) {
    const context = await this.context(user, organizationId);
    const tickets = await this.supportTickets(user, context.organization.id);
    const ticket = tickets.find((item) => item.id === ticketId);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    const message = {
      id: randomUUID(),
      senderUserId: user.id,
      message: this.requiredString(body.message ?? body.text, 'message'),
      attachments: Array.isArray(body.attachments) ? body.attachments.map(String) : [],
      createdAt: new Date().toISOString(),
    };
    ticket.messages = [...(ticket.messages ?? []), message];
    ticket.status = SupportTicketStatus.IN_PROGRESS;
    await this.db.getRepository(SupportTicket).save(ticket);
    await this.emit(context.fleet.id, 'fleet.support.message.created', { ticketId, message }, [
      'notification.new',
    ]);
    return message;
  }

  async activityLogs(user: AuthUser, query: FleetPortalListQueryDto = {}, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const members = await this.db
      .getRepository(OrganizationMember)
      .find({ where: { organizationId: context.organization.id } });
    if (!members.length) return [];
    return this.db.getRepository(AuditLog).find({
      where: { actorUserId: In(members.map((item) => item.userId)) },
      order: { createdAt: 'DESC' },
      take: query.limit ?? 250,
    });
  }

  async members(user: AuthUser, organizationId?: string) {
    const context = await this.context(user, organizationId);
    const memberships = await this.db.getRepository(OrganizationMember).find({
      where: { organizationId: context.organization.id },
      order: { createdAt: 'ASC' },
    });
    const accounts = memberships.length
      ? await this.db.getRepository(User).find({ where: { id: In(memberships.map((item) => item.userId)) } })
      : [];
    const accountById = new Map(accounts.map((item) => [item.id, item]));
    const invitations = await this.db.getRepository(FleetMemberInvitation).find({
      where: { fleetId: context.fleet.id },
      order: { createdAt: 'DESC' },
    });
    return {
      members: memberships.map((item) => ({ ...item, user: this.safeUser(accountById.get(item.userId)) })),
      invitations: invitations.map((item) => ({ ...item, tokenHash: undefined })),
    };
  }

  async inviteMember(user: AuthUser, body: Record<string, unknown>, organizationId?: string) {
    const context = await this.context(user, organizationId);
    this.assertCanManage(context, [OrganizationMemberRole.OWNER, OrganizationMemberRole.ADMIN]);
    const email = this.requiredString(body.email, 'email').toLowerCase();
    const repository = this.db.getRepository(FleetMemberInvitation);
    const token = randomToken(48);
    const invitation = await repository.save(
      repository.create({
        fleetId: context.fleet.id,
        organizationId: context.organization.id,
        email,
        role: this.optionalString(body.role) ?? OrganizationMemberRole.VIEWER,
        tokenHash: sha256(token),
        status: 'PENDING',
        expiresAt: this.dateValue(body.expiresAt) ?? new Date(Date.now() + 7 * 86400000),
        invitedByUserId: user.id,
        metadata: this.objectValue(body.metadata),
      }),
    );
    await this.emit(context.fleet.id, 'fleet.member.invited', { id: invitation.id, email }, [
      'notification.new',
    ]);
    return { ...invitation, tokenHash: undefined, invitationToken: token };
  }

  private async vehicleLink(user: AuthUser, fleetVehicleId: string, organizationId?: string) {
    const { fleet } = await this.context(user, organizationId);
    const link = await this.db
      .getRepository(FleetVehicle)
      .findOne({ where: { id: fleetVehicleId, fleetId: fleet.id } });
    if (!link) throw new NotFoundException('Fleet vehicle not found');
    return link;
  }

  private async assertResourceBelongs(fleetId: string, id: string, resourceType: string) {
    if (
      !(await this.db.getRepository(FleetPortalResource).findOne({ where: { id, fleetId, resourceType } }))
    ) {
      throw new NotFoundException(`${resourceType.toLowerCase()} not found`);
    }
  }

  private async assertFleetAssets(fleetId: string, driverLinkId?: string, vehicleLinkId?: string) {
    if (
      driverLinkId &&
      !(await this.db.getRepository(FleetDriver).findOne({ where: { id: driverLinkId, fleetId } }))
    ) {
      throw new BadRequestException('Driver does not belong to this fleet');
    }
    if (
      vehicleLinkId &&
      !(await this.db.getRepository(FleetVehicle).findOne({ where: { id: vehicleLinkId, fleetId } }))
    ) {
      throw new BadRequestException('Vehicle does not belong to this fleet');
    }
  }

  private driverResponse(link: FleetDriver, profile?: DriverProfile, account?: User) {
    const metadata = link.metadata ?? {};
    return {
      id: link.id,
      driverId: link.id,
      driverProfileId: link.driverId,
      userId: profile?.userId ?? null,
      displayName: account
        ? `${account.firstName} ${account.lastName}`.trim()
        : (this.optionalString(metadata.displayName) ?? 'Fleet Driver'),
      email: account?.email ?? null,
      phone: account?.phone ?? null,
      status: link.status,
      availabilityStatus: profile?.availabilityStatus ?? DriverAvailabilityStatus.OFFLINE,
      verificationStatus: profile?.verificationStatus ?? DriverVerificationStatus.NOT_STARTED,
      rating: profile?.rating ?? 0,
      completedRides: profile?.completedRides ?? 0,
      completedDeliveries: profile?.completedDeliveries ?? 0,
      fleetAccountId: link.fleetId,
      serviceCapabilities: link.serviceCapabilities ?? profile?.serviceCapabilities ?? [],
      groupId: this.optionalString(metadata.groupId) ?? null,
      externalRef: link.externalId ?? null,
      lastLatitude: profile?.lastLatitude,
      lastLongitude: profile?.lastLongitude,
      lastLocationAt: profile?.lastLocationAt,
      metadata,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    };
  }

  private vehicleResponse(link: FleetVehicle, vehicle?: Vehicle) {
    if (!vehicle) {
      return {
        id: link.id,
        fleetAccountId: link.fleetId,
        make: '',
        model: '',
        licensePlate: '',
        vehicleStatus: this.vehicleStatus(link.status),
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
      };
    }
    const features = vehicle.features ?? {};
    return {
      id: link.id,
      vehicleId: vehicle.id,
      fleetAccountId: link.fleetId,
      fleetDriverId: vehicle.assignedDriverId ?? null,
      make: vehicle.make,
      model: vehicle.model,
      vehicleName: this.optionalString(features.vehicleName) ?? `${vehicle.make} ${vehicle.model}`,
      licensePlate: vehicle.plateNumber,
      yearOfManufacture: vehicle.year,
      powertrain: this.optionalString(features.powertrain) ?? this.powertrain(vehicle.energyType),
      vehicleStatus: vehicle.status,
      isActive: vehicle.isActive,
      color: vehicle.color ?? null,
      vin: this.optionalString(features.vin) ?? null,
      countryOfRegistration: this.optionalString(features.countryOfRegistration) ?? null,
      bodyType: this.optionalString(features.bodyType) ?? vehicle.vehicleType,
      connectors: Array.isArray(features.connectors) ? features.connectors : [],
      batteryKwh: this.numberValue(features.batteryKwh),
      acMaxKw: this.numberValue(features.acMaxKw),
      dcMaxKw: this.numberValue(features.dcMaxKw),
      serviceCapabilities: link.serviceCapabilities ?? vehicle.serviceCapabilities ?? [],
      metadata: { ...(link.metadata ?? {}), ...features },
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    };
  }

  private dispatchResponse(assignment: FleetAssignment) {
    const metadata = assignment.metadata ?? {};
    return {
      id: assignment.id,
      fleetAccountId: assignment.fleetId,
      driverId: assignment.driverId ?? null,
      vehicleId: assignment.vehicleId ?? null,
      pickup: metadata.pickup ?? null,
      dropoff: metadata.dropoff ?? null,
      status: this.optionalString(metadata.portalStatus) ?? this.portalAssignmentStatus(assignment.status),
      type: this.optionalString(metadata.type) ?? assignment.serviceType,
      notes: this.optionalString(metadata.notes) ?? null,
      customer: metadata.customer ?? null,
      quotedAmount: this.numberValue(metadata.quotedAmount),
      currency: this.optionalString(metadata.currency) ?? 'UGX',
      scheduledAt: assignment.startsAt,
      completedAt: assignment.endsAt,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
    };
  }

  private serviceOrderResponse(record: FleetPortalResource, resourceType: string) {
    const data = record.data ?? {};
    const serviceAliases: Record<string, 'rental' | 'tour' | 'school_shuttle'> = {
      RENTAL: 'rental',
      TOUR: 'tour',
      SCHOOL_SHUTTLE: 'school_shuttle',
    };
    return {
      id: record.id,
      serviceType: resourceType,
      service: serviceAliases[resourceType] ?? resourceType.toLowerCase(),
      status: record.status.toLowerCase(),
      backendStatus: record.status,
      customerName: this.optionalString(data.customerName) ?? record.title ?? 'Customer',
      assetId: this.optionalString(data.assetId) ?? null,
      scheduledAt: record.scheduledAt ?? record.createdAt,
      notes: this.optionalString(data.notes) ?? null,
      details: data,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private resourceData(record: FleetPortalResource) {
    return {
      id: record.id,
      resourceKey: record.resourceKey,
      parentId: record.parentId,
      status: record.status,
      title: record.title,
      scheduledAt: record.scheduledAt,
      completedAt: record.completedAt,
      amount: record.amount,
      currency: record.currency,
      ...(record.data ?? {}),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private assertCanManage(
    context: FleetPortalContext,
    allowed: OrganizationMemberRole[] = [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
      OrganizationMemberRole.FLEET_MANAGER,
      OrganizationMemberRole.DISPATCH_MANAGER,
      OrganizationMemberRole.DISPATCHER,
      OrganizationMemberRole.COMPLIANCE,
      OrganizationMemberRole.FINANCE,
    ],
  ) {
    if (!context.membership) return;
    if (!allowed.includes(context.membership.role))
      throw new ForbiddenException('Fleet role cannot perform this operation');
  }

  private assertCanDispatch(context: FleetPortalContext) {
    this.assertCanManage(context, [
      OrganizationMemberRole.OWNER,
      OrganizationMemberRole.ADMIN,
      OrganizationMemberRole.FLEET_MANAGER,
      OrganizationMemberRole.DISPATCH_MANAGER,
      OrganizationMemberRole.DISPATCHER,
    ]);
  }

  private fleetStatus(value: string): FleetAssetStatus {
    const normalized = value.trim().toUpperCase().replaceAll('-', '_');
    if (['AVAILABLE', 'ACTIVE', 'READY'].includes(normalized)) return FleetAssetStatus.ACTIVE;
    if (['SUSPENDED', 'BLOCKED'].includes(normalized)) return FleetAssetStatus.SUSPENDED;
    if (['REMOVED', 'RETIRED', 'OUT_OF_SERVICE'].includes(normalized)) return FleetAssetStatus.REMOVED;
    if (['PENDING', 'INVITED'].includes(normalized)) return FleetAssetStatus.PENDING;
    return FleetAssetStatus.INACTIVE;
  }

  private assignmentStatus(value: string): FleetAssignmentStatus {
    const normalized = value.trim().toUpperCase().replaceAll('-', '_');
    if (['ASSIGNED', 'ACTIVE', 'IN_PROGRESS'].includes(normalized)) return FleetAssignmentStatus.ACTIVE;
    if (normalized === 'COMPLETED') return FleetAssignmentStatus.COMPLETED;
    if (['CANCELLED', 'CANCELED'].includes(normalized)) return FleetAssignmentStatus.CANCELLED;
    return FleetAssignmentStatus.PLANNED;
  }

  private portalAssignmentStatus(status: FleetAssignmentStatus): string {
    if (status === FleetAssignmentStatus.ACTIVE) return 'ASSIGNED';
    if (status === FleetAssignmentStatus.COMPLETED) return 'COMPLETED';
    if (status === FleetAssignmentStatus.CANCELLED) return 'CANCELLED';
    return 'PENDING';
  }

  private serviceType(value?: string): ServiceType {
    const normalized = String(value ?? 'RIDE')
      .trim()
      .toUpperCase()
      .replaceAll('-', '_')
      .replaceAll(' ', '_');
    const aliases: Record<string, ServiceType> = {
      RIDE: ServiceType.RIDE,
      RIDES: ServiceType.RIDE,
      DELIVERY: ServiceType.DELIVERY,
      DELIVERIES: ServiceType.DELIVERY,
      PARCEL: ServiceType.DELIVERY,
      RENTAL: ServiceType.CAR_RENTAL,
      CAR_RENTAL: ServiceType.CAR_RENTAL,
      TOUR: ServiceType.TOURIST_VEHICLE,
      TOURIST: ServiceType.TOURIST_VEHICLE,
      TOURIST_VEHICLE: ServiceType.TOURIST_VEHICLE,
      AMBULANCE: ServiceType.AMBULANCE,
      SCHOOL: ServiceType.SCHOOL_SHUTTLE,
      SCHOOL_SHUTTLE: ServiceType.SCHOOL_SHUTTLE,
    };
    return aliases[normalized] ?? ServiceType.RIDE;
  }

  private vehicleType(value?: string): VehicleType {
    const normalized = String(value ?? 'SEDAN')
      .trim()
      .toUpperCase()
      .replaceAll('-', '_')
      .replaceAll(' ', '_');
    return Object.values(VehicleType).includes(normalized as VehicleType)
      ? (normalized as VehicleType)
      : VehicleType.SEDAN;
  }

  private energyType(value?: string): EnergyType {
    const normalized = String(value ?? 'BEV')
      .trim()
      .toUpperCase();
    if (['BEV', 'EV', 'ELECTRIC'].includes(normalized)) return EnergyType.ELECTRIC;
    if (['PHEV', 'HEV', 'HYBRID'].includes(normalized)) return EnergyType.HYBRID;
    return EnergyType.INTERNAL_COMBUSTION;
  }

  private powertrain(value: EnergyType): string {
    return value === EnergyType.ELECTRIC ? 'BEV' : value === EnergyType.HYBRID ? 'HEV' : 'ICE';
  }

  private vehicleStatus(value?: string): VehicleStatus {
    const normalized = String(value ?? 'ACTIVE')
      .trim()
      .toUpperCase()
      .replaceAll('-', '_');
    if (['ACTIVE', 'AVAILABLE', 'READY'].includes(normalized)) return VehicleStatus.ACTIVE;
    if (normalized === 'MAINTENANCE') return VehicleStatus.MAINTENANCE;
    if (['REJECTED', 'OUT_OF_SERVICE', 'RETIRED'].includes(normalized)) return VehicleStatus.REJECTED;
    if (['PENDING', 'PENDING_VERIFICATION'].includes(normalized)) return VehicleStatus.PENDING_VERIFICATION;
    if (normalized === 'DRAFT') return VehicleStatus.DRAFT;
    return VehicleStatus.INACTIVE;
  }

  private payoutStatus(status: PayoutStatus): 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled' {
    if (status === PayoutStatus.COMPLETED) return 'paid';
    if (status === PayoutStatus.PROCESSING) return 'processing';
    if (status === PayoutStatus.FAILED) return 'failed';
    if (status === PayoutStatus.CANCELLED) return 'cancelled';
    return 'pending';
  }

  private enumValue<T extends Record<string, string>>(
    values: T,
    value: unknown,
    fallback: T[keyof T],
  ): T[keyof T];
  private enumValue<T extends Record<string, string>>(
    values: T,
    value: unknown,
    fallback: undefined,
  ): T[keyof T] | undefined;
  private enumValue<T extends Record<string, string>>(
    values: T,
    value: unknown,
    fallback: T[keyof T] | undefined,
  ): T[keyof T] | undefined {
    const normalized = (this.optionalString(value) ?? '')
      .toUpperCase()
      .replaceAll('-', '_')
      .replaceAll(' ', '_');
    return Object.values(values).includes(normalized) ? (normalized as T[keyof T]) : fallback;
  }

  private requiredString(value: unknown, field: string): string {
    const result = this.optionalString(value);
    if (!result) throw new BadRequestException(`${field} is required`);
    return result;
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const result = value.trim();
    return result || undefined;
  }

  private numberValue(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private dateValue(value: unknown): Date | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const date =
      value instanceof Date
        ? value
        : typeof value === 'string' || typeof value === 'number'
          ? new Date(value)
          : undefined;
    if (!date || Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date value');
    return date;
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }

  private deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
    const result = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.deepMerge(this.objectValue(result[key]), this.objectValue(value));
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private safeUser(user?: User) {
    if (!user) return null;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
    };
  }

  private async notify(userId: string, title: string, body: string, data?: Record<string, unknown>) {
    const repository = this.db.getRepository(Notification);
    const notification = await repository.save(
      repository.create({ userId, title, body, data, type: NotificationType.SYSTEM }),
    );
    this.events.emit('notification.created', notification);
    return notification;
  }

  private async emit(fleetId: string, event: string, data: unknown, aliases: string[] = []) {
    const payload: PortalEvent = { fleetId, event, data, aliases };
    this.events.emit('fleet.portal.event', payload);
  }
}
