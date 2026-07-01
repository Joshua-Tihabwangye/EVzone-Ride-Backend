import { Injectable, Optional, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac } from 'node:crypto';
import { PartnerWebhookOutbox, PartnerWebhookSubscription } from '../database/entities';
import { BusinessMetricsService } from '../observability/metrics/business-metrics.service';
import { EnqueuePartnerEventDto, PartnerOutboxQueryDto } from './partners.dto';
import { PARTNER_WEBHOOK_DELIVERY_QUEUE } from '../workers/bullmq-config.service';

@Injectable()
export class PartnerWebhookService {
  private readonly logger = new Logger(PartnerWebhookService.name);
  private readonly outbox = () => this.db.getRepository(PartnerWebhookOutbox);
  private readonly subscriptions = () => this.db.getRepository(PartnerWebhookSubscription);

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly metrics?: BusinessMetricsService,
    @Optional() @InjectQueue(PARTNER_WEBHOOK_DELIVERY_QUEUE) private readonly deliveryQueue?: Queue,
  ) {}

  async enqueueEvent(
    partnerId: string,
    dto: EnqueuePartnerEventDto,
  ): Promise<{ enqueued: number; rows: PartnerWebhookOutbox[] }> {
    const active = await this.subscriptions().find({ where: { partnerId, status: 'ACTIVE' } });
    const rows: PartnerWebhookOutbox[] = [];
    for (const subscription of active) {
      if (!subscription.eventTypes.includes(dto.eventType) && !subscription.eventTypes.includes('*'))
        continue;
      const row = this.outbox().create({
        partnerId,
        subscriptionId: subscription.id,
        eventType: dto.eventType,
        externalEventId: dto.externalEventId,
        payload: dto.payload,
        status: 'PENDING',
        attempts: 0,
      });
      rows.push(await this.outbox().save(row));
    }
    if (rows.length && this.deliveryQueue) {
      await this.deliveryQueue.add(
        'deliver',
        { subscriptionId: rows[0].subscriptionId },
        { jobId: `partner-webhook-${rows[0].subscriptionId}-${Date.now()}` },
      );
    }
    await this.updateBacklogGauge();
    return { enqueued: rows.length, rows };
  }

  async listOutbox(
    partnerId: string,
    query: PartnerOutboxQueryDto,
  ): Promise<{ items: PartnerWebhookOutbox[]; meta: Record<string, unknown> }> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 250);
    const where: Record<string, unknown> = { partnerId };
    if (query.status) where.status = query.status;
    if (query.eventType) where.eventType = query.eventType;
    const [items, total] = await this.outbox().findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async retryFailed(partnerId: string): Promise<{ reset: number }> {
    const result = await this.outbox().update(
      { partnerId, status: 'FAILED' },
      { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: undefined },
    );
    await this.updateBacklogGauge();
    return { reset: result.affected ?? 0 };
  }

  async processPendingDeliveries(limit = 25): Promise<{ processed: number }> {
    const now = new Date();
    const rows = await this.outbox()
      .createQueryBuilder('row')
      .where('row.status = :status', { status: 'PENDING' })
      .andWhere('(row.nextAttemptAt IS NULL OR row.nextAttemptAt <= :now)', { now })
      .orderBy('row.createdAt', 'ASC')
      .take(limit)
      .getMany();

    let processed = 0;
    for (const row of rows) {
      processed++;
      const subscription = await this.subscriptions().findOne({ where: { id: row.subscriptionId } });
      if (!subscription || subscription.status !== 'ACTIVE') {
        row.status = 'FAILED';
        row.lastError = 'Subscription is not active';
        await this.outbox().save(row);
        this.metrics?.recordPartnerWebhookDelivered('failed');
        continue;
      }
      try {
        const body = JSON.stringify(row.payload);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Partner-Event': row.eventType,
          'X-Partner-Delivery-Id': row.id,
        };
        if (subscription.secret) {
          headers['X-Partner-Signature'] = createHmac('sha256', subscription.secret)
            .update(body)
            .digest('hex');
        }
        const response = await fetch(subscription.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) {
          row.status = 'DELIVERED';
          row.deliveredAt = new Date();
          row.lastError = undefined;
          this.metrics?.recordPartnerWebhookDelivered('success');
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        row.attempts += 1;
        row.lastError = error instanceof Error ? error.message : String(error);
        row.nextAttemptAt = new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** row.attempts));
        if (row.attempts >= 12) row.status = 'FAILED';
        this.metrics?.recordPartnerWebhookDelivered('failed');
      }
      await this.outbox().save(row);
    }
    await this.updateBacklogGauge();
    return { processed };
  }

  private async updateBacklogGauge(): Promise<void> {
    if (!this.metrics) return;
    const pending = await this.outbox().count({ where: { status: 'PENDING' } });
    this.metrics.setPartnerWebhookBacklog(pending);
  }
}
