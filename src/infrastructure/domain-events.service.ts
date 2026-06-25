import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Kafka, Producer } from 'kafkajs';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { DomainEventStatus } from '../common/enums';
import { DomainEventRecord } from '../database/entities';

export interface DomainEventInput {
  eventId?: string;
  topic?: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  key?: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}

@Injectable()
export class DomainEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventsService.name);
  private producer?: Producer;
  private kafkaConnected = false;
  private timer?: NodeJS.Timeout;
  private flushing = false;
  private lastKafkaConnectAttemptAt = 0;

  constructor(
    @InjectRepository(DomainEventRecord) private readonly records: Repository<DomainEventRecord>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connectKafka();
    const interval = Number(this.config.get<string>('DOMAIN_EVENT_FLUSH_INTERVAL_MS') ?? 10_000);
    this.timer = setInterval(() => void this.flush(), Math.max(1000, interval));
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.producer && this.kafkaConnected) await this.producer.disconnect().catch(() => undefined);
  }

  @OnEvent('domain.event')
  async capture(input: DomainEventInput): Promise<void> {
    await this.publish(input);
  }

  async publish(input: DomainEventInput): Promise<DomainEventRecord> {
    const eventId = input.eventId ?? randomUUID();
    const existing = await this.records.findOne({ where: { eventId } });
    if (existing) return existing;
    const record = await this.records.save(
      this.records.create({
        eventId,
        topic: input.topic ?? this.topicFor(input.eventType),
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventKey: input.key ?? input.aggregateId,
        payload: input.payload,
        status: DomainEventStatus.PENDING,
        occurredAt: input.occurredAt ?? new Date(),
        nextAttemptAt: new Date(),
      }),
    );
    await this.tryPublish(record);
    return record;
  }

  async flush(limit = 100): Promise<{ processed: number }> {
    if (this.flushing) return { processed: 0 };
    this.flushing = true;
    try {
      if (this.kafkaEnabled() && !this.kafkaConnected) await this.connectKafka();
      const pending = await this.records.find({
        where: {
          status: In([DomainEventStatus.PENDING, DomainEventStatus.FAILED]),
          nextAttemptAt: LessThanOrEqual(new Date()),
        },
        order: { occurredAt: 'ASC' },
        take: limit,
      });
      for (const record of pending) await this.tryPublish(record);
      return { processed: pending.length };
    } finally {
      this.flushing = false;
    }
  }

  async retry(id: string): Promise<DomainEventRecord> {
    const record = await this.records.findOneByOrFail({ id });
    record.status = DomainEventStatus.PENDING;
    record.nextAttemptAt = new Date();
    record.lastError = undefined;
    await this.records.save(record);
    await this.tryPublish(record);
    return record;
  }

  list(page = 1, limit = 50, status?: DomainEventStatus) {
    return this.records
      .findAndCount({
        where: status ? { status } : {},
        order: { occurredAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      })
      .then(([items, total]) => ({
        items,
        meta: { page, limit, total, pageCount: Math.ceil(total / limit) },
      }));
  }

  status() {
    return {
      enabled: this.kafkaEnabled(),
      connected: this.kafkaConnected,
      brokers: this.brokers().map((broker) => broker.replace(/^[^@]+@/, '***@')),
      clientId: this.config.get<string>('KAFKA_CLIENT_ID') ?? 'evzone-ride',
      fallback: this.kafkaConnected ? null : 'DURABLE_OUTBOX_AND_CONSOLE',
    };
  }

  private async tryPublish(record: DomainEventRecord): Promise<void> {
    record.attempts += 1;
    if (!this.kafkaConnected || !this.producer) {
      this.logger.debug(
        `[domain-event fallback] ${record.topic}:${record.eventType} ${JSON.stringify(record.payload)}`,
      );
      if (this.kafkaEnabled()) {
        record.status = DomainEventStatus.FAILED;
        record.lastError = 'Kafka unavailable; event retained in outbox and mirrored to console';
        record.nextAttemptAt = new Date(Date.now() + Math.min(300_000, 2 ** record.attempts * 1000));
      } else {
        record.status = DomainEventStatus.FALLBACK;
        record.publishedAt = new Date();
        record.lastError = undefined;
      }
      await this.records.save(record);
      return;
    }
    try {
      await this.producer.send({
        topic: record.topic,
        messages: [
          {
            key: record.eventKey ?? record.aggregateId ?? record.eventId,
            value: JSON.stringify({
              eventId: record.eventId,
              eventType: record.eventType,
              aggregateType: record.aggregateType,
              aggregateId: record.aggregateId,
              occurredAt: record.occurredAt.toISOString(),
              payload: record.payload,
            }),
            headers: { source: 'evzone-ride-backend', schemaVersion: '1' },
          },
        ],
      });
      record.status = DomainEventStatus.PUBLISHED;
      record.publishedAt = new Date();
      record.lastError = undefined;
    } catch (error) {
      record.status = DomainEventStatus.FAILED;
      record.lastError = error instanceof Error ? error.message : String(error);
      this.kafkaConnected = false;
      const producer = this.producer;
      this.producer = undefined;
      if (producer) void producer.disconnect().catch(() => undefined);
      record.nextAttemptAt = new Date(Date.now() + Math.min(300_000, 2 ** record.attempts * 1000));
      this.logger.warn(`Kafka publish failed; event retained in outbox: ${record.lastError}`);
    }
    await this.records.save(record);
  }

  private async connectKafka(): Promise<void> {
    if (!this.kafkaEnabled()) {
      this.logger.log('Kafka disabled; domain events use durable database + console fallback');
      return;
    }
    if (this.kafkaConnected && this.producer) return;
    const retryInterval = Number(this.config.get<string>('KAFKA_RECONNECT_INTERVAL_MS') ?? 30_000);
    if (Date.now() - this.lastKafkaConnectAttemptAt < Math.max(1000, retryInterval)) return;
    this.lastKafkaConnectAttemptAt = Date.now();
    try {
      if (this.producer) await this.producer.disconnect().catch(() => undefined);
      const kafka = new Kafka({
        clientId: this.config.get<string>('KAFKA_CLIENT_ID') ?? 'evzone-ride',
        brokers: this.brokers(),
        connectionTimeout: Number(this.config.get<string>('KAFKA_CONNECTION_TIMEOUT_MS') ?? 5000),
        requestTimeout: Number(this.config.get<string>('KAFKA_REQUEST_TIMEOUT_MS') ?? 30_000),
        ssl: this.config.get<string>('KAFKA_SSL')?.toLowerCase() === 'true',
        sasl: this.sasl(),
      });
      const producer = kafka.producer({ allowAutoTopicCreation: true, idempotent: true });
      await producer.connect();
      this.producer = producer;
      this.kafkaConnected = true;
      this.logger.log(`Kafka producer connected to ${this.brokers().join(', ')}`);
    } catch (error) {
      this.kafkaConnected = false;
      this.producer = undefined;
      this.logger.warn(
        `Kafka unavailable; durable outbox and console fallback active: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private kafkaEnabled(): boolean {
    if (this.config.get<string>('KAFKA_DISABLED')?.toLowerCase() === 'true') return false;
    return this.brokers().length > 0;
  }

  private brokers(): string[] {
    return (this.config.get<string>('KAFKA_BROKERS') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private sasl(): { mechanism: 'plain'; username: string; password: string } | undefined {
    const username = this.config.get<string>('KAFKA_USERNAME');
    const password = this.config.get<string>('KAFKA_PASSWORD');
    return username && password ? { mechanism: 'plain', username, password } : undefined;
  }

  private topicFor(eventType: string): string {
    const prefix = eventType.split('.')[0]?.toLowerCase() || 'platform';
    return `${this.config.get<string>('KAFKA_TOPIC_PREFIX') ?? 'evzone'}.${prefix}.events`;
  }
}
