import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';
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

  async begin(input: {
    key: string;
    scope: string;
    userId?: string;
    requestBody?: unknown;
    ttlSeconds?: number;
  }): Promise<IdempotencyBeginResult> {
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
      existing.expiresAt = new Date(Date.now() + (input.ttlSeconds ?? 86400) * 1000);
      return { record: await this.records.save(existing), replay: false };
    }

    try {
      const record = await this.records.save(
        this.records.create({
          keyHash,
          scope: input.scope,
          userId: input.userId,
          requestHash,
          status: 'PROCESSING',
          expiresAt: new Date(Date.now() + (input.ttlSeconds ?? 86400) * 1000),
        }),
      );
      return { record, replay: false };
    } catch {
      const raced = await this.records.findOne({ where: { keyHash } });
      if (raced?.status === 'COMPLETED') return { record: raced, replay: true };
      throw new ConflictException('IDEMPOTENT_REQUEST_IN_PROGRESS');
    }
  }

  async complete(recordId: string, responseBody: unknown, responseStatus = 200): Promise<void> {
    const record = await this.records.findOne({ where: { id: recordId } });
    if (!record) return;
    record.status = 'COMPLETED';
    record.responseBody = responseBody;
    record.responseStatus = responseStatus;
    record.completedAt = new Date();
    await this.records.save(record);
  }

  async fail(recordId: string): Promise<void> {
    await this.records.delete(recordId);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
