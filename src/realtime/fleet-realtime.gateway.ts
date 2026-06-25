import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRole } from '../common/enums';
import { FleetPortalService, PortalEvent } from '../fleet-portal/fleet-portal.service';
import { SocketAuthService } from './socket-auth.service';
import { socketCorsOptions } from './socket-cors';

const FLEET_SOCKET_ROLES = [
  UserRole.FLEET_PARTNER,
  UserRole.FLEET_MANAGER,
  UserRole.DISPATCHER,
  UserRole.AGENT,
  UserRole.ADMIN,
];

@WebSocketGateway({
  namespace: '/fleet',
  cors: socketCorsOptions(),
  transports: ['websocket', 'polling'],
})
export class FleetRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(FleetRealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: SocketAuthService,
    private readonly fleetPortal: FleetPortalService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.auth.authenticate(client, FLEET_SOCKET_ROLES);
      const fleetIds = await this.fleetPortal.fleetIdsForUser(user.sub);
      for (const fleetId of fleetIds) await client.join(this.room(fleetId));
      if (user.role === UserRole.ADMIN) await client.join('fleet:all');
      client.emit('connected', {
        namespace: '/fleet',
        userId: user.sub,
        fleetIds,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      client.emit('socket.error', {
        code: 'UNAUTHORIZED',
        message: error instanceof Error ? error.message : String(error),
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Fleet socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: { fleetId?: string }) {
    const user = this.auth.user(client);
    if (!payload.fleetId) throw new Error('fleetId is required');
    const allowed = await this.fleetPortal.fleetIdsForUser(user.sub);
    if (user.role !== UserRole.ADMIN && !allowed.includes(payload.fleetId)) {
      throw new Error('Fleet access denied');
    }
    const room = this.room(payload.fleetId);
    await client.join(room);
    return { event: 'subscribed', data: { room } };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: { fleetId?: string }) {
    if (!payload.fleetId) throw new Error('fleetId is required');
    const room = this.room(payload.fleetId);
    await client.leave(room);
    return { event: 'unsubscribed', data: { room } };
  }

  @SubscribeMessage('ping')
  ping() {
    return { event: 'pong', data: { timestamp: new Date().toISOString() } };
  }

  @OnEvent('fleet.portal.event')
  onFleetPortalEvent(payload: PortalEvent): void {
    const rooms = [this.room(payload.fleetId), 'fleet:all'];
    for (const room of rooms) {
      this.server?.to(room).emit(payload.event, payload.data);
      for (const alias of payload.aliases ?? []) this.server?.to(room).emit(alias, payload.data);
      this.server?.to(room).emit('fleet.event', payload);
    }
  }

  private room(fleetId: string): string {
    return `fleet:${fleetId}`;
  }
}
