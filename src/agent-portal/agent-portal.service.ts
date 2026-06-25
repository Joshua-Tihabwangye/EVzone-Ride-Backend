import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, In, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  BookingStatus,
  DeliveryStatus,
  EmergencyStatus,
  EmergencyType,
  ManualBookingStatus,
  MembershipStatus,
  ServiceType,
  SupportPriority,
  SupportTicketStatus,
  UserRole,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AgentDraft,
  AgentProfile,
  AgentQaReview,
  AgentRoleDefinition,
  AgentShiftPlan,
  AgentTask,
  AgentTeam,
  AgentTrainingModule,
  AgentTrainingProgress,
  AmbulanceRequest,
  ChatMessage,
  ChatParticipant,
  ChatThread,
  DeliveryOrder,
  DispatchAssignment,
  DispatchDesk,
  DriverDocument,
  DriverLocation,
  DriverProfile,
  EmergencyIncident,
  FleetProfile,
  ManualBooking,
  OnboardingApplication,
  OnboardingChecklistItem,
  Organization,
  OrganizationMember,
  RentalBooking,
  Ride,
  SafetyEventLog,
  SupportTicket,
  TouristBooking,
  User,
  Vehicle,
  VehicleDocument,
} from '../database/entities';
import { ResetPasswordDto, VerifyPasswordResetOtpDto } from '../auth/auth.dto';
import { AuthService } from '../auth/auth.service';
import {
  AssignManualBookingDto,
  CreateManualBookingDto,
  DispatchListQueryDto,
  DispatchNoteDto,
  ManualBookingActionDto,
  UpdateManualBookingDto,
} from '../dispatch/dispatch.dto';
import { DispatchService } from '../dispatch/dispatch.service';
import {
  AgentAssessmentSubmissionDto,
  AgentDraftCreateDto,
  AgentDraftUpdateDto,
  AgentIncidentActionDto,
  AgentIncidentDto,
  AgentOnboardingActionDto,
  AgentPortalForgotPasswordDto,
  AgentPortalListQueryDto,
  AgentPortalLoginDto,
  AgentProfileUpdateDto,
  AgentQaReviewDto,
  AgentRoleDto,
  AgentShiftDto,
  AgentSupportTicketDto,
  AgentTaskCreateDto,
  AgentTaskUpdateDto,
  AgentTeamDto,
  AgentTicketActionDto,
  AgentTicketMessageDto,
} from './agent-portal.dto';

const AGENT_ROLES = [UserRole.AGENT, UserRole.DISPATCHER, UserRole.SUPPORT, UserRole.ADMIN] as const;

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  onboarding: ['dashboard:read', 'onboarding:*', 'profiles:read', 'search:read', 'tasks:*'],
  support_t1: ['dashboard:read', 'support:read', 'support:reply', 'profiles:read', 'search:read', 'tasks:*'],
  support_t2: ['dashboard:read', 'support:*', 'profiles:read', 'safety:read', 'search:read', 'tasks:*'],
  dispatch: ['dashboard:read', 'dispatch:*', 'live-ops:*', 'profiles:read', 'search:read', 'tasks:*'],
  safety: ['dashboard:read', 'safety:*', 'live-ops:read', 'profiles:read', 'search:read', 'tasks:*'],
  qa: ['dashboard:read', 'qa:*', 'training:*', 'profiles:read', 'analytics:read', 'search:read'],
  supervisor: ['*'],
};

interface AgentContext {
  profile: AgentProfile;
  organization: Organization;
  desk?: DispatchDesk;
  permissions: string[];
}

interface AgentPortalEvent {
  organizationId: string;
  userIds?: string[];
  event: string;
  data: unknown;
  aliases?: string[];
}

@Injectable()
export class AgentPortalService {
  constructor(
    private readonly db: DataSource,
    private readonly auth: AuthService,
    private readonly dispatch: DispatchService,
    private readonly events: EventEmitter2,
  ) {}

  async login(dto: AgentPortalLoginDto, metadata?: { userAgent?: string; ipAddress?: string }) {
    const session = await this.auth.login(dto, metadata);
    const sessionUser = session.user as User;
    if (!AGENT_ROLES.includes(sessionUser.role as (typeof AGENT_ROLES)[number])) {
      await this.auth.logout(session.refreshToken);
      throw new UnauthorizedException('This account is not authorised for the Agent Portal');
    }
    const user: AuthUser = {
      id: sessionUser.id,
      email: sessionUser.email,
      phone: sessionUser.phone,
      firstName: sessionUser.firstName,
      lastName: sessionUser.lastName,
      role: sessionUser.role,
    };
    const context = await this.resolveContext(user);
    return {
      ...session,
      portal: await this.portalContext(user, context),
    };
  }

  forgotPassword(dto: AgentPortalForgotPasswordDto, ipAddress?: string) {
    return this.auth.forgotPassword(dto, ipAddress);
  }

  async refresh(refreshToken: string, metadata?: { userAgent?: string; ipAddress?: string }) {
    const session = await this.auth.refresh(refreshToken, metadata);
    const sessionUser = session.user as User;
    if (!AGENT_ROLES.includes(sessionUser.role as (typeof AGENT_ROLES)[number])) {
      await this.auth.logout(session.refreshToken);
      throw new UnauthorizedException('This account is not authorised for the Agent Portal');
    }
    const user: AuthUser = {
      id: sessionUser.id,
      email: sessionUser.email,
      phone: sessionUser.phone,
      firstName: sessionUser.firstName,
      lastName: sessionUser.lastName,
      role: sessionUser.role,
    };
    const context = await this.resolveContext(user);
    return { ...session, portal: await this.portalContext(user, context) };
  }

  logout(refreshToken: string) {
    return this.auth.logout(refreshToken);
  }

  verifyResetOtp(dto: VerifyPasswordResetOtpDto, ipAddress?: string) {
    return this.auth.verifyPasswordResetOtp(dto, ipAddress);
  }

  resetPassword(dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  async bootstrap(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const [dashboard, unread, tasks, activeShift] = await Promise.all([
      this.dashboard(user, '7d', context.organization.id),
      this.db.getRepository(SupportTicket).count({
        where: {
          assignedToUserId: user.id,
          status: In([SupportTicketStatus.OPEN, SupportTicketStatus.IN_PROGRESS]),
        },
      }),
      this.db.getRepository(AgentTask).count({
        where: { organizationId: context.organization.id, assigneeUserId: user.id, status: 'OPEN' },
      }),
      this.db.getRepository(AgentShiftPlan).findOne({
        where: { organizationId: context.organization.id, userId: user.id, status: 'CHECKED_IN' },
        order: { startsAt: 'DESC' },
      }),
    ]);
    context.profile.lastActiveAt = new Date();
    await this.db.getRepository(AgentProfile).save(context.profile);
    return {
      ...(await this.portalContext(user, context)),
      dashboard,
      counters: { unreadSupport: unread, openTasks: tasks },
      activeShift,
      realtime: {
        namespace: '/agent',
        subscribeEvents: ['subscribe.organization', 'subscribe.user', 'subscribe.queue'],
      },
      api: { basePath: '/api/v1/agent', version: '7.0.0' },
    };
  }

  async profile(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    return this.portalContext(user, context);
  }

  async updateProfile(user: AuthUser, dto: AgentProfileUpdateDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    Object.assign(context.profile, dto, {
      preferences: dto.preferences
        ? { ...(context.profile.preferences ?? {}), ...dto.preferences }
        : context.profile.preferences,
      lastActiveAt: new Date(),
    });
    const saved = await this.db.getRepository(AgentProfile).save(context.profile);
    await this.emit(context.organization.id, 'agent.profile.updated', saved, [user.id]);
    return saved;
  }

  async completeTrainingGate(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    context.profile.trainingGateCompletedAt = new Date();
    const saved = await this.db.getRepository(AgentProfile).save(context.profile);
    await this.emit(context.organization.id, 'agent.training.gate.completed', saved, [user.id]);
    return { completed: true, completedAt: saved.trainingGateCompletedAt };
  }

  async dashboard(user: AuthUser, period = '7d', organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const start = this.periodStart(period);
    const manual = this.db.getRepository(ManualBooking);
    const tickets = this.db.getRepository(SupportTicket);
    const incidents = this.db.getRepository(EmergencyIncident);
    const applications = this.db.getRepository(OnboardingApplication);
    const tasks = this.db.getRepository(AgentTask);

    const [
      totalBookings,
      pendingDispatch,
      activeBookings,
      completedBookings,
      openTickets,
      urgentTickets,
      activeIncidents,
      onboardingQueue,
      openTasks,
      overdueTasks,
      myBookings,
      myTickets,
    ] = await Promise.all([
      manual
        .createQueryBuilder('item')
        .where('item.organizationId = :organizationId', { organizationId: context.organization.id })
        .andWhere('item.createdAt >= :start', { start })
        .getCount(),
      manual.count({
        where: {
          organizationId: context.organization.id,
          status: In([ManualBookingStatus.DRAFT, ManualBookingStatus.DISPATCH_PENDING]),
        },
      }),
      manual.count({
        where: {
          organizationId: context.organization.id,
          status: In([ManualBookingStatus.ASSIGNED, ManualBookingStatus.IN_PROGRESS]),
        },
      }),
      manual
        .createQueryBuilder('item')
        .where('item.organizationId = :organizationId', { organizationId: context.organization.id })
        .andWhere('item.status = :status', { status: ManualBookingStatus.COMPLETED })
        .andWhere('item.updatedAt >= :start', { start })
        .getCount(),
      tickets.count({ where: { status: In([SupportTicketStatus.OPEN, SupportTicketStatus.IN_PROGRESS]) } }),
      tickets.count({
        where: {
          priority: In([SupportPriority.HIGH, SupportPriority.URGENT]),
          status: In([SupportTicketStatus.OPEN, SupportTicketStatus.IN_PROGRESS]),
        },
      }),
      incidents.count({
        where: {
          status: In([EmergencyStatus.OPEN, EmergencyStatus.ACKNOWLEDGED, EmergencyStatus.RESPONDING]),
        },
      }),
      applications.count({ where: { status: In(['SUBMITTED', 'IN_REVIEW', 'PENDING']) } }),
      tasks.count({
        where: {
          organizationId: context.organization.id,
          assigneeUserId: user.id,
          status: In(['OPEN', 'IN_PROGRESS']),
        },
      }),
      tasks
        .createQueryBuilder('task')
        .where('task.organizationId = :organizationId', { organizationId: context.organization.id })
        .andWhere('task.assigneeUserId = :userId', { userId: user.id })
        .andWhere('task.status NOT IN (:...closed)', { closed: ['COMPLETED', 'CANCELLED'] })
        .andWhere('task.dueAt IS NOT NULL AND task.dueAt < :now', { now: new Date() })
        .getCount(),
      manual
        .createQueryBuilder('item')
        .where('item.organizationId = :organizationId', { organizationId: context.organization.id })
        .andWhere('item.agentUserId = :userId', { userId: user.id })
        .andWhere('item.createdAt >= :start', { start })
        .getCount(),
      tickets
        .createQueryBuilder('ticket')
        .where('ticket.assignedToUserId = :userId', { userId: user.id })
        .andWhere('ticket.updatedAt >= :start', { start })
        .getCount(),
    ]);

    const byServiceRaw = await manual
      .createQueryBuilder('item')
      .select('item.serviceType', 'label')
      .addSelect('COUNT(*)', 'value')
      .where('item.organizationId = :organizationId', { organizationId: context.organization.id })
      .andWhere('item.createdAt >= :start', { start })
      .groupBy('item.serviceType')
      .getRawMany<{ label: string; value: string }>();

    const recentActivity = await manual.find({
      where: { organizationId: context.organization.id },
      order: { updatedAt: 'DESC' },
      take: 8,
    });

    return {
      period,
      generatedAt: new Date(),
      metrics: {
        totalBookings,
        pendingDispatch,
        activeBookings,
        completedBookings,
        openTickets,
        urgentTickets,
        activeIncidents,
        onboardingQueue,
        openTasks,
        overdueTasks,
      },
      personal: { bookingsHandled: myBookings, ticketsHandled: myTickets },
      byService: byServiceRaw.map((row) => ({ label: row.label, value: Number(row.value) })),
      recentActivity,
    };
  }

  async analytics(user: AuthUser, query: AgentPortalListQueryDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const start = query.from ? new Date(query.from) : this.periodStart('30d');
    const end = query.to ? new Date(query.to) : new Date();
    const manual = this.db.getRepository(ManualBooking);
    const tickets = this.db.getRepository(SupportTicket);
    const tasks = this.db.getRepository(AgentTask);
    const profiles = await this.db.getRepository(AgentProfile).find({
      where: { organizationId: context.organization.id, status: MembershipStatus.ACTIVE },
    });
    const users = profiles.length
      ? await this.db.getRepository(User).find({ where: { id: In(profiles.map((item) => item.userId)) } })
      : [];
    const userById = new Map(users.map((item) => [item.id, item]));
    const performance = await Promise.all(
      profiles.map(async (profile) => {
        const [bookings, assignedTickets, completedTasks, qa] = await Promise.all([
          manual
            .createQueryBuilder('item')
            .where('item.agentUserId = :userId', { userId: profile.userId })
            .andWhere('item.createdAt BETWEEN :start AND :end', { start, end })
            .getCount(),
          tickets
            .createQueryBuilder('item')
            .where('item.assignedToUserId = :userId', { userId: profile.userId })
            .andWhere('item.updatedAt BETWEEN :start AND :end', { start, end })
            .getCount(),
          tasks
            .createQueryBuilder('item')
            .where('item.assigneeUserId = :userId', { userId: profile.userId })
            .andWhere('item.status = :status', { status: 'COMPLETED' })
            .andWhere('item.updatedAt BETWEEN :start AND :end', { start, end })
            .getCount(),
          this.db
            .getRepository(AgentQaReview)
            .createQueryBuilder('item')
            .select('AVG(item.score)', 'average')
            .where('item.agentUserId = :userId', { userId: profile.userId })
            .andWhere('item.reviewedAt BETWEEN :start AND :end', { start, end })
            .getRawOne<{ average?: string }>(),
        ]);
        const account = userById.get(profile.userId);
        return {
          userId: profile.userId,
          name: account ? `${account.firstName} ${account.lastName}` : profile.employeeCode,
          portalRole: profile.portalRole,
          bookings,
          tickets: assignedTickets,
          completedTasks,
          qaScore: qa?.average ? Number(qa.average) : null,
        };
      }),
    );
    const dailyBookings = await manual
      .createQueryBuilder('item')
      .select('DATE(item.createdAt)', 'date')
      .addSelect('COUNT(*)', 'value')
      .where('item.organizationId = :organizationId', { organizationId: context.organization.id })
      .andWhere('item.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('DATE(item.createdAt)')
      .orderBy('DATE(item.createdAt)', 'ASC')
      .getRawMany<{ date: string; value: string }>();
    return {
      range: { from: start, to: end },
      performance,
      trends: { bookings: dailyBookings.map((row) => ({ date: row.date, value: Number(row.value) })) },
    };
  }

  async supervisorDashboard(user: AuthUser, period = '30d', organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'analytics:read');
    const [dashboard, analytics, teams] = await Promise.all([
      this.dashboard(user, period, context.organization.id),
      this.analytics(user, new AgentPortalListQueryDto(), context.organization.id),
      this.listTeams(user, context.organization.id),
    ]);
    return { dashboard, analytics, teams };
  }

  async listTasks(user: AuthUser, query: AgentPortalListQueryDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const repository = this.db.getRepository(AgentTask);
    const builder = repository
      .createQueryBuilder('item')
      .where('item.organizationId = :organizationId', { organizationId: context.organization.id });
    if (context.profile.portalRole !== 'supervisor' && user.role !== UserRole.ADMIN) {
      builder.andWhere('(item.assigneeUserId = :userId OR item.createdByUserId = :userId)', {
        userId: user.id,
      });
    }
    this.applyListFilters(builder, query, ['title', 'description', 'category']);
    const [items, total] = await builder
      .orderBy(
        "CASE item.priority WHEN 'EMERGENCY' THEN 1 WHEN 'URGENT' THEN 2 WHEN 'HIGH' THEN 3 ELSE 4 END",
        'ASC',
      )
      .addOrderBy('item.dueAt', 'ASC')
      .addOrderBy('item.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return this.page(items, total, query.page, query.limit);
  }

  async createTask(user: AuthUser, dto: AgentTaskCreateDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const task = await this.db.getRepository(AgentTask).save(
      this.db.getRepository(AgentTask).create({
        organizationId: context.organization.id,
        assigneeUserId: dto.assigneeUserId ?? user.id,
        createdByUserId: user.id,
        title: dto.title,
        description: dto.description,
        category: dto.category ?? 'GENERAL',
        priority: dto.priority?.toUpperCase() ?? 'NORMAL',
        status: 'OPEN',
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        relatedType: dto.relatedType,
        relatedId: dto.relatedId,
        tags: dto.tags,
        metadata: dto.metadata,
      }),
    );
    await this.emit(
      context.organization.id,
      'agent.task.created',
      task,
      [task.assigneeUserId].filter(Boolean) as string[],
    );
    return task;
  }

  async updateTask(user: AuthUser, id: string, dto: AgentTaskUpdateDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const repository = this.db.getRepository(AgentTask);
    const task = await repository.findOne({ where: { id, organizationId: context.organization.id } });
    if (!task) throw new NotFoundException('Task not found');
    if (
      context.profile.portalRole !== 'supervisor' &&
      user.role !== UserRole.ADMIN &&
      task.assigneeUserId !== user.id &&
      task.createdByUserId !== user.id
    ) {
      throw new ForbiddenException('Task access denied');
    }
    Object.assign(task, dto, {
      dueAt: dto.dueAt ? new Date(dto.dueAt) : task.dueAt,
      metadata: dto.metadata ? { ...(task.metadata ?? {}), ...dto.metadata } : task.metadata,
    });
    if (dto.status?.toUpperCase() === 'COMPLETED') task.completedAt = new Date();
    const saved = await repository.save(task);
    await this.emit(
      context.organization.id,
      'agent.task.updated',
      saved,
      [saved.assigneeUserId].filter(Boolean) as string[],
    );
    return saved;
  }

  async deleteTask(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const repository = this.db.getRepository(AgentTask);
    const task = await repository.findOne({ where: { id, organizationId: context.organization.id } });
    if (!task) throw new NotFoundException('Task not found');
    if (
      task.createdByUserId !== user.id &&
      context.profile.portalRole !== 'supervisor' &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('Task access denied');
    }
    await repository.softRemove(task);
    return { deleted: true };
  }

  async listDrafts(user: AuthUser, query: AgentPortalListQueryDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const repository = this.db.getRepository(AgentDraft);
    const builder = repository
      .createQueryBuilder('item')
      .where('item.organizationId = :organizationId', { organizationId: context.organization.id })
      .andWhere('item.agentUserId = :userId', { userId: user.id });
    this.applyListFilters(builder, query, ['title', 'draftType']);
    const [items, total] = await builder
      .orderBy('item.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return this.page(items, total, query.page, query.limit);
  }

  async createDraft(user: AuthUser, dto: AgentDraftCreateDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const repository = this.db.getRepository(AgentDraft);
    const draft = await repository.save(
      repository.create({
        organizationId: context.organization.id,
        agentUserId: user.id,
        draftType: dto.draftType,
        title: dto.title,
        lastStep: dto.lastStep,
        payload: dto.payload,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      }),
    );
    return draft;
  }

  async updateDraft(user: AuthUser, id: string, dto: AgentDraftUpdateDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const repository = this.db.getRepository(AgentDraft);
    const draft = await repository.findOne({
      where: { id, organizationId: context.organization.id, agentUserId: user.id },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    Object.assign(draft, dto, {
      payload: dto.payload ? { ...draft.payload, ...dto.payload } : draft.payload,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : draft.expiresAt,
    });
    return repository.save(draft);
  }

  async deleteDraft(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const repository = this.db.getRepository(AgentDraft);
    const draft = await repository.findOne({
      where: { id, organizationId: context.organization.id, agentUserId: user.id },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    await repository.softRemove(draft);
    return { deleted: true };
  }

  async dispatchHub(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'dispatch:read');
    const [summary, recent, onlineDrivers, availableVehicles] = await Promise.all([
      this.dispatch.dashboard(user, context.organization.id, context.profile.deskId),
      this.dispatch.list(user, context.organization.id, { page: 1, limit: 10 }),
      this.db.getRepository(DriverProfile).find({
        where: { availabilityStatus: In(['ONLINE'] as any[]) },
        order: { rating: 'DESC' },
        take: 50,
      }),
      this.db.getRepository(Vehicle).find({ where: { isActive: true }, take: 50 }),
    ]);
    return { summary, recent, onlineDrivers, availableVehicles };
  }

  async createManualBooking(user: AuthUser, dto: CreateManualBookingDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'dispatch:create');
    dto.deskId ??= context.profile.deskId;
    const result = await this.dispatch.createManualBooking(user, context.organization.id, dto);
    await this.emit(
      context.organization.id,
      'agent.dispatch.booking.created',
      result,
      [user.id],
      ['dispatch.booking.created'],
    );
    return result;
  }

  async listManualBookings(user: AuthUser, query: DispatchListQueryDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    return this.dispatch.list(user, context.organization.id, query);
  }

  async manualBookingDetail(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    return this.dispatch.detail(user, context.organization.id, id);
  }

  async updateManualBooking(
    user: AuthUser,
    id: string,
    dto: UpdateManualBookingDto,
    organizationId?: string,
  ) {
    const context = await this.resolveContext(user, organizationId);
    const result = await this.dispatch.update(user, context.organization.id, id, dto);
    await this.emit(context.organization.id, 'agent.dispatch.booking.updated', result, undefined, [
      'dispatch.booking.updated',
    ]);
    return result;
  }

  async assignManualBooking(
    user: AuthUser,
    id: string,
    dto: AssignManualBookingDto,
    organizationId?: string,
  ) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'dispatch:assign');
    const result = await this.dispatch.assign(user, context.organization.id, id, dto);
    await this.emit(context.organization.id, 'agent.dispatch.booking.assigned', result, undefined, [
      'dispatch.booking.assigned',
    ]);
    return result;
  }

  async addManualBookingNote(user: AuthUser, id: string, dto: DispatchNoteDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    return this.dispatch.addNote(user, context.organization.id, id, dto);
  }

  async cancelManualBooking(
    user: AuthUser,
    id: string,
    dto: ManualBookingActionDto,
    organizationId?: string,
  ) {
    const context = await this.resolveContext(user, organizationId);
    const result = await this.dispatch.cancel(user, context.organization.id, id, dto);
    await this.emit(context.organization.id, 'agent.dispatch.booking.cancelled', result, undefined, [
      'dispatch.booking.cancelled',
    ]);
    return result;
  }

  async syncManualBooking(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    return this.dispatch.syncStatus(user, context.organization.id, id);
  }

  async dispatchBoard(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'dispatch:read');
    const bookings = await this.db.getRepository(ManualBooking).find({
      where: {
        organizationId: context.organization.id,
        status: In([
          ManualBookingStatus.DISPATCH_PENDING,
          ManualBookingStatus.ASSIGNED,
          ManualBookingStatus.CONFIRMED,
          ManualBookingStatus.IN_PROGRESS,
        ]),
      },
      order: { priority: 'DESC', createdAt: 'ASC' },
      take: 200,
    });
    const assignments = bookings.length
      ? await this.db.getRepository(DispatchAssignment).find({
          where: { manualBookingId: In(bookings.map((item) => item.id)) },
          order: { createdAt: 'DESC' },
        })
      : [];
    const columns = {
      pending: bookings.filter((item) => item.status === ManualBookingStatus.DISPATCH_PENDING),
      assigned: bookings.filter((item) => item.status === ManualBookingStatus.ASSIGNED),
      confirmed: bookings.filter((item) => item.status === ManualBookingStatus.CONFIRMED),
      inProgress: bookings.filter((item) => item.status === ManualBookingStatus.IN_PROGRESS),
    };
    return { columns, assignments, generatedAt: new Date() };
  }

  async liveOps(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'live-ops:read');
    const [rides, deliveries, rentals, tours, ambulances, drivers, locations] = await Promise.all([
      this.db.getRepository(Ride).find({
        where: {
          status: In([
            BookingStatus.ACCEPTED,
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.IN_PROGRESS,
          ]),
        },
        order: { updatedAt: 'DESC' },
        take: 100,
      }),
      this.db.getRepository(DeliveryOrder).find({
        where: {
          status: In([
            DeliveryStatus.ACCEPTED,
            DeliveryStatus.DRIVER_ASSIGNED,
            DeliveryStatus.EN_ROUTE_PICKUP,
            DeliveryStatus.PICKED_UP,
            DeliveryStatus.IN_TRANSIT,
          ]),
        },
        order: { updatedAt: 'DESC' },
        take: 100,
      }),
      this.db.getRepository(RentalBooking).find({ order: { updatedAt: 'DESC' }, take: 50 }),
      this.db.getRepository(TouristBooking).find({ order: { updatedAt: 'DESC' }, take: 50 }),
      this.db.getRepository(AmbulanceRequest).find({ order: { updatedAt: 'DESC' }, take: 50 }),
      this.db.getRepository(DriverProfile).find({ order: { lastLocationAt: 'DESC' }, take: 200 }),
      this.db.getRepository(DriverLocation).find({ order: { recordedAt: 'DESC' }, take: 500 }),
    ]);
    const latestLocation = new Map<string, DriverLocation>();
    for (const location of locations)
      if (!latestLocation.has(location.driverId)) latestLocation.set(location.driverId, location);
    return {
      organizationId: context.organization.id,
      services: { rides, deliveries, rentals, tours, ambulances },
      drivers: drivers.map((driver) => ({ ...driver, location: latestLocation.get(driver.id) })),
      generatedAt: new Date(),
    };
  }

  async liveTripDetail(user: AuthUser, serviceType: string, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'live-ops:read');
    const normalized = this.normalizeServiceType(serviceType);
    const manual = await this.db.getRepository(ManualBooking).findOne({
      where: { organizationId: context.organization.id, serviceType: normalized, serviceId: id },
    });
    const service = await this.findService(normalized, id);
    if (!service) throw new NotFoundException('Live operation not found');
    const driverId = (service as any).driverId as string | undefined;
    const driver = driverId ? await this.driverDetail(user, driverId, context.organization.id) : undefined;
    return { serviceType: normalized, service, manualBooking: manual, driver };
  }

  async driverDetail(user: AuthUser, driverId: string, organizationId?: string) {
    await this.resolveContext(user, organizationId);
    const driver = await this.db.getRepository(DriverProfile).findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    const [account, vehicle, documents, vehicleDocuments, location] = await Promise.all([
      this.db.getRepository(User).findOne({ where: { id: driver.userId } }),
      driver.currentVehicleId
        ? this.db.getRepository(Vehicle).findOne({ where: { id: driver.currentVehicleId } })
        : undefined,
      this.db.getRepository(DriverDocument).find({ where: { driverId: driver.id } }),
      driver.currentVehicleId
        ? this.db.getRepository(VehicleDocument).find({ where: { vehicleId: driver.currentVehicleId } })
        : [],
      this.db.getRepository(DriverLocation).findOne({ where: { driverId }, order: { recordedAt: 'DESC' } }),
    ]);
    return { driver, account, vehicle, documents, vehicleDocuments, location };
  }

  async riderProfile(user: AuthUser, riderId: string, organizationId?: string) {
    await this.resolveContext(user, organizationId);
    const account = await this.db.getRepository(User).findOne({ where: { id: riderId } });
    if (!account) throw new NotFoundException('Rider not found');
    const [rides, deliveries, tickets] = await Promise.all([
      this.db.getRepository(Ride).find({ where: { riderId }, order: { createdAt: 'DESC' }, take: 25 }),
      this.db
        .getRepository(DeliveryOrder)
        .find({ where: { customerId: riderId }, order: { createdAt: 'DESC' }, take: 25 }),
      this.db
        .getRepository(SupportTicket)
        .find({ where: { userId: riderId }, order: { createdAt: 'DESC' }, take: 25 }),
    ]);
    return { account, rides, deliveries, tickets };
  }

  async companyProfile(user: AuthUser, companyId: string, organizationId?: string) {
    await this.resolveContext(user, organizationId);
    const organization = await this.db.getRepository(Organization).findOne({ where: { id: companyId } });
    if (!organization) throw new NotFoundException('Company not found');
    const [members, fleet, bookings] = await Promise.all([
      this.db.getRepository(OrganizationMember).find({ where: { organizationId: companyId } }),
      this.db.getRepository(FleetProfile).findOne({ where: { organizationId: companyId } }),
      this.db
        .getRepository(ManualBooking)
        .find({ where: { organizationId: companyId }, order: { createdAt: 'DESC' }, take: 25 }),
    ]);
    return { organization, members, fleet, bookings };
  }

  async listOnboardingCases(user: AuthUser, query: AgentPortalListQueryDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'onboarding:read');
    const repository = this.db.getRepository(OnboardingApplication);
    const builder = repository.createQueryBuilder('item');
    if (query.status) builder.andWhere('item.status = :status', { status: query.status.toUpperCase() });
    if (query.search) {
      builder
        .innerJoin(User, 'user', 'user.id = item.userId')
        .andWhere(
          '(LOWER(user.firstName) LIKE :search OR LOWER(user.lastName) LIKE :search OR LOWER(user.email) LIKE :search)',
          {
            search: `%${query.search.toLowerCase()}%`,
          },
        );
    }
    const [items, total] = await builder
      .orderBy('item.updatedAt', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const users = items.length
      ? await this.db.getRepository(User).find({ where: { id: In(items.map((item) => item.userId)) } })
      : [];
    return {
      ...this.page(items, total, query.page, query.limit),
      users,
    };
  }

  async onboardingCase(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'onboarding:read');
    const application = await this.db.getRepository(OnboardingApplication).findOne({ where: { id } });
    if (!application) throw new NotFoundException('Onboarding case not found');
    const [account, checklist, driver] = await Promise.all([
      this.db.getRepository(User).findOne({ where: { id: application.userId } }),
      this.db
        .getRepository(OnboardingChecklistItem)
        .find({ where: { applicationId: id }, order: { createdAt: 'ASC' } }),
      this.db.getRepository(DriverProfile).findOne({ where: { userId: application.userId } }),
    ]);
    const details = driver ? await this.driverDetail(user, driver.id, context.organization.id) : undefined;
    return { application, account, checklist, driver: details };
  }

  async onboardingAction(user: AuthUser, id: string, dto: AgentOnboardingActionDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'onboarding:update');
    const repository = this.db.getRepository(OnboardingApplication);
    const application = await repository.findOne({ where: { id } });
    if (!application) throw new NotFoundException('Onboarding case not found');
    const action = dto.action.toUpperCase();
    if (dto.checklistKey) {
      const item = await this.db.getRepository(OnboardingChecklistItem).findOne({
        where: { applicationId: id, key: dto.checklistKey },
      });
      if (!item) throw new NotFoundException('Checklist item not found');
      item.status = dto.status?.toUpperCase() ?? (action === 'REJECT' ? 'REJECTED' : 'COMPLETED');
      item.data = { ...(item.data ?? {}), ...(dto.data ?? {}), note: dto.note, reviewedByUserId: user.id };
      if (item.status === 'COMPLETED') item.completedAt = new Date();
      await this.db.getRepository(OnboardingChecklistItem).save(item);
    }
    application.status =
      dto.status?.toUpperCase() ??
      {
        APPROVE: 'APPROVED',
        REJECT: 'REJECTED',
        REQUEST_CHANGES: 'CHANGES_REQUESTED',
        START_REVIEW: 'IN_REVIEW',
      }[action] ??
      application.status;
    application.reviewedByUserId = user.id;
    application.reviewNotes = [application.reviewNotes, dto.note].filter(Boolean).join('\n');
    if (['APPROVED', 'REJECTED'].includes(application.status)) application.reviewedAt = new Date();
    const saved = await repository.save(application);
    await this.emit(context.organization.id, 'agent.onboarding.case.updated', saved, [application.userId]);
    return this.onboardingCase(user, id, context.organization.id);
  }

  async listSupportTickets(user: AuthUser, query: AgentPortalListQueryDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'support:read');
    const repository = this.db.getRepository(SupportTicket);
    const builder = repository.createQueryBuilder('item');
    this.applyListFilters(builder, query, ['subject', 'description', 'category']);
    if (query.assigneeUserId)
      builder.andWhere('item.assignedToUserId = :assigneeUserId', { assigneeUserId: query.assigneeUserId });
    const [items, total] = await builder
      .orderBy(
        "CASE item.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END",
        'ASC',
      )
      .addOrderBy('item.updatedAt', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return this.page(items, total, query.page, query.limit);
  }

  async createSupportTicket(user: AuthUser, dto: AgentSupportTicketDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'support:create');
    const repository = this.db.getRepository(SupportTicket);
    const ticket = await repository.save(
      repository.create({
        userId: dto.userId ?? user.id,
        serviceType: dto.serviceType ? this.normalizeServiceType(dto.serviceType) : undefined,
        serviceId: dto.serviceId,
        category: dto.category,
        priority: this.supportPriority(dto.priority),
        status: SupportTicketStatus.OPEN,
        subject: dto.subject,
        description: dto.description,
        assignedToUserId: dto.assignedToUserId ?? user.id,
        messages: [
          {
            id: `msg-${Date.now()}`,
            senderUserId: user.id,
            senderType: 'AGENT',
            message: dto.description,
            internal: false,
            createdAt: new Date().toISOString(),
            metadata: dto.metadata,
          },
        ],
      }),
    );
    await this.emit(
      context.organization.id,
      'agent.support.ticket.created',
      ticket,
      [ticket.assignedToUserId].filter(Boolean) as string[],
    );
    return ticket;
  }

  async supportTicket(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'support:read');
    const ticket = await this.db.getRepository(SupportTicket).findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    const [customer, assignee, service] = await Promise.all([
      this.db.getRepository(User).findOne({ where: { id: ticket.userId } }),
      ticket.assignedToUserId
        ? this.db.getRepository(User).findOne({ where: { id: ticket.assignedToUserId } })
        : undefined,
      ticket.serviceType && ticket.serviceId
        ? this.findService(ticket.serviceType, ticket.serviceId)
        : undefined,
    ]);
    return { ticket, customer, assignee, service };
  }

  async addTicketMessage(user: AuthUser, id: string, dto: AgentTicketMessageDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'support:reply');
    const repository = this.db.getRepository(SupportTicket);
    const ticket = await repository.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderUserId: user.id,
      senderType: 'AGENT',
      message: dto.message,
      internal: dto.internal ?? false,
      attachments: dto.attachments ?? [],
      createdAt: new Date().toISOString(),
    };
    ticket.messages = [...(ticket.messages ?? []), message];
    if (ticket.status === SupportTicketStatus.OPEN) ticket.status = SupportTicketStatus.IN_PROGRESS;
    const saved = await repository.save(ticket);
    await this.emit(
      context.organization.id,
      'agent.support.message.created',
      { ticketId: id, message },
      [ticket.userId, ticket.assignedToUserId].filter(Boolean) as string[],
    );
    return { ticket: saved, message };
  }

  async ticketAction(user: AuthUser, id: string, dto: AgentTicketActionDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'support:update');
    const repository = this.db.getRepository(SupportTicket);
    const ticket = await repository.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    if (dto.status) ticket.status = this.supportStatus(dto.status);
    if (dto.priority) ticket.priority = this.supportPriority(dto.priority);
    if (dto.assignedToUserId !== undefined) ticket.assignedToUserId = dto.assignedToUserId;
    if (dto.note || dto.reason) {
      ticket.messages = [
        ...(ticket.messages ?? []),
        {
          id: `action-${Date.now()}`,
          senderUserId: user.id,
          senderType: 'SYSTEM',
          internal: true,
          message: [dto.reason, dto.note].filter(Boolean).join(': '),
          createdAt: new Date().toISOString(),
        },
      ];
    }
    const saved = await repository.save(ticket);
    await this.emit(
      context.organization.id,
      'agent.support.ticket.updated',
      saved,
      [saved.userId, saved.assignedToUserId].filter(Boolean) as string[],
    );
    return saved;
  }

  async listSafetyIncidents(user: AuthUser, query: AgentPortalListQueryDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'safety:read');
    const repository = this.db.getRepository(EmergencyIncident);
    const builder = repository.createQueryBuilder('item');
    this.applyListFilters(builder, query, ['description', 'address', 'type']);
    const [items, total] = await builder
      .orderBy('item.sos', 'DESC')
      .addOrderBy('item.createdAt', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return this.page(items, total, query.page, query.limit);
  }

  async createIncident(user: AuthUser, dto: AgentIncidentDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'safety:create');
    const repository = this.db.getRepository(EmergencyIncident);
    const incident = await repository.save(
      repository.create({
        reporterUserId: dto.reporterUserId ?? user.id,
        driverId: dto.driverId,
        serviceType: dto.serviceType ? this.normalizeServiceType(dto.serviceType) : undefined,
        serviceId: dto.serviceId,
        type: this.emergencyType(dto.type),
        status: EmergencyStatus.OPEN,
        description: dto.description,
        latitude: dto.latitude,
        longitude: dto.longitude,
        address: dto.address,
        sos: dto.sos ?? false,
      }),
    );
    await this.db.getRepository(SafetyEventLog).save(
      this.db.getRepository(SafetyEventLog).create({
        incidentId: incident.id,
        referenceType: 'INCIDENT',
        serviceType: incident.serviceType,
        serviceId: incident.serviceId,
        eventType: incident.sos ? 'SOS_CREATED_BY_AGENT' : 'INCIDENT_CREATED_BY_AGENT',
        actorUserId: user.id,
        data: { organizationId: context.organization.id },
      }),
    );
    await this.emit(context.organization.id, 'agent.safety.incident.created', incident, undefined, [
      'safety.incident.new',
    ]);
    return incident;
  }

  async safetyIncident(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'safety:read');
    const incident = await this.db.getRepository(EmergencyIncident).findOne({ where: { id } });
    if (!incident) throw new NotFoundException('Safety incident not found');
    const [logs, reporter, driver, service] = await Promise.all([
      this.db.getRepository(SafetyEventLog).find({ where: { incidentId: id }, order: { createdAt: 'ASC' } }),
      this.db.getRepository(User).findOne({ where: { id: incident.reporterUserId } }),
      incident.driverId ? this.driverDetail(user, incident.driverId, context.organization.id) : undefined,
      incident.serviceType && incident.serviceId
        ? this.findService(incident.serviceType, incident.serviceId)
        : undefined,
    ]);
    return { incident, logs, reporter, driver, service };
  }

  async incidentAction(user: AuthUser, id: string, dto: AgentIncidentActionDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'safety:update');
    const repository = this.db.getRepository(EmergencyIncident);
    const incident = await repository.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('Safety incident not found');
    const action = dto.action.toUpperCase();
    incident.status = dto.status
      ? this.emergencyStatus(dto.status)
      : ({
          ACKNOWLEDGE: EmergencyStatus.ACKNOWLEDGED,
          RESPOND: EmergencyStatus.RESPONDING,
          RESOLVE: EmergencyStatus.RESOLVED,
          CANCEL: EmergencyStatus.CANCELLED,
        }[action] ?? incident.status);
    if ([EmergencyStatus.RESOLVED, EmergencyStatus.CANCELLED].includes(incident.status)) {
      incident.resolvedAt = new Date();
    }
    const saved = await repository.save(incident);
    const log = await this.db.getRepository(SafetyEventLog).save(
      this.db.getRepository(SafetyEventLog).create({
        incidentId: id,
        referenceType: 'INCIDENT',
        serviceType: incident.serviceType,
        serviceId: incident.serviceId,
        eventType: `AGENT_${action}`,
        actorUserId: user.id,
        data: { ...(dto.data ?? {}), note: dto.note, status: saved.status },
      }),
    );
    await this.emit(context.organization.id, 'agent.safety.incident.updated', { incident: saved, log });
    return { incident: saved, log };
  }

  async globalSearch(user: AuthUser, query: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    if (!query?.trim()) return { query, groups: {}, total: 0 };
    const value = `%${query.trim().toLowerCase()}%`;
    const [users, vehicles, bookings, tickets, organizations, drivers] = await Promise.all([
      this.db
        .getRepository(User)
        .createQueryBuilder('item')
        .where(
          'LOWER(item.firstName) LIKE :value OR LOWER(item.lastName) LIKE :value OR LOWER(item.email) LIKE :value OR LOWER(item.phone) LIKE :value',
          { value },
        )
        .take(10)
        .getMany(),
      this.db
        .getRepository(Vehicle)
        .createQueryBuilder('item')
        .where(
          'LOWER(item.make) LIKE :value OR LOWER(item.model) LIKE :value OR LOWER(item.plateNumber) LIKE :value',
          { value },
        )
        .take(10)
        .getMany(),
      this.db
        .getRepository(ManualBooking)
        .createQueryBuilder('item')
        .where('item.organizationId = :organizationId', { organizationId: context.organization.id })
        .andWhere('LOWER(item.reference) LIKE :value OR LOWER(item.serviceId) LIKE :value', { value })
        .take(10)
        .getMany(),
      this.db
        .getRepository(SupportTicket)
        .createQueryBuilder('item')
        .where('LOWER(item.subject) LIKE :value OR LOWER(item.description) LIKE :value', { value })
        .take(10)
        .getMany(),
      this.db
        .getRepository(Organization)
        .createQueryBuilder('item')
        .where('LOWER(item.name) LIKE :value OR LOWER(item.code) LIKE :value', { value })
        .take(10)
        .getMany(),
      this.db
        .getRepository(DriverProfile)
        .createQueryBuilder('driver')
        .innerJoin(User, 'user', 'user.id = driver.userId')
        .where(
          'LOWER(user.firstName) LIKE :value OR LOWER(user.lastName) LIKE :value OR LOWER(user.phone) LIKE :value',
          { value },
        )
        .take(10)
        .getMany(),
    ]);
    const groups = { users, drivers, vehicles, bookings, tickets, organizations };
    return {
      query,
      groups,
      total: Object.values(groups).reduce((total, items) => total + items.length, 0),
    };
  }

  async trainingCentre(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const modules = await this.db.getRepository(AgentTrainingModule).find({
      where: { active: true },
      order: { sequence: 'ASC' },
    });
    const visible = modules.filter(
      (module) => !module.roleScopes?.length || module.roleScopes.includes(context.profile.portalRole),
    );
    const progress = visible.length
      ? await this.db.getRepository(AgentTrainingProgress).find({
          where: { agentUserId: user.id, moduleId: In(visible.map((module) => module.id)) },
        })
      : [];
    const progressByModule = new Map(progress.map((item) => [item.moduleId, item]));
    const items = visible.map((module) => ({ module, progress: progressByModule.get(module.id) }));
    const completed = progress.filter((item) => ['PASSED', 'COMPLETED'].includes(item.status)).length;
    return {
      items,
      summary: {
        total: visible.length,
        completed,
        percent: visible.length ? Math.round((completed / visible.length) * 100) : 100,
        trainingGateComplete: Boolean(context.profile.trainingGateCompletedAt),
      },
    };
  }

  async trainingModule(user: AuthUser, id: string, organizationId?: string) {
    await this.resolveContext(user, organizationId);
    const module = await this.db.getRepository(AgentTrainingModule).findOne({ where: { id, active: true } });
    if (!module) throw new NotFoundException('Training module not found');
    let progress = await this.db.getRepository(AgentTrainingProgress).findOne({
      where: { agentUserId: user.id, moduleId: id },
    });
    if (!progress) {
      progress = await this.db.getRepository(AgentTrainingProgress).save(
        this.db.getRepository(AgentTrainingProgress).create({
          agentUserId: user.id,
          moduleId: id,
          status: 'IN_PROGRESS',
          progressPercent: 1,
          startedAt: new Date(),
        }),
      );
    }
    return { module, progress };
  }

  async submitAssessment(
    user: AuthUser,
    moduleId: string,
    dto: AgentAssessmentSubmissionDto,
    organizationId?: string,
  ) {
    const context = await this.resolveContext(user, organizationId);
    const module = await this.db
      .getRepository(AgentTrainingModule)
      .findOne({ where: { id: moduleId, active: true } });
    if (!module) throw new NotFoundException('Training module not found');
    const repository = this.db.getRepository(AgentTrainingProgress);
    let progress = await repository.findOne({ where: { agentUserId: user.id, moduleId } });
    const score = dto.score ?? this.scoreQuiz(module.quiz, dto.answers ?? {});
    progress ??= repository.create({ agentUserId: user.id, moduleId, startedAt: new Date() });
    progress.attempts = (progress.attempts ?? 0) + 1;
    progress.answers = dto.answers;
    progress.score = score;
    progress.progressPercent = 100;
    progress.completedAt = new Date();
    progress.status = score >= module.passingScore ? 'PASSED' : 'FAILED';
    if (progress.status === 'PASSED') {
      progress.certificateNumber ??= `EVZ-AGT-${new Date().getFullYear()}-${user.id.slice(0, 6).toUpperCase()}-${module.code}`;
      progress.certificateUrl ??= `/api/v1/agent/training/certificates/${moduleId}`;
    }
    const saved = await repository.save(progress);
    if (saved.status === 'PASSED') {
      const centre = await this.trainingCentre(user, context.organization.id);
      if (centre.summary.completed >= centre.summary.total) {
        context.profile.trainingGateCompletedAt ??= new Date();
        await this.db.getRepository(AgentProfile).save(context.profile);
      }
    }
    await this.emit(context.organization.id, 'agent.training.progress.updated', saved, [user.id]);
    return { module, progress: saved, passed: saved.status === 'PASSED' };
  }

  async trainingCertificate(user: AuthUser, moduleId: string, organizationId?: string) {
    await this.resolveContext(user, organizationId);
    const [module, progress, account] = await Promise.all([
      this.db.getRepository(AgentTrainingModule).findOne({ where: { id: moduleId } }),
      this.db.getRepository(AgentTrainingProgress).findOne({ where: { agentUserId: user.id, moduleId } }),
      this.db.getRepository(User).findOne({ where: { id: user.id } }),
    ]);
    if (!module || !progress || progress.status !== 'PASSED') {
      throw new NotFoundException('Training certificate is not available');
    }
    return {
      certificateNumber: progress.certificateNumber,
      recipient: account ? `${account.firstName} ${account.lastName}` : `${user.firstName} ${user.lastName}`,
      module: module.title,
      score: progress.score,
      issuedAt: progress.completedAt,
      issuer: 'EVzone Africa',
      verification: { userId: user.id, moduleId, progressId: progress.id },
    };
  }

  async listQaReviews(user: AuthUser, query: AgentPortalListQueryDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'qa:read');
    const repository = this.db.getRepository(AgentQaReview);
    const builder = repository
      .createQueryBuilder('item')
      .where('item.organizationId = :organizationId', { organizationId: context.organization.id });
    if (query.status) builder.andWhere('item.status = :status', { status: query.status.toUpperCase() });
    if (query.assigneeUserId)
      builder.andWhere('item.agentUserId = :agentUserId', { agentUserId: query.assigneeUserId });
    const [items, total] = await builder
      .orderBy('item.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return this.page(items, total, query.page, query.limit);
  }

  async createQaReview(user: AuthUser, dto: AgentQaReviewDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'qa:create');
    const repository = this.db.getRepository(AgentQaReview);
    const review = await repository.save(
      repository.create({
        organizationId: context.organization.id,
        agentUserId: dto.agentUserId,
        reviewerUserId: dto.reviewerUserId ?? user.id,
        interactionType: dto.interactionType ?? 'SUPPORT',
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        status: dto.status?.toUpperCase() ?? 'PENDING',
        score: dto.score,
        rubric: dto.rubric,
        feedback: dto.feedback,
        coachingPlan: dto.coachingPlan,
        reviewedAt: dto.score !== undefined ? new Date() : undefined,
      }),
    );
    await this.emit(context.organization.id, 'agent.qa.review.created', review, [review.agentUserId]);
    return review;
  }

  async qaReview(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'qa:read');
    const review = await this.db.getRepository(AgentQaReview).findOne({
      where: { id, organizationId: context.organization.id },
    });
    if (!review) throw new NotFoundException('QA review not found');
    const [agent, reviewer] = await Promise.all([
      this.db.getRepository(User).findOne({ where: { id: review.agentUserId } }),
      review.reviewerUserId
        ? this.db.getRepository(User).findOne({ where: { id: review.reviewerUserId } })
        : undefined,
    ]);
    return { review, agent, reviewer };
  }

  async updateQaReview(user: AuthUser, id: string, dto: AgentQaReviewDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertPermission(context, 'qa:update');
    const repository = this.db.getRepository(AgentQaReview);
    const review = await repository.findOne({ where: { id, organizationId: context.organization.id } });
    if (!review) throw new NotFoundException('QA review not found');
    Object.assign(review, dto, {
      reviewerUserId: dto.reviewerUserId ?? user.id,
      status: dto.status?.toUpperCase() ?? review.status,
      rubric: dto.rubric ? { ...(review.rubric ?? {}), ...dto.rubric } : review.rubric,
      coachingPlan: dto.coachingPlan
        ? { ...(review.coachingPlan ?? {}), ...dto.coachingPlan }
        : review.coachingPlan,
      reviewedAt: dto.score !== undefined ? new Date() : review.reviewedAt,
    });
    const saved = await repository.save(review);
    await this.emit(context.organization.id, 'agent.qa.review.updated', saved, [saved.agentUserId]);
    return saved;
  }

  async listTeams(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const teams = await this.db.getRepository(AgentTeam).find({
      where: { organizationId: context.organization.id },
      order: { name: 'ASC' },
    });
    const users = await this.db.getRepository(User).find({
      where: { id: In([...new Set(teams.flatMap((team) => team.memberUserIds ?? []))]) },
    });
    return { teams, users };
  }

  async createTeam(user: AuthUser, dto: AgentTeamDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertManagement(context, user);
    const repository = this.db.getRepository(AgentTeam);
    const team = await repository.save(
      repository.create({
        ...dto,
        organizationId: context.organization.id,
        serviceCapabilities: dto.serviceCapabilities?.map((item) => this.normalizeServiceType(item)),
        active: dto.active ?? true,
      }),
    );
    return team;
  }

  async updateTeam(user: AuthUser, id: string, dto: AgentTeamDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertManagement(context, user);
    const repository = this.db.getRepository(AgentTeam);
    const team = await repository.findOne({ where: { id, organizationId: context.organization.id } });
    if (!team) throw new NotFoundException('Team not found');
    Object.assign(team, dto, {
      serviceCapabilities: dto.serviceCapabilities?.map((item) => this.normalizeServiceType(item)),
      metadata: dto.metadata ? { ...(team.metadata ?? {}), ...dto.metadata } : team.metadata,
    });
    return repository.save(team);
  }

  async teamDetail(user: AuthUser, id: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const team = await this.db.getRepository(AgentTeam).findOne({
      where: { id, organizationId: context.organization.id },
    });
    if (!team) throw new NotFoundException('Team not found');
    const members = team.memberUserIds?.length
      ? await this.db.getRepository(User).find({ where: { id: In(team.memberUserIds) } })
      : [];
    const profiles = members.length
      ? await this.db
          .getRepository(AgentProfile)
          .find({ where: { userId: In(members.map((member) => member.id)) } })
      : [];
    return { team, members, profiles };
  }

  async listRoles(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    return this.db.getRepository(AgentRoleDefinition).find({
      where: { organizationId: context.organization.id },
      order: { isSystem: 'DESC', name: 'ASC' },
    });
  }

  async createRole(user: AuthUser, dto: AgentRoleDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertManagement(context, user);
    return this.db.getRepository(AgentRoleDefinition).save(
      this.db.getRepository(AgentRoleDefinition).create({
        ...dto,
        organizationId: context.organization.id,
        color: dto.color ?? '#03cd8c',
        active: dto.active ?? true,
        isSystem: false,
      }),
    );
  }

  async updateRole(user: AuthUser, id: string, dto: AgentRoleDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    this.assertManagement(context, user);
    const repository = this.db.getRepository(AgentRoleDefinition);
    const role = await repository.findOne({ where: { id, organizationId: context.organization.id } });
    if (!role) throw new NotFoundException('Role not found');
    Object.assign(role, dto, {
      metadata: dto.metadata ? { ...(role.metadata ?? {}), ...dto.metadata } : role.metadata,
    });
    return repository.save(role);
  }

  async listShifts(user: AuthUser, query: AgentPortalListQueryDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const repository = this.db.getRepository(AgentShiftPlan);
    const builder = repository
      .createQueryBuilder('item')
      .where('item.organizationId = :organizationId', { organizationId: context.organization.id });
    if (context.profile.portalRole !== 'supervisor' && user.role !== UserRole.ADMIN) {
      builder.andWhere('item.userId = :userId', { userId: user.id });
    }
    if (query.status) builder.andWhere('item.status = :status', { status: query.status.toUpperCase() });
    if (query.from) builder.andWhere('item.startsAt >= :from', { from: new Date(query.from) });
    if (query.to) builder.andWhere('item.endsAt <= :to', { to: new Date(query.to) });
    const [items, total] = await builder
      .orderBy('item.startsAt', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return this.page(items, total, query.page, query.limit);
  }

  async createShift(user: AuthUser, dto: AgentShiftDto, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    if (dto.userId !== user.id) this.assertManagement(context, user);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('Shift end must be after shift start');
    return this.db.getRepository(AgentShiftPlan).save(
      this.db.getRepository(AgentShiftPlan).create({
        ...dto,
        organizationId: context.organization.id,
        timezone: dto.timezone ?? context.profile.timezone,
        startsAt,
        endsAt,
        status: dto.status?.toUpperCase() ?? 'SCHEDULED',
      }),
    );
  }

  async shiftAction(user: AuthUser, id: string, action: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const repository = this.db.getRepository(AgentShiftPlan);
    const shift = await repository.findOne({ where: { id, organizationId: context.organization.id } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.userId !== user.id) this.assertManagement(context, user);
    switch (action.toUpperCase()) {
      case 'CHECK_IN':
        shift.status = 'CHECKED_IN';
        shift.checkedInAt = new Date();
        context.profile.availabilityStatus = 'AVAILABLE';
        break;
      case 'CHECK_OUT':
        shift.status = 'COMPLETED';
        shift.checkedOutAt = new Date();
        context.profile.availabilityStatus = 'OFFLINE';
        break;
      case 'CANCEL':
        shift.status = 'CANCELLED';
        break;
      default:
        throw new BadRequestException('Unsupported shift action');
    }
    await this.db.getRepository(AgentProfile).save(context.profile);
    const saved = await repository.save(shift);
    await this.emit(context.organization.id, 'agent.shift.updated', saved, [shift.userId]);
    return saved;
  }

  async agents(user: AuthUser, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const profiles = await this.db.getRepository(AgentProfile).find({
      where: { organizationId: context.organization.id },
      order: { employeeCode: 'ASC' },
    });
    const accounts = profiles.length
      ? await this.db.getRepository(User).find({ where: { id: In(profiles.map((item) => item.userId)) } })
      : [];
    return { profiles, accounts };
  }

  async chatWithAgent(user: AuthUser, otherUserId: string, organizationId?: string) {
    const context = await this.resolveContext(user, organizationId);
    const other = await this.db.getRepository(AgentProfile).findOne({
      where: { userId: otherUserId, organizationId: context.organization.id },
    });
    if (!other) throw new NotFoundException('Agent not found');
    const contextId = [user.id, otherUserId].sort().join(':');
    let thread = await this.db
      .getRepository(ChatThread)
      .findOne({ where: { contextType: 'AGENT_DIRECT', contextId } });
    if (!thread) {
      thread = await this.db
        .getRepository(ChatThread)
        .save(
          this.db
            .getRepository(ChatThread)
            .create({ contextType: 'AGENT_DIRECT', contextId, createdByUserId: user.id }),
        );
      await this.db
        .getRepository(ChatParticipant)
        .save([
          this.db.getRepository(ChatParticipant).create({ threadId: thread.id, userId: user.id }),
          this.db.getRepository(ChatParticipant).create({ threadId: thread.id, userId: otherUserId }),
        ]);
    }
    const messages = await this.db.getRepository(ChatMessage).find({
      where: { threadId: thread.id },
      order: { createdAt: 'ASC' },
      take: 200,
    });
    return { thread, messages };
  }

  async sendAgentChat(
    user: AuthUser,
    otherUserId: string,
    message: string,
    attachments: string[] | undefined,
    organizationId?: string,
  ) {
    const context = await this.resolveContext(user, organizationId);
    const chat = await this.chatWithAgent(user, otherUserId, context.organization.id);
    const saved = await this.db.getRepository(ChatMessage).save(
      this.db.getRepository(ChatMessage).create({
        threadId: chat.thread.id,
        senderUserId: user.id,
        body: message,
        attachments,
      }),
    );
    chat.thread.lastMessageAt = new Date();
    await this.db.getRepository(ChatThread).save(chat.thread);
    await this.emit(context.organization.id, 'agent.chat.message.created', saved, [user.id, otherUserId]);
    return saved;
  }

  private async portalContext(user: AuthUser, context: AgentContext) {
    const account = await this.db.getRepository(User).findOne({ where: { id: user.id } });
    const team = context.profile.teamId
      ? await this.db.getRepository(AgentTeam).findOne({ where: { id: context.profile.teamId } })
      : undefined;
    return {
      user: account ?? user,
      profile: context.profile,
      organization: context.organization,
      desk: context.desk,
      team,
      portalRole: context.profile.portalRole,
      permissions: context.permissions,
      trainingGateComplete: Boolean(context.profile.trainingGateCompletedAt),
      features: {
        dashboard: this.hasPermission(context.permissions, 'dashboard:read'),
        analytics: this.hasPermission(context.permissions, 'analytics:read'),
        liveOps: this.hasPermission(context.permissions, 'live-ops:read'),
        dispatch: this.hasPermission(context.permissions, 'dispatch:read'),
        onboarding: this.hasPermission(context.permissions, 'onboarding:read'),
        support: this.hasPermission(context.permissions, 'support:read'),
        safety: this.hasPermission(context.permissions, 'safety:read'),
        qa: this.hasPermission(context.permissions, 'qa:read'),
        training: true,
        settings: context.profile.portalRole === 'supervisor' || user.role === UserRole.ADMIN,
      },
    };
  }

  private async resolveContext(user: AuthUser, requestedOrganizationId?: string): Promise<AgentContext> {
    const profiles = this.db.getRepository(AgentProfile);
    let profile = await profiles.findOne({ where: { userId: user.id, status: MembershipStatus.ACTIVE } });
    if (!profile && user.role === UserRole.ADMIN) {
      const organization = requestedOrganizationId
        ? await this.db.getRepository(Organization).findOne({ where: { id: requestedOrganizationId } })
        : (await this.db.getRepository(Organization).find({ order: { createdAt: 'ASC' }, take: 1 }))[0];
      if (!organization) throw new ForbiddenException('No organization is available for Agent Portal access');
      profile = profiles.create({
        userId: user.id,
        organizationId: organization.id,
        employeeCode: `ADM-${user.id.slice(0, 8).toUpperCase()}`,
        status: MembershipStatus.ACTIVE,
        portalRole: 'supervisor',
        permissions: ['*'],
        canCreateManualBookings: true,
        canAssignDrivers: true,
        canOverridePricing: true,
        canIssueRefunds: true,
        serviceCapabilities: Object.values(ServiceType),
      });
      profile = await profiles.save(profile);
    }
    if (!profile) throw new ForbiddenException('Active Agent Portal profile not found');
    if (
      requestedOrganizationId &&
      requestedOrganizationId !== profile.organizationId &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('Organization access denied');
    }
    const organizationId = requestedOrganizationId ?? profile.organizationId;
    const organization = await this.db.getRepository(Organization).findOne({ where: { id: organizationId } });
    if (!organization) throw new ForbiddenException('Agent organization not found');
    const desk = profile.deskId
      ? await this.db.getRepository(DispatchDesk).findOne({ where: { id: profile.deskId } })
      : undefined;
    const permissions = profile.permissions?.length
      ? profile.permissions
      : (DEFAULT_ROLE_PERMISSIONS[profile.portalRole] ?? DEFAULT_ROLE_PERMISSIONS.support_t1);
    return { profile, organization, desk: desk ?? undefined, permissions };
  }

  private assertPermission(context: AgentContext, permission: string): void {
    if (!this.hasPermission(context.permissions, permission)) {
      throw new ForbiddenException(`Agent permission required: ${permission}`);
    }
  }

  private assertManagement(context: AgentContext, user: AuthUser): void {
    if (user.role !== UserRole.ADMIN && context.profile.portalRole !== 'supervisor') {
      throw new ForbiddenException('Supervisor permission required');
    }
  }

  private hasPermission(permissions: string[], requested: string): boolean {
    if (permissions.includes('*') || permissions.includes(requested)) return true;
    const [scope] = requested.split(':');
    return permissions.includes(`${scope}:*`);
  }

  private page<T>(items: T[], total: number, page: number, limit: number) {
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  private applyListFilters<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
    query: AgentPortalListQueryDto,
    searchColumns: string[],
  ): void {
    if (query.status) builder.andWhere('item.status = :status', { status: query.status.toUpperCase() });
    if (query.priority)
      builder.andWhere('item.priority = :priority', { priority: query.priority.toUpperCase() });
    if (query.category) builder.andWhere('item.category = :category', { category: query.category });
    if (query.from) builder.andWhere('item.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) builder.andWhere('item.createdAt <= :to', { to: new Date(query.to) });
    if (query.search && searchColumns.length) {
      const parts = searchColumns.map((column) => `LOWER(item.${column}) LIKE :search`).join(' OR ');
      builder.andWhere(`(${parts})`, { search: `%${query.search.toLowerCase()}%` });
    }
  }

  private periodStart(period: string): Date {
    const match = /^(\d+)([dhm])$/i.exec(period.trim());
    if (!match) return new Date(Date.now() - 7 * 86400000);
    const value = Number(match[1]);
    const multiplier =
      match[2].toLowerCase() === 'd' ? 86400000 : match[2].toLowerCase() === 'h' ? 3600000 : 60000;
    return new Date(Date.now() - value * multiplier);
  }

  private normalizeServiceType(value: string | ServiceType): ServiceType {
    const normalized = String(value)
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    const aliases: Record<string, ServiceType> = {
      RIDE_HAILING: ServiceType.RIDE,
      RIDE: ServiceType.RIDE,
      DELIVERY: ServiceType.DELIVERY,
      PARCEL: ServiceType.DELIVERY,
      RENTAL: ServiceType.CAR_RENTAL,
      CAR_RENTAL: ServiceType.CAR_RENTAL,
      TOUR: ServiceType.TOURIST_VEHICLE,
      TOURIST: ServiceType.TOURIST_VEHICLE,
      TOURIST_VEHICLE: ServiceType.TOURIST_VEHICLE,
      EMS: ServiceType.AMBULANCE,
      AMBULANCE: ServiceType.AMBULANCE,
      SCHOOL: ServiceType.SCHOOL_SHUTTLE,
      SCHOOL_SHUTTLE: ServiceType.SCHOOL_SHUTTLE,
    };
    const result = aliases[normalized];
    if (!result) throw new BadRequestException(`Unsupported service type: ${value}`);
    return result;
  }

  private supportPriority(value?: string): SupportPriority {
    const normalized = value?.toUpperCase() as SupportPriority | undefined;
    return normalized && Object.values(SupportPriority).includes(normalized)
      ? normalized
      : SupportPriority.NORMAL;
  }

  private supportStatus(value: string): SupportTicketStatus {
    const normalized = value.toUpperCase() as SupportTicketStatus;
    if (!Object.values(SupportTicketStatus).includes(normalized))
      throw new BadRequestException('Unsupported ticket status');
    return normalized;
  }

  private emergencyType(value: string): EmergencyType {
    const normalized = value.toUpperCase().replace(/[\s-]+/g, '_') as EmergencyType;
    return Object.values(EmergencyType).includes(normalized) ? normalized : EmergencyType.OTHER;
  }

  private emergencyStatus(value: string): EmergencyStatus {
    const normalized = value.toUpperCase() as EmergencyStatus;
    if (!Object.values(EmergencyStatus).includes(normalized))
      throw new BadRequestException('Unsupported incident status');
    return normalized;
  }

  private async findService(serviceType: ServiceType, id: string): Promise<unknown> {
    switch (serviceType) {
      case ServiceType.RIDE:
        return this.db.getRepository(Ride).findOne({ where: { id } });
      case ServiceType.DELIVERY:
        return this.db.getRepository(DeliveryOrder).findOne({ where: { id } });
      case ServiceType.CAR_RENTAL:
        return this.db.getRepository(RentalBooking).findOne({ where: { id } });
      case ServiceType.TOURIST_VEHICLE:
        return this.db.getRepository(TouristBooking).findOne({ where: { id } });
      case ServiceType.AMBULANCE:
        return this.db.getRepository(AmbulanceRequest).findOne({ where: { id } });
      case ServiceType.SCHOOL_SHUTTLE:
        return this.db.getRepository(ManualBooking).findOne({ where: { serviceId: id, serviceType } });
    }
  }

  private scoreQuiz(quiz: Record<string, unknown> | undefined, answers: Record<string, unknown>): number {
    const questions = Array.isArray(quiz?.questions)
      ? (quiz?.questions as Array<Record<string, unknown>>)
      : [];
    if (!questions.length) return 100;
    let correct = 0;
    for (const question of questions) {
      const rawKey = question.id ?? question.key;
      const key = typeof rawKey === 'string' || typeof rawKey === 'number' ? String(rawKey) : '';
      const submitted = key ? answers[key] : undefined;
      const expected = question.correctAnswer ?? question.answer;
      if (
        key &&
        (typeof submitted === 'string' || typeof submitted === 'number' || typeof submitted === 'boolean') &&
        (typeof expected === 'string' || typeof expected === 'number' || typeof expected === 'boolean') &&
        String(submitted) === String(expected)
      ) {
        correct += 1;
      }
    }
    return Math.round((correct / questions.length) * 100);
  }

  private async emit(
    organizationId: string,
    event: string,
    data: unknown,
    userIds?: string[],
    aliases?: string[],
  ): Promise<void> {
    const payload: AgentPortalEvent = { organizationId, event, data, userIds, aliases };
    this.events.emit('agent.portal.event', payload);
  }
}
