import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { NotificationType, UserRole } from '../common/enums';
import { Notification, User } from '../database/entities';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly repository: Repository<Notification>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly events: EventEmitter2,
    private readonly push: PushNotificationsService,
  ) {}

  async create(input: {
    userId: string;
    type?: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    expiresAt?: Date;
  }): Promise<Notification> {
    const notification = await this.repository.save(
      this.repository.create({ type: NotificationType.SYSTEM, ...input }),
    );
    this.events.emit('notification.created', notification);
    const pushDelivery = this.push.sendToUser(notification.userId, notification);
    if (process.env.NODE_ENV === 'production') await pushDelivery;
    else void pushDelivery;
    this.events.emit('domain.event', {
      eventType: 'notification.queued',
      aggregateType: 'Notification',
      aggregateId: notification.id,
      eventKey: notification.userId,
      payload: {
        notificationId: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
      },
    });
    return notification;
  }

  async broadcastToRoles(
    roles: UserRole[],
    input: Omit<Parameters<NotificationsService['create']>[0], 'userId'>,
  ): Promise<Notification[]> {
    const users = await this.users.find({ where: { role: In(roles) } });
    return Promise.all(users.map((user) => this.create({ ...input, userId: user.id })));
  }

  async list(userId: string, page = 1, limit = 20, unreadOnly = false) {
    const where = unreadOnly ? { userId, readAt: IsNull() } : { userId };
    const [items, total] = await this.repository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async unreadCount(userId: string) {
    return { count: await this.repository.count({ where: { userId, readAt: IsNull() } }) };
  }

  async read(userId: string, id: string) {
    const notification = await this.repository.findOne({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Notification not found');
    notification.readAt = new Date();
    return this.repository.save(notification);
  }

  async readAll(userId: string) {
    await this.repository.update({ userId, readAt: IsNull() }, { readAt: new Date() });
    return { updated: true };
  }
}
