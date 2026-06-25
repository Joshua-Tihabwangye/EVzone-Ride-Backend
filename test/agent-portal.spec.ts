import 'reflect-metadata';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { AuthService } from '../src/auth/auth.service';
import {
  AccountStatus,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  UserRole,
} from '../src/common/enums';
import { AuthUser } from '../src/common/interfaces';
import {
  AgentDraft,
  AgentProfile,
  AgentTask,
  AgentTrainingModule,
  ENTITIES,
  Organization,
  User,
} from '../src/database/entities';
import { DispatchService } from '../src/dispatch/dispatch.service';
import {
  AgentDraftCreateDto,
  AgentPortalListQueryDto,
  AgentTaskCreateDto,
  AgentTeamDto,
} from '../src/agent-portal/agent-portal.dto';
import { AgentPortalService } from '../src/agent-portal/agent-portal.service';
import { AgentRealtimeGateway } from '../src/realtime/agent-realtime.gateway';
import { SocketAuthService } from '../src/realtime/socket-auth.service';

describe('Agent Portal v7 contract', () => {
  let db: DataSource;
  let service: AgentPortalService;
  let authUser: AuthUser;
  let organization: Organization;
  const emitted: Array<{ organizationId: string; event: string; data: unknown }> = [];

  beforeAll(async () => {
    db = new DataSource({
      type: 'sqljs',
      entities: [...ENTITIES],
      synchronize: true,
      dropSchema: true,
      logging: false,
    });
    await db.initialize();
    const events = new EventEmitter2();
    events.on('agent.portal.event', (event) => emitted.push(event as (typeof emitted)[number]));
    service = new AgentPortalService(db, {} as AuthService, {} as DispatchService, events);

    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        email: 'agent.contract@evzone.local',
        phone: '+256700333444',
        passwordHash: 'not-used',
        firstName: 'Agent',
        lastName: 'Supervisor',
        role: UserRole.ADMIN,
        status: AccountStatus.ACTIVE,
      }),
    );
    organization = await db.getRepository(Organization).save(
      db.getRepository(Organization).create({
        name: 'Agent Contract Operations',
        code: 'AGENT-CONTRACT',
        type: OrganizationType.AGENT_DISPATCH,
        status: OrganizationStatus.ACTIVE,
        primaryOwnerUserId: user.id,
      }),
    );
    await db.getRepository(AgentProfile).save(
      db.getRepository(AgentProfile).create({
        userId: user.id,
        organizationId: organization.id,
        employeeCode: 'AGT-CONTRACT',
        status: MembershipStatus.ACTIVE,
        portalRole: 'supervisor',
        permissions: ['*'],
        canCreateManualBookings: true,
        canAssignDrivers: true,
        canOverridePricing: true,
        canIssueRefunds: true,
      }),
    );
    authUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  });

  afterAll(async () => {
    if (db.isInitialized) await db.destroy();
  });

  it('hydrates an organisation-scoped Agent Portal profile and wildcard permissions', async () => {
    const result = await service.profile(authUser, organization.id);
    expect(result.organization.id).toBe(organization.id);
    expect(result.portalRole).toBe('supervisor');
    expect(result.permissions).toContain('*');
    expect(result.features.settings).toBe(true);
  });

  it('creates, updates, lists and completes agent tasks', async () => {
    const dto = new AgentTaskCreateDto();
    dto.title = 'Resolve dispatch exception';
    dto.priority = 'HIGH';
    const created = await service.createTask(authUser, dto, organization.id);
    expect(created.status).toBe('OPEN');

    const updated = await service.updateTask(authUser, created.id, { status: 'COMPLETED' }, organization.id);
    expect(updated.status).toBe('COMPLETED');
    expect(updated.completedAt).toBeInstanceOf(Date);

    const query = new AgentPortalListQueryDto();
    const list = await service.listTasks(authUser, query, organization.id);
    expect(list.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
    expect(await db.getRepository(AgentTask).count()).toBe(1);
  });

  it('persists resumable Agent Portal drafts per authenticated agent', async () => {
    const dto = new AgentDraftCreateDto();
    dto.draftType = 'MANUAL_BOOKING';
    dto.title = 'Airport ride draft';
    dto.payload = { pickup: 'Kampala', dropoff: 'Entebbe' };
    const created = await service.createDraft(authUser, dto, organization.id);
    const query = new AgentPortalListQueryDto();
    const drafts = await service.listDrafts(authUser, query, organization.id);
    expect(drafts.items[0].id).toBe(created.id);
    expect(await db.getRepository(AgentDraft).count()).toBe(1);
  });

  it('supports supervisor-managed teams and member detail hydration', async () => {
    const dto = new AgentTeamDto();
    dto.name = 'Safety and Escalations';
    dto.memberUserIds = [authUser.id];
    dto.queueTypes = ['SAFETY', 'SUPPORT'];
    const team = await service.createTeam(authUser, dto, organization.id);
    const detail = await service.teamDetail(authUser, team.id, organization.id);
    expect(detail.members).toHaveLength(1);
    expect(detail.profiles).toHaveLength(1);
  });

  it('records training assessment results and produces a verifiable certificate', async () => {
    const module = await db.getRepository(AgentTrainingModule).save(
      db.getRepository(AgentTrainingModule).create({
        code: 'AGENT-CONTRACT-TRAINING',
        title: 'Agent Contract Training',
        description: 'Contract validation module',
        sequence: 1,
        passingScore: 80,
        roleScopes: ['supervisor'],
        required: true,
        active: true,
      }),
    );
    const result = await service.submitAssessment(
      authUser,
      module.id,
      { score: 95, answers: { q1: 'safe' } },
      organization.id,
    );
    expect(result.passed).toBe(true);
    const certificate = await service.trainingCertificate(authUser, module.id, organization.id);
    expect(certificate.certificateNumber).toContain('EVZ-AGT');
  });

  it('publishes canonical and alias realtime events to organisation and user rooms', () => {
    const gateway = new AgentRealtimeGateway({} as SocketAuthService, db);
    const events: Array<{ room: string; event: string; data: unknown }> = [];
    gateway.server = {
      to: (room: string) => ({
        emit: (event: string, data: unknown) => events.push({ room, event, data }),
      }),
    } as never;
    const payload = {
      organizationId: organization.id,
      userIds: [authUser.id],
      event: 'agent.task.created',
      aliases: ['task.created'],
      data: { id: 'task-1' },
    };
    gateway.onPortalEvent(payload);
    expect(events).toContainEqual({
      room: `agent:organization:${organization.id}`,
      event: 'agent.task.created',
      data: payload.data,
    });
    expect(events).toContainEqual({
      room: `agent:user:${authUser.id}`,
      event: 'task.created',
      data: payload.data,
    });
    expect(emitted.some((event) => event.event === 'agent.task.created')).toBe(true);
  });
});
