import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, In, LessThanOrEqual, Repository } from 'typeorm';
import { DomainEventsService } from '../../infrastructure/domain-events.service';
import { UniversalOutboxStatus } from '../domain/universal-dispatch.enums';
import { UniversalDispatchOutboxEvent } from '../domain/universal-dispatch.entities';

export interface UniversalOutboxInput {
  eventId?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion?: number;
  payload: Record<string, unknown>;
  traceId?: string;
  availableAt?: Date;
}

@Injectable()
export class UniversalOutboxService {
  private readonly logger = new Logger(UniversalOutboxService.name);

  constructor(
    @InjectRepository(UniversalDispatchOutboxEvent)
    private readonly eventsRepository: Repository<UniversalDispatchOutboxEvent>,
    private readonly domainEvents: DomainEventsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  enqueue(input: UniversalOutboxInput, manager?: EntityManager): Promise<UniversalDispatchOutboxEvent> {
    const repository = manager ? manager.getRepository(UniversalDispatchOutboxEvent) : this.eventsRepository;
    return repository.save(
      repository.create({
        eventId: input.eventId ?? randomUUID(),
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        eventVersion: input.eventVersion ?? 1,
        payload: input.payload,
        traceId: input.traceId,
        status: UniversalOutboxStatus.PENDING,
        attempts: 0,
        availableAt: input.availableAt ?? new Date(),
      }),
    );
  }

  async flush(limit = 100): Promise<{ processed: number; published: number; failed: number }> {
    const pending = await this.eventsRepository.find({
      where: {
        status: In([UniversalOutboxStatus.PENDING, UniversalOutboxStatus.FAILED]),
        availableAt: LessThanOrEqual(new Date()),
      },
      order: { createdAt: 'ASC' },
      take: Math.min(500, Math.max(1, limit)),
    });
    let published = 0;
    let failed = 0;
    for (const event of pending) {
      const claimed = await this.eventsRepository
        .createQueryBuilder()
        .update(UniversalDispatchOutboxEvent)
        .set({
          status: UniversalOutboxStatus.PROCESSING,
          processingStartedAt: new Date(),
          attempts: () => 'attempts + 1',
        })
        .where('id = :id', { id: event.id })
        .andWhere('status IN (:...statuses)', {
          statuses: [UniversalOutboxStatus.PENDING, UniversalOutboxStatus.FAILED],
        })
        .execute();
      if (!claimed.affected) continue;
      try {
        await this.domainEvents.publish({
          eventId: event.eventId,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          key: event.aggregateId,
          payload: { ...event.payload, traceId: event.traceId },
          occurredAt: event.createdAt,
        });
        this.eventEmitter.emit(event.eventType, event.payload);
        await this.eventsRepository.update(event.id, {
          status: UniversalOutboxStatus.PUBLISHED,
          publishedAt: new Date(),
          lastError: undefined,
        });
        published += 1;
      } catch (error) {
        const attempts = event.attempts + 1;
        const deadLetter = attempts >= Number(process.env.DISPATCH_OUTBOX_MAX_ATTEMPTS ?? 12);
        await this.eventsRepository.update(event.id, {
          status: deadLetter ? UniversalOutboxStatus.DEAD_LETTER : UniversalOutboxStatus.FAILED,
          availableAt: new Date(Date.now() + Math.min(300_000, 2 ** attempts * 1000)),
          lastError: error instanceof Error ? error.message : String(error),
        });
        this.logger.warn(`Dispatch outbox publish failed (${event.eventType}): ${String(error)}`);
        failed += 1;
      }
    }
    return { processed: pending.length, published, failed };
  }

  async retry(id: string): Promise<UniversalDispatchOutboxEvent> {
    const event = await this.eventsRepository.findOneByOrFail({ id });
    event.status = UniversalOutboxStatus.PENDING;
    event.availableAt = new Date();
    event.lastError = undefined;
    return this.eventsRepository.save(event);
  }

  async list(page = 1, limit = 50, status?: UniversalOutboxStatus) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(200, Math.max(1, limit));
    const [items, total] = await this.eventsRepository.findAndCount({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return {
      items,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        pageCount: Math.ceil(total / safeLimit),
      },
    };
  }
}
