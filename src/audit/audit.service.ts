import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { signPayload } from '../common/utils/crypto-vault';
import { BusinessMetricsService } from '../observability/metrics/business-metrics.service';
import { AuditLog } from './audit-log.entity';

export interface AuditRecordInput {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  requestId?: string;
  route?: string;
  metadata?: Record<string, unknown>;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return JSON.stringify(value, Object.keys(value as object).sort());
}

function computeChangedFields(
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): string[] | undefined {
  if (!before || !after) return undefined;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (canonicalJson(before[key]) !== canonicalJson(after[key])) {
      changed.push(key);
    }
  }
  return changed.length ? changed : undefined;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    private readonly businessMetrics: BusinessMetricsService,
  ) {}

  private hmacSecret(): string {
    const secret = process.env.AUDIT_HMAC_SECRET ?? process.env.JWT_SECRET;
    if (!secret) {
      this.logger.warn(
        'AUDIT_HMAC_SECRET and JWT_SECRET are both unset; audit checksums will use a deterministic fallback',
      );
      return 'evzone-audit-local-fallback';
    }
    return secret;
  }

  private computeChecksum(input: AuditRecordInput): string {
    const before = input.before ?? undefined;
    const after = input.after ?? undefined;
    const payload = canonicalJson({
      actorUserId: input.actorUserId ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      before,
      after,
      changedFields: before && after ? computeChangedFields(before, after) : undefined,
      reason: input.reason ?? undefined,
      requestId: input.requestId ?? undefined,
      route: input.route ?? undefined,
      metadata: input.metadata ?? undefined,
    });
    return signPayload(payload, this.hmacSecret());
  }

  async record(input: AuditRecordInput, manager?: EntityManager): Promise<AuditLog> {
    const repo = manager ? manager.getRepository(AuditLog) : this.audits;
    const changedFields = computeChangedFields(input.before, input.after);
    const checksum = this.computeChecksum(input);
    const audit = repo.create({
      ...input,
      changedFields,
      checksum,
    });
    const saved = await repo.save(audit);
    this.businessMetrics.recordAuditLog();
    return saved;
  }

  async verify(id: string): Promise<{ valid: boolean; audit: AuditLog | null }> {
    const audit = await this.audits.findOne({ where: { id } });
    if (!audit) return { valid: false, audit: null };
    const expected = this.computeChecksum({
      actorUserId: audit.actorUserId,
      action: audit.action,
      entityType: audit.entityType,
      entityId: audit.entityId,
      before: audit.before,
      after: audit.after,
      reason: audit.reason,
      requestId: audit.requestId,
      route: audit.route,
      metadata: audit.metadata,
    });
    return { valid: audit.checksum === expected, audit };
  }
}
