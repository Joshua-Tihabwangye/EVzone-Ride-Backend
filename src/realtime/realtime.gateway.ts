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
import { Notification } from '../database/entities';
import { RealtimeAccessService } from './realtime-access.service';
import { SocketAuthService } from './socket-auth.service';
import { socketCorsOptions } from './socket-cors';

@WebSocketGateway({
  namespace: '/realtime',
  cors: socketCorsOptions(),
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: SocketAuthService,
    private readonly access: RealtimeAccessService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const payload = await this.auth.authenticate(client);
      const autoSubscribedRooms = await this.auth.joinActiveServiceRooms(client, payload);
      client.emit('connected', {
        userId: payload.sub,
        autoSubscribedRooms,
        timestamp: new Date().toISOString(),
      });
    } catch {
      client.emit('error', { message: 'Unauthorized socket connection' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe.service')
  async subscribeService(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { serviceType: string; serviceId: string },
  ) {
    const identity = this.auth.serviceIdentity(payload);
    await this.access.assertAccess(this.auth.user(client), identity.serviceType, identity.serviceId);
    const room = this.access.room(identity.serviceType, identity.serviceId);
    await client.join(room);
    return { event: 'subscribed', data: { room } };
  }

  @SubscribeMessage('unsubscribe.service')
  async unsubscribeService(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { serviceType: string; serviceId: string },
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
  onNotification(notification: Notification): void {
    this.server?.to(`user:${notification.userId}`).emit('notification.created', notification);
  }

  @OnEvent('service.updated')
  onServiceUpdated(payload: { serviceType: string; serviceId: string; data: unknown }): void {
    this.server
      ?.to(`service:${payload.serviceType}:${payload.serviceId}`)
      .emit('service.updated', payload.data);
  }

  @OnEvent('user.event')
  onUserEvent(payload: { userId: string; event: string; data: unknown }): void {
    this.server?.to(`user:${payload.userId}`).emit(payload.event, payload.data);
  }
}
