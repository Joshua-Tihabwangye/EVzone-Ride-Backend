import { FleetRealtimeGateway } from '../src/realtime/fleet-realtime.gateway';
import { SocketAuthService } from '../src/realtime/socket-auth.service';
import { FleetPortalService, PortalEvent } from '../src/fleet-portal/fleet-portal.service';

describe('FleetRealtimeGateway', () => {
  it('publishes canonical, alias and envelope events to tenant and admin rooms', () => {
    const gateway = new FleetRealtimeGateway({} as SocketAuthService, {} as FleetPortalService);
    const emits: Array<{ room: string; event: string; data: unknown }> = [];
    gateway.server = {
      to: (room: string) => ({
        emit: (event: string, data: unknown) => emits.push({ room, event, data }),
      }),
    } as never;

    const payload: PortalEvent = {
      fleetId: 'fleet-1',
      event: 'dispatch.created',
      aliases: ['dispatch.create', 'notification.new'],
      data: { id: 'dispatch-1' },
    };
    gateway.onFleetPortalEvent(payload);

    for (const room of ['fleet:fleet-1', 'fleet:all']) {
      expect(emits).toContainEqual({ room, event: 'dispatch.created', data: payload.data });
      expect(emits).toContainEqual({ room, event: 'dispatch.create', data: payload.data });
      expect(emits).toContainEqual({ room, event: 'notification.new', data: payload.data });
      expect(emits).toContainEqual({ room, event: 'fleet.event', data: payload });
    }
  });
});
