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
import { DataSource } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { MembershipStatus, UserRole } from '../common/enums';
import { AgentProfile } from '../database/entities';
import { SocketAuthService } from './socket-auth.service';
import { socketCorsOptions } from './socket-cors';

interface AgentPortalEvent {
  organizationId: string;
  userIds?: string[];
  event: string;
  data: unknown;
  aliases?: string[];
}

@WebSocketGateway({
  namespace: '/agent',
  cors: socketCorsOptions(),
  transports: ['websocket', 'polling'],
})
export class AgentRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AgentRealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: SocketAuthService,
    private readonly db: DataSource,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.auth.authenticate(client, [
        UserRole.AGENT,
        UserRole.DISPATCHER,
        UserRole.SUPPORT,
        UserRole.ADMIN,
      ]);
      const profile = await this.db.getRepository(AgentProfile).findOne({
        where: { userId: user.sub, status: MembershipStatus.ACTIVE },
      });
      if (!profile && user.role !== UserRole.ADMIN) throw new Error('Active Agent Portal profile not found');
      await client.join(this.userRoom(user.sub));
      if (profile) {
        await client.join(this.organizationRoom(profile.organizationId));
        await client.join(this.roleRoom(profile.portalRole));
        if (profile.teamId) await client.join(this.teamRoom(profile.teamId));
        if (profile.deskId) await client.join(this.deskRoom(profile.deskId));
      } else {
        await client.join('agent:administrators');
      }
      client.emit('connected', {
        namespace: '/agent',
        userId: user.sub,
        organizationId: profile?.organizationId,
        portalRole: profile?.portalRole ?? 'supervisor',
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
    this.logger.debug(`Agent socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe.organization')
  async subscribeOrganization(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { organizationId?: string },
  ) {
    const user = this.auth.user(client);
    if (!payload.organizationId) throw new Error('organizationId is required');
    const profile = await this.db.getRepository(AgentProfile).findOne({
      where: { userId: user.sub, status: MembershipStatus.ACTIVE },
    });
    if (user.role !== UserRole.ADMIN && profile?.organizationId !== payload.organizationId) {
      throw new Error('Organization access denied');
    }
    const room = this.organizationRoom(payload.organizationId);
    await client.join(room);
    return { event: 'subscribed', data: { room } };
  }

  @SubscribeMessage('subscribe.queue')
  async subscribeQueue(@ConnectedSocket() client: Socket, @MessageBody() payload: { queue?: string }) {
    if (!payload.queue) throw new Error('queue is required');
    const room = `agent:queue:${payload.queue.toLowerCase()}`;
    await client.join(room);
    return { event: 'subscribed', data: { room } };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: { room?: string }) {
    if (!payload.room?.startsWith('agent:')) throw new Error('Valid agent room is required');
    await client.leave(payload.room);
    return { event: 'unsubscribed', data: { room: payload.room } };
  }

  @SubscribeMessage('ping')
  ping() {
    return { event: 'pong', data: { timestamp: new Date().toISOString() } };
  }

  @OnEvent('agent.portal.event')
  onPortalEvent(payload: AgentPortalEvent): void {
    const rooms = new Set<string>([this.organizationRoom(payload.organizationId), 'agent:administrators']);
    for (const userId of payload.userIds ?? []) rooms.add(this.userRoom(userId));
    for (const room of rooms) {
      this.server?.to(room).emit(payload.event, payload.data);
      for (const alias of payload.aliases ?? []) this.server?.to(room).emit(alias, payload.data);
      this.server?.to(room).emit('agent.event', payload);
    }
  }

  @OnEvent('dispatch.booking.updated')
  onDispatchBooking(payload: { organizationId: string; data: unknown }): void {
    this.server
      ?.to(this.organizationRoom(payload.organizationId))
      .emit('dispatch.booking.updated', payload.data);
  }

  @OnEvent('safety.incident.new')
  onSafetyIncident(payload: unknown): void {
    this.server?.to('agent:role:safety').emit('safety.incident.new', payload);
    this.server?.to('agent:administrators').emit('safety.incident.new', payload);
  }

  private userRoom(userId: string): string {
    return `agent:user:${userId}`;
  }

  private organizationRoom(organizationId: string): string {
    return `agent:organization:${organizationId}`;
  }

  private roleRoom(role: string): string {
    return `agent:role:${role}`;
  }

  private teamRoom(teamId: string): string {
    return `agent:team:${teamId}`;
  }

  private deskRoom(deskId: string): string {
    return `agent:desk:${deskId}`;
  }
}
