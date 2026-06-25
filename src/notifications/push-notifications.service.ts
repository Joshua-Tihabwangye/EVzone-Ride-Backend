import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { In, Repository } from 'typeorm';
import { PushDeliveryStatus, PushPlatform } from '../common/enums';
import { DeviceToken, Notification, PushDelivery } from '../database/entities';
import { RegisterDeviceTokenDto } from './notifications.dto';

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);
  private firebaseReady = false;

  constructor(
    @InjectRepository(DeviceToken) private readonly tokens: Repository<DeviceToken>,
    @InjectRepository(PushDelivery) private readonly deliveries: Repository<PushDelivery>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.provider() === 'FCM') this.initializeFirebase();
  }

  async register(userId: string, dto: RegisterDeviceTokenDto) {
    let token = await this.tokens.findOne({ where: { token: dto.token } });
    token ??= this.tokens.create({ token: dto.token, userId, platform: dto.platform });
    token.userId = userId;
    token.platform = dto.platform;
    token.provider = dto.provider?.toUpperCase() ?? this.provider();
    token.deviceId = dto.deviceId;
    token.metadata = dto.metadata;
    token.active = true;
    token.lastSeenAt = new Date();
    return this.tokens.save(token);
  }

  list(userId: string) {
    return this.tokens.find({ where: { userId, active: true }, order: { lastSeenAt: 'DESC' } });
  }

  async remove(userId: string, id: string) {
    await this.tokens.update({ id, userId }, { active: false });
    return { removed: true };
  }

  async sendToUser(userId: string, notification: Notification): Promise<void> {
    const tokens = await this.tokens.find({ where: { userId, active: true } });
    if (!tokens.length) return;
    const provider = this.provider();
    if (provider === 'FCM' && this.firebaseReady) {
      await this.sendFcm(tokens, notification);
      return;
    }
    if (provider === 'EXPO') {
      await this.sendExpo(tokens, notification);
      return;
    }
    if (provider === 'WEBHOOK') {
      await this.sendWebhook(tokens, notification);
      return;
    }
    await this.deliveries.save(
      this.deliveries.create({
        userId,
        notificationId: notification.id,
        provider: provider || 'LOCAL',
        status: PushDeliveryStatus.SKIPPED,
        attempts: 1,
        response: { reason: 'Push provider disabled; in-app and WebSocket notification retained' },
      }),
    );
  }

  async history(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.deliveries.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  status() {
    return {
      provider: this.provider(),
      firebaseReady: this.firebaseReady,
      webhookConfigured: Boolean(this.config.get<string>('PUSH_WEBHOOK_URL')),
      fallback: 'IN_APP_AND_WEBSOCKET',
    };
  }

  private initializeFirebase(): void {
    try {
      if (!getApps().length) {
        const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
        initializeApp({
          credential: json ? cert(JSON.parse(json) as Record<string, string>) : applicationDefault(),
        });
      }
      this.firebaseReady = true;
      this.logger.log('Firebase Cloud Messaging push adapter initialized');
    } catch (error) {
      this.firebaseReady = false;
      this.logger.warn(
        `FCM initialization failed; in-app/WebSocket fallback active: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async sendFcm(tokens: DeviceToken[], notification: Notification): Promise<void> {
    const eligible = tokens.filter((item) => item.platform !== PushPlatform.EXPO);
    if (!eligible.length) return;
    const delivery = await this.deliveries.save(
      this.deliveries.create({
        userId: notification.userId,
        notificationId: notification.id,
        provider: 'FCM',
        status: PushDeliveryStatus.PENDING,
        attempts: 1,
      }),
    );
    try {
      const response = await getMessaging().sendEachForMulticast({
        tokens: eligible.map((item) => item.token),
        notification: { title: notification.title, body: notification.body },
        data: this.stringData({ notificationId: notification.id, ...(notification.data ?? {}) }),
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
      });
      delivery.status = PushDeliveryStatus.SENT;
      delivery.sentAt = new Date();
      delivery.response = { successCount: response.successCount, failureCount: response.failureCount };
      const invalidIds = response.responses
        .map((item, index) => ({ item, token: eligible[index] }))
        .filter(({ item }) =>
          ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(
            item.error?.code ?? '',
          ),
        )
        .map(({ token }) => token.id);
      if (invalidIds.length) await this.tokens.update({ id: In(invalidIds) }, { active: false });
    } catch (error) {
      delivery.status = PushDeliveryStatus.FAILED;
      delivery.error = error instanceof Error ? error.message : String(error);
    }
    await this.deliveries.save(delivery);
  }

  private async sendExpo(tokens: DeviceToken[], notification: Notification): Promise<void> {
    const eligible = tokens.filter((item) => item.platform === PushPlatform.EXPO);
    if (!eligible.length) return;
    await this.sendHttp(
      'EXPO',
      this.config.get<string>('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send',
      eligible,
      notification,
      eligible.map((item) => ({
        to: item.token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: notification.data,
      })),
    );
  }

  private async sendWebhook(tokens: DeviceToken[], notification: Notification): Promise<void> {
    const url = this.config.get<string>('PUSH_WEBHOOK_URL');
    if (!url) return;
    await this.sendHttp('WEBHOOK', url, tokens, notification, {
      notification: {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        data: notification.data,
      },
      devices: tokens.map((item) => ({
        token: item.token,
        platform: item.platform,
        deviceId: item.deviceId,
      })),
    });
  }

  private async sendHttp(
    provider: string,
    url: string,
    tokens: DeviceToken[],
    notification: Notification,
    body: unknown,
  ): Promise<void> {
    const delivery = await this.deliveries.save(
      this.deliveries.create({
        userId: notification.userId,
        notificationId: notification.id,
        provider,
        status: PushDeliveryStatus.PENDING,
        attempts: 1,
      }),
    );
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(this.config.get<string>('PUSH_TIMEOUT_MS') ?? 5000)),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
      delivery.status = PushDeliveryStatus.SENT;
      delivery.sentAt = new Date();
      delivery.response = { status: response.status, body: text.slice(0, 1000), devices: tokens.length };
    } catch (error) {
      delivery.status = PushDeliveryStatus.FAILED;
      delivery.error = error instanceof Error ? error.message : String(error);
    }
    await this.deliveries.save(delivery);
  }

  private provider(): string {
    return (this.config.get<string>('PUSH_PROVIDER') ?? 'LOCAL').trim().toUpperCase();
  }

  private stringData(data: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ]),
    );
  }
}
