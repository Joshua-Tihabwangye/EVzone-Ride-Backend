import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';
import { IdempotencyRecord } from '../database/entities';
import { verifyCorporatePayRequest } from './corporate-partner-signature';

type RequestLike = {
  method: string;
  originalUrl?: string;
  url?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

function header(request: RequestLike, name: string): string | undefined {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function safeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class CorporatePayPartnerGuard implements CanActivate {
  constructor(
    @InjectRepository(IdempotencyRecord)
    private readonly nonces: Repository<IdempotencyRecord>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const mode = (process.env.CORPORATEPAY_MODE ?? 'sandbox').toLowerCase();
    const configuredApiKey =
      process.env.CORPORATEPAY_PARTNER_API_KEY ?? (mode === 'remote' ? '' : 'evzone-corporatepay-local-key');
    const apiKey = header(request, 'x-corporatepay-api-key');
    const apiKeyOnlyAllowed =
      mode !== 'remote' &&
      !['0', 'false', 'no', 'off'].includes(
        (process.env.CORPORATEPAY_PARTNER_ALLOW_API_KEY_ONLY ?? 'true').toLowerCase(),
      );

    if (
      apiKeyOnlyAllowed &&
      configuredApiKey &&
      apiKey &&
      safeEquals(apiKey, configuredApiKey) &&
      !header(request, 'x-corporatepay-signature')
    ) {
      return true;
    }

    const clientId = header(request, 'x-corporatepay-client-id');
    const timestamp = header(request, 'x-corporatepay-timestamp');
    const nonce = header(request, 'x-corporatepay-nonce');
    const signature = header(request, 'x-corporatepay-signature');
    const expectedClientId = process.env.CORPORATEPAY_PARTNER_CLIENT_ID ?? 'corporatepay';
    const secret =
      process.env.CORPORATEPAY_PARTNER_SHARED_SECRET ??
      (mode === 'remote' ? '' : 'evzone-corporatepay-local-shared-secret');

    if (!clientId || !timestamp || !nonce || !signature || !secret) {
      throw new UnauthorizedException('CorporatePay partner authentication headers are required');
    }
    if (!safeEquals(clientId, expectedClientId)) {
      throw new UnauthorizedException('Unknown CorporatePay partner client');
    }
    if (nonce.length < 12 || nonce.length > 160) {
      throw new UnauthorizedException('CorporatePay request nonce is invalid');
    }

    const timestampMs = this.timestampMs(timestamp);
    const maxSkewSeconds = Number(process.env.CORPORATEPAY_PARTNER_MAX_SKEW_SECONDS ?? 300);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxSkewSeconds * 1000) {
      throw new UnauthorizedException('CorporatePay request timestamp is outside the allowed window');
    }

    const path = request.originalUrl ?? request.url ?? '';
    const valid = verifyCorporatePayRequest(
      {
        timestamp,
        nonce,
        method: request.method,
        path,
        body: request.body,
      },
      signature,
      secret,
    );
    if (!valid) throw new UnauthorizedException('CorporatePay request signature is invalid');

    await this.claimNonce(clientId, nonce, timestamp, maxSkewSeconds);
    return true;
  }

  private timestampMs(value: string): number {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? numeric : numeric * 1000;
    return new Date(value).getTime();
  }

  private async claimNonce(clientId: string, nonce: string, timestamp: string, ttlSeconds: number) {
    const keyHash = createHash('sha256').update(`${clientId}:${nonce}`).digest('hex');
    const existing = await this.nonces.findOne({ where: { keyHash } });
    if (existing) {
      if (existing.expiresAt > new Date()) {
        throw new UnauthorizedException('CorporatePay request nonce has already been used');
      }
      await this.nonces.remove(existing);
    }
    try {
      await this.nonces.save(
        this.nonces.create({
          keyHash,
          scope: 'CORPORATEPAY_PARTNER_NONCE',
          requestHash: createHash('sha256').update(timestamp).digest('hex'),
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + Math.max(ttlSeconds, 60) * 1000),
          completedAt: new Date(),
        }),
      );
      if (Math.random() < 0.01) {
        await this.nonces.delete({
          scope: 'CORPORATEPAY_PARTNER_NONCE',
          expiresAt: LessThan(new Date()),
        });
      }
    } catch {
      throw new UnauthorizedException('CorporatePay request nonce has already been used');
    }
  }
}
