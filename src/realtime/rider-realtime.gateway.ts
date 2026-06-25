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
import { ServiceType, UserRole } from '../common/enums';
import { Notification } from '../database/entities';
import { RealtimeAccessService } from './realtime-access.service';
import { SocketAuthService } from './socket-auth.service';
import { socketCorsOptions } from './socket-cors';

@WebSocketGateway({
  namespace: '/rider',
  cors: socketCorsOptions(),
  transports: ['websocket', 'polling'],
})
export class RiderRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RiderRealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: SocketAuthService,
    private readonly access: RealtimeAccessService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const user = await this.auth.authenticate(client, [
        UserRole.RIDER,
        UserRole.CUSTOMER,
        UserRole.ADMIN,
        UserRole.SUPPORT,
      ]);
      const autoSubscribedRooms = await this.auth.joinActiveServiceRooms(client, user);
      client.emit('connected', {
        namespace: '/rider',
        userId: user.sub,
        autoSubscribedRooms,
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
    this.logger.debug(`Rider socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channel?: string; id?: string; serviceType?: string; serviceId?: string },
  ) {
    const identity = this.auth.serviceIdentity(payload);
    await this.access.assertAccess(this.auth.user(client), identity.serviceType, identity.serviceId);
    const room = this.access.room(identity.serviceType, identity.serviceId);
    await client.join(room);
    return { event: 'subscribed', data: { room } };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channel?: string; id?: string; serviceType?: string; serviceId?: string },
  ) {
    const room = this.auth.serviceRoom(payload);
    await client.leave(room);
    return { event: 'unsubscribed', data: { room } };
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
  onServiceUpdated(payload: { serviceType: ServiceType; serviceId: string; data: unknown }) {
    const room = `service:${payload.serviceType}:${payload.serviceId}`;
    this.server?.to(room).emit('service.updated', payload.data);
    const data = this.eventData(payload.data);
    if (data?.event === 'driver.location') {
      this.server?.to(room).emit('trip.location.updated', data.location);
    } else if (payload.serviceType === ServiceType.RIDE) {
      this.server?.to(room).emit('trip.status.changed', payload.data);
    } else if (payload.serviceType === ServiceType.DELIVERY) {
      this.server?.to(room).emit('delivery.status.changed', payload.data);
    }
  }

  private eventData(value: unknown): { event?: string; location?: unknown } | undefined {
    return typeof value === 'object' && value !== null
      ? (value as { event?: string; location?: unknown })
      : undefined;
  }
}
