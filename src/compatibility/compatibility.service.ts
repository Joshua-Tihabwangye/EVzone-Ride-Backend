import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipStatus } from '../common/enums';
import { GovernanceService } from '../governance/governance.service';
import {
  FleetAssignment,
  FleetDriver,
  FleetProfile,
  FleetVehicle,
  Organization,
  OrganizationMember,
} from '../database/entities';
import { ROUTE_OWNERSHIP_REGISTRY } from '../infrastructure/route-ownership.registry';

export type CompatibilityAppId = 'rider' | 'driver' | 'fleet' | 'agent' | 'dispatcher' | 'admin';

const CONTRACTS: Record<CompatibilityAppId, Record<string, unknown>> = {
  rider: {
    restBase: '/api/v1/riders/me',
    realtimeNamespace: '/rider',
    routes: [
      'GET /profile',
      'GET /trips/active',
      'GET /trips/history',
      'POST /trips/request',
      'POST /trips/:tripId/cancel',
      'POST /fare-estimate',
      'GET /notifications',
      'GET /wallet',
      'GET /wallet/transactions',
      'GET /payment-methods',
      'POST /payment-intents',
      'POST /sos',
    ],
  },
  driver: {
    restBase: '/api/v1/drivers/me',
    realtimeNamespace: '/driver',
    routes: [
      'POST /presence/online',
      'POST /presence/offline',
      'POST /location/heartbeat',
      'GET /bootstrap',
      'GET /preferences',
      'PATCH /preferences',
      'GET /vehicles',
      'POST /vehicles',
      'PATCH /active-vehicle',
      'GET /jobs',
      'POST /jobs/:jobId/accept',
      'POST /jobs/:jobId/reject',
      'GET /trips/active',
      'POST /trips/:tripId/arrive',
      'POST /trips/:tripId/verify-rider',
      'POST /trips/:tripId/start',
      'POST /trips/:tripId/complete',
      'GET /earnings/summary',
      'GET /cashout/requests',
      'POST /cashout/requests',
    ],
  },
  fleet: {
    restBase: '/api/v1/fleet',
    realtimeNamespace: '/fleet',
    routes: [
      'GET /me/profile',
      'PATCH /me/profile',
      'GET /me/branches',
      'POST /me/branches',
      'GET /me/branches/:branchId',
      'PATCH /me/branches/:branchId',
      'DELETE /me/branches/:branchId',
      'GET /me/settings',
      'PATCH /me/settings',
      'GET /me/security',
      'PATCH /me/security',
      'GET /me/integrations',
      'PATCH /me/integrations',
      'GET /me/roles',
      'PATCH /me/roles',
      'GET /me/notifications',
      'GET /dashboard',
      'GET /map',
      'GET /drivers',
      'POST /drivers',
      'GET /drivers/:driverId',
      'PATCH /drivers/:driverId',
      'GET /vehicles',
      'POST /vehicles',
      'GET /vehicles/:vehicleId',
      'PATCH /vehicles/:vehicleId',
      'GET /dispatches',
      'POST /dispatches',
      'PATCH /dispatches/:dispatchId',
      'GET /rentals',
      'POST /rentals',
      'GET /tours',
      'POST /tours',
      'GET /school-shuttles',
      'POST /school-shuttles',
      'GET /compliance/incidents',
      'POST /compliance/incidents',
      'GET /compliance/training-courses',
      'GET /earnings/payouts',
      'GET /earnings/summary',
      'GET /rider-services',
    ],
  },
  agent: {
    restBase: '/api/v1/agent',
    realtimeNamespace: '/agent',
    routes: [
      'POST /auth/login',
      'POST /auth/refresh',
      'GET /bootstrap',
      'GET /dashboard',
      'GET /analytics',
      'GET /tasks',
      'POST /tasks',
      'GET /drafts',
      'POST /drafts',
      'GET /dispatch/hub',
      'GET /dispatch/board',
      'GET /dispatch/bookings',
      'POST /dispatch/bookings',
      'POST /dispatch/bookings/:bookingId/assign',
      'GET /live-ops',
      'GET /onboarding/drivers',
      'POST /onboarding/cases/:caseId/actions',
      'GET /support/tickets',
      'POST /support/tickets',
      'POST /support/tickets/:ticketId/messages',
      'GET /safety/incidents',
      'POST /safety/incidents/:incidentId/actions',
      'GET /training/modules',
      'POST /training/modules/:moduleId/assessment',
      'GET /qa/reviews',
      'GET /settings/teams',
      'GET /settings/roles',
      'GET /settings/shifts',
    ],
  },
  dispatcher: {
    restBase: '/api/v1/dispatch',
    realtimeNamespace: '/realtime',
    routes: [
      'GET /desks',
      'POST /manual-bookings',
      'GET /manual-bookings',
      'POST /manual-bookings/:id/dispatch',
      'GET /assignments',
    ],
  },
  admin: {
    restBase: '/api/v1/admin',
    realtimeNamespace: '/admin',
    routes: [
      'GET /dashboard',
      'GET /system/flags',
      'PATCH /system/flags/:flagKey',
      'GET /risk/cases',
      'GET /approvals',
      'PATCH /approvals/:approvalId',
      'GET /audit-logs',
      'GET /fleets',
      'GET /manual-bookings',
      'GET /corporate-pay/transactions',
    ],
  },
};

@Injectable()
export class CompatibilityService {
  constructor(
    private readonly governance: GovernanceService,
    @InjectRepository(OrganizationMember)
    private readonly members: Repository<OrganizationMember>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(FleetProfile) private readonly fleets: Repository<FleetProfile>,
    @InjectRepository(FleetVehicle) private readonly fleetVehicles: Repository<FleetVehicle>,
    @InjectRepository(FleetDriver) private readonly fleetDrivers: Repository<FleetDriver>,
    @InjectRepository(FleetAssignment) private readonly assignments: Repository<FleetAssignment>,
  ) {}

  contracts() {
    return {
      version: process.env.npm_package_version ?? '10.0.0',
      generatedAt: new Date().toISOString(),
      apps: CONTRACTS,
      routeOwnership: ROUTE_OWNERSHIP_REGISTRY,
      deprecationPolicy: {
        status: 'legacy-aliases',
        header: 'Deprecation',
        sunsetHeader: 'Sunset',
        legacySunset: process.env.LEGACY_API_SUNSET ?? '2027-06-30',
        successor: '/api/v1/infrastructure/route-ownership',
      },
    };
  }

  contract(appId: string) {
    const id = this.appId(appId);
    return {
      appId: id,
      ...CONTRACTS[id],
      compatibilityStatus: 'legacy-alias',
      canonicalOwners: ROUTE_OWNERSHIP_REGISTRY.filter((owner) => owner.audience === id),
      sunset: process.env.LEGACY_API_SUNSET ?? '2027-06-30',
    };
  }

  realtimeEvents() {
    return {
      namespaces: {
        rider: '/rider',
        driver: '/driver',
        admin: '/admin',
        fleet: '/fleet',
        agent: '/agent',
        legacy: '/realtime',
      },
      namespace: '/realtime',
      clientEvents: ['subscribe', 'subscribe.service', 'unsubscribe.service', 'ping'],
      serverEvents: [
        'connected',
        'notification.created',
        'service.updated',
        'driver.availability',
        'safety.emergency.created',
      ],
      rooms: ['user:{userId}', 'role:{role}', 'service:{serviceType}:{serviceId}', 'fleet:{fleetId}'],
      agent: {
        namespace: '/agent',
        client: {
          subscribeOrganization: 'subscribe.organization',
          subscribeQueue: 'subscribe.queue',
          unsubscribe: 'unsubscribe',
          ping: 'ping',
        },
        server: {
          connected: 'connected',
          envelope: 'agent.event',
          taskCreated: 'agent.task.created',
          taskUpdated: 'agent.task.updated',
          bookingCreated: 'agent.dispatch.booking.created',
          bookingAssigned: 'agent.dispatch.booking.assigned',
          ticketCreated: 'agent.support.ticket.created',
          incidentCreated: 'agent.safety.incident.created',
          onboardingUpdated: 'agent.onboarding.case.updated',
        },
      },
      fleet: {
        namespace: '/fleet',
        client: { subscribe: 'subscribe', unsubscribe: 'unsubscribe', ping: 'ping' },
        server: {
          connected: 'connected',
          dispatchCreated: 'dispatch.created',
          dispatchUpdated: 'dispatch.updated',
          dispatchCompleted: 'dispatch.completed',
          fleetAlert: 'fleet.alert',
          notificationNew: 'notification.new',
          fleetEvent: 'fleet.event',
        },
      },
    };
  }

  async runtimeFlags(appId: string) {
    const id = this.appId(appId);
    const flags = await this.governance.listFlags(id.toUpperCase());
    const global = await this.governance.listFlags('GLOBAL');
    const merged = new Map(global.map((flag) => [flag.key, flag]));
    for (const flag of flags) merged.set(flag.key, flag);
    const values = [...merged.values()];
    const backendControlKeys = new Set([
      'backend.enabled',
      'backendEnabled',
      `${id}.backend.enabled`,
      `${id}.backendEnabled`,
    ]);
    const backendControl = values.find((flag) => backendControlKeys.has(flag.key));
    return {
      appId: id,
      backendEnabled: backendControl?.enabled ?? true,
      flags: values,
    };
  }

  async fleetContext(userId: string) {
    const membership = await this.members.findOne({
      where: { userId, status: MembershipStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });
    if (!membership) return { organization: null, fleet: null, drivers: [], vehicles: [], assignments: [] };
    const [organization, fleet] = await Promise.all([
      this.organizations.findOne({ where: { id: membership.organizationId } }),
      this.fleets.findOne({ where: { organizationId: membership.organizationId } }),
    ]);
    if (!fleet) return { organization, membership, fleet: null, drivers: [], vehicles: [], assignments: [] };
    const [drivers, vehicles, assignments] = await Promise.all([
      this.fleetDrivers.find({ where: { fleetId: fleet.id }, order: { createdAt: 'DESC' } }),
      this.fleetVehicles.find({ where: { fleetId: fleet.id }, order: { createdAt: 'DESC' } }),
      this.assignments.find({ where: { fleetId: fleet.id }, order: { createdAt: 'DESC' }, take: 100 }),
    ]);
    return { organization, membership, fleet, drivers, vehicles, assignments };
  }

  private appId(value: string): CompatibilityAppId {
    const normalized = value.toLowerCase() as CompatibilityAppId;
    if (!(normalized in CONTRACTS)) throw new BadRequestException(`Unsupported appId: ${value}`);
    return normalized;
  }
}
