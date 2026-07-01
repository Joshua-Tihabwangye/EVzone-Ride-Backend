import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { WithSpan } from '../observability/tracing/trace.decorator';
import { WebhookEventStatus } from '../common/enums';
import { WebhookEventRecord } from '../database/entities';
import { WebhookEventProcessor } from './webhook-event.processor';
import { WebhookReplayGuardService } from './webhook-replay-guard.service';
import { WebhookSignatureService } from './webhook-signature.service';

export interface WebhookEventListResult {
  items: WebhookEventRecord[];
  meta: { page: number; limit: number; total: number; pageCount: number };
}

@Injectable()
export class WebhookEventService {
  constructor(
    @InjectRepository(WebhookEventRecord)
    private readonly records: Repository<WebhookEventRecord>,
    private readonly signatures: WebhookSignatureService,
    private readonly replayGuard: WebhookReplayGuardService,
    private readonly processor: WebhookEventProcessor,
  ) {}

  @WithSpan()
  async ingest(
    provider: string,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    payload: Record<string, unknown>,
  ): Promise<{ accepted: boolean; eventId?: string; duplicate?: boolean; status: WebhookEventStatus }> {
    const normalized = provider.trim().toUpperCase();
    const externalEventId = this.extractExternalEventId(normalized, payload);
    const eventType = this.extractEventType(normalized, payload);
    const signature = this.extractSignature(normalized, headers);

    const duplicate = await this.records.findOne({
      where: { provider: normalized, externalEventId },
    });
    if (duplicate) {
      return { accepted: true, duplicate: true, eventId: duplicate.id, status: WebhookEventStatus.DUPLICATE };
    }

    const signatureResult = this.signatures.verify(normalized, rawBody, signature);
    const timestampCheck = this.replayGuard.checkTimestamp(normalized, headers);
    const verified = signatureResult.valid && timestampCheck.valid;

    const record = await this.records.save(
      this.records.create({
        provider: normalized,
        externalEventId,
        eventType,
        status: verified ? WebhookEventStatus.VERIFIED : WebhookEventStatus.REJECTED,
        signatureValid: signatureResult.valid,
        signatureVersion: signatureResult.fingerprint,
        payload,
        receivedAt: new Date(),
        metadata: { timestampCheck },
      }),
    );

    if (!signatureResult.valid) {
      throw new UnauthorizedException('WEBHOOK_SIGNATURE_INVALID');
    }
    if (!timestampCheck.valid) {
      throw new UnauthorizedException(timestampCheck.reason ?? 'WEBHOOK_TIMESTAMP_OUT_OF_TOLERANCE');
    }

    const result = await this.processor.process(record);
    return { ...result, status: record.status };
  }

  async list(
    page = 1,
    limit = 20,
    status?: WebhookEventStatus,
    provider?: string,
  ): Promise<WebhookEventListResult> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (provider) where.provider = provider.trim().toUpperCase();
    const [items, total] = await this.records.findAndCount({
      where,
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

  async retry(
    eventId: string,
  ): Promise<{ accepted: boolean; eventId: string; paymentId?: string; status: WebhookEventStatus }> {
    const record = await this.records.findOne({ where: { id: eventId } });
    if (!record) throw new NotFoundException('Webhook event not found');
    if (record.status === WebhookEventStatus.PROCESSED) {
      return {
        accepted: true,
        eventId: record.id,
        paymentId: record.relatedPaymentId,
        status: record.status,
      };
    }
    record.status = WebhookEventStatus.VERIFIED;
    record.attempts = 0;
    record.nextAttemptAt = new Date();
    record.error = undefined;
    await this.records.save(record);
    const result = await this.processor.process(record);
    return { ...result, status: record.status };
  }

  async claimFailedForRetry(limit = 20): Promise<WebhookEventRecord[]> {
    return this.records.find({
      where: {
        status: WebhookEventStatus.FAILED,
        nextAttemptAt: LessThanOrEqual(new Date()),
      },
      order: { nextAttemptAt: 'ASC' },
      take: Math.max(1, limit),
    });
  }

  private extractExternalEventId(provider: string, payload: Record<string, unknown>): string {
    if (provider === 'PAYTOTA') {
      return String(payload.id ?? payload.event_id ?? payload.reference ?? 'unknown');
    }
    if (provider === 'FLUTTERWAVE') {
      const data = (payload.data ?? {}) as Record<string, unknown>;
      return String(payload.id ?? data.id ?? 'unknown');
    }
    return String(payload.id ?? 'unknown');
  }

  private extractEventType(provider: string, payload: Record<string, unknown>): string {
    if (provider === 'PAYTOTA') {
      return String(payload.event_type ?? 'unknown');
    }
    if (provider === 'FLUTTERWAVE') {
      return String(payload.event ?? 'unknown');
    }
    return String(payload.event_type ?? payload.type ?? 'unknown');
  }

  private extractSignature(
    provider: string,
    headers: Record<string, string | string[] | undefined>,
  ): string | undefined {
    const headerName =
      provider === 'PAYTOTA'
        ? 'x-signature'
        : provider === 'FLUTTERWAVE'
          ? 'verif-hash'
          : 'x-corporatepay-signature';
    const raw = headers[headerName];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim();
  }
}
