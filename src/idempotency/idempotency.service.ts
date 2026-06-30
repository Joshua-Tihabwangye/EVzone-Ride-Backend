import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { EntityManager, LessThan, Repository } from 'typeorm';
import { IdempotencyRecord } from '../database/entities';

export interface IdempotencyBeginResult {
  record: IdempotencyRecord;
  replay: boolean;
}

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyRecord)
    private readonly records: Repository<IdempotencyRecord>,
  ) {}

  async begin(
    input: {
      key: string;
      scope: string;
      userId?: string;
      requestBody?: unknown;
      ttlSeconds?: number;
    },
    manager?: EntityManager,
  ): Promise<IdempotencyBeginResult> {
    const ttl = input.ttlSeconds ?? 86_400;
    const repo = manager ? manager.getRepository(IdempotencyRecord) : this.records;

    await this.records.delete({ expiresAt: LessThan(new Date()) });
    const keyHash = this.hash(`${input.userId ?? 'anonymous'}:${input.scope}:${input.key.trim()}`);
    const requestHash = this.hash(JSON.stringify(input.requestBody ?? null));
    const existing = await this.records.findOne({ where: { keyHash } });

    if (existing) {
      if (existing.requestHash && existing.requestHash !== requestHash) {
        throw new ConflictException('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');
      }
      if (existing.status === 'COMPLETED') return { record: existing, replay: true };
      if (existing.status === 'PROCESSING') {
        throw new ConflictException('IDEMPOTENT_REQUEST_IN_PROGRESS');
      }
      existing.status = 'PROCESSING';
      existing.expiresAt = new Date(Date.now() + ttl * 1000);
      return { record: await this.records.save(existing), replay: false };
    }

    try {
      const record = await repo.save(
        repo.create({
          keyHash,
          scope: input.scope,
          userId: input.userId,
          requestHash,
          status: 'PROCESSING',
          expiresAt: new Date(Date.now() + ttl * 1000),
        }),
      );
      return { record, replay: false };
    } catch {
      const raced = await this.records.findOne({ where: { keyHash } });
      if (raced?.status === 'COMPLETED') return { record: raced, replay: true };
      throw new ConflictException('IDEMPOTENT_REQUEST_IN_PROGRESS');
    }
  }

  async complete(
    recordId: string,
    responseBody: unknown,
    responseStatus = 200,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(IdempotencyRecord) : this.records;
    const record = await repo.findOne({ where: { id: recordId } });
    if (!record) return;
    record.status = 'COMPLETED';
    record.responseBody = responseBody;
    record.responseStatus = responseStatus;
    record.completedAt = new Date();
    await repo.save(record);
  }

  /**
   * Failure-safe idempotency cleanup. We intentionally do **not** delete the
   * record: keeping it in PROCESSING with an extended TTL prevents accidental
   * replays while the original failure reason is still being investigated,
   * and avoids later requests reusing the same key to retry a failed operation
   * automatically.
   */
  async fail(recordId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(IdempotencyRecord) : this.records;
    const record = await repo.findOne({ where: { id: recordId } });
    if (!record) return;

    const ttlSeconds = Number(process.env.IDEMPOTENCY_TTL_SECONDS ?? 86_400);
    record.expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await repo.save(record);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
