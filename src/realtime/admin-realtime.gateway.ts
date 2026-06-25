import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRole } from '../common/enums';
import { Notification } from '../database/entities';
import { SocketAuthService } from './socket-auth.service';
import { socketCorsOptions } from './socket-cors';

@WebSocketGateway({
  namespace: '/admin',
  cors: socketCorsOptions(),
  transports: ['websocket', 'polling'],
})
export class AdminRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AdminRealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly auth: SocketAuthService) {}

  async handleConnection(client: Socket) {
    try {
      const user = await this.auth.authenticate(client, [
        UserRole.ADMIN,
        UserRole.SUPPORT,
        UserRole.DISPATCHER,
      ]);
      await client.join('operations');
      await client.join(`user:${user.sub}`);
      client.emit('connected', {
        namespace: '/admin',
        userId: user.sub,
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

  handleDisconnect(client: Socket) {
    this.logger.debug(`Admin socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  ping() {
    return { event: 'pong', data: { timestamp: new Date().toISOString() } };
  }

  @OnEvent('notification.created')
  onNotification(notification: Notification) {
    this.server?.to(`user:${notification.userId}`).emit('notification.created', notification);
  }

  @OnEvent('user.event')
  onUserEvent(payload: { userId: string; event: string; data: unknown }) {
    this.server?.to(`user:${payload.userId}`).emit(payload.event, payload.data);
  }

  @OnEvent('service.updated')
  onServiceUpdated(payload: { serviceType: string; serviceId: string; data: unknown }) {
    this.server?.to('operations').emit('operations.service.updated', payload);
    this.server?.to('operations').emit('service.updated', payload);
    this.server?.to('operations').emit('admin.service.updated', payload);
  }

  @OnEvent('admin.portal.event')
  onAdminPortalEvent(payload: { event: string; data: unknown }) {
    if (!payload?.event) return;
    this.server?.to('operations').emit(payload.event, payload.data);

    const aliases: Record<string, string[]> = {
      'audit.log.entry': ['admin.audit.updated'],
      'approval.reviewed': ['approval.updated'],
      'flag.changed': ['admin.flag.updated'],
      'finance.payout.updated': ['admin.finance.updated'],
      'risk.case.updated': ['admin.risk.updated'],
      'service.updated': ['admin.service.updated'],
    };
    for (const alias of aliases[payload.event] ?? []) {
      this.server?.to('operations').emit(alias, payload.data);
    }
  }

  @OnEvent('domain.event')
  onDomainEvent(payload: Record<string, unknown>) {
    this.server?.to('operations').emit('domain.event', payload);
  }

  @OnEvent('safety.incident.new')
  onSafetyIncident(payload: unknown) {
    this.server?.to('operations').emit('safety.incident.new', payload);
  }
}
