import { Injectable, NotFoundException, ConflictException, Optional } from '@nestjs/common';
import { DataSource, Repository, Like } from 'typeorm';
import { randomUUID, createHash } from 'node:crypto';
import { Partner, PartnerApiKey, PartnerQuotaUsage, PartnerWebhookSubscription } from '../database/entities';
import { AuditService } from '../audit/audit.service';
import {
  CreatePartnerApiKeyDto,
  CreatePartnerDto,
  CreatePartnerWebhookDto,
  PartnerListQueryDto,
  PartnerOutboxQueryDto,
  PartnerQuotaQueryDto,
  PartnerWebhookListQueryDto,
  RotatePartnerApiKeyDto,
  SetPartnerQuotaDto,
  UpdatePartnerDto,
} from './partners.dto';

export interface RotatedKeyResult {
  id: string;
  rawKey: string;
  prefix: string;
  scopes: string[];
  expiresAt?: Date;
  createdAt: Date;
}

export function currentQuotaPeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function generateApiKey(): string {
  return `evz_part_${randomUUID().replace(/-/g, '')}`;
}

@Injectable()
export class PartnerService {
  private readonly partners: Repository<Partner>;
  private readonly apiKeys: Repository<PartnerApiKey>;
  private readonly subscriptions: Repository<PartnerWebhookSubscription>;
  private readonly quota: Repository<PartnerQuotaUsage>;

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly audit?: AuditService,
  ) {
    this.partners = db.getRepository(Partner);
    this.apiKeys = db.getRepository(PartnerApiKey);
    this.subscriptions = db.getRepository(PartnerWebhookSubscription);
    this.quota = db.getRepository(PartnerQuotaUsage);
  }

  async createPartner(dto: CreatePartnerDto, createdByUserId?: string): Promise<Partner> {
    const existing = await this.partners.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Partner code '${dto.code}' already exists`);
    const partner = this.partners.create({
      code: dto.code,
      name: dto.name,
      status: 'ACTIVE',
      type: dto.type?.toUpperCase() ?? 'CUSTOM',
      webhookUrl: dto.webhookUrl,
      config: dto.config,
      createdByUserId,
    });
    const saved = await this.partners.save(partner);
    await this.audit?.record({
      actorUserId: createdByUserId,
      action: 'partner.created',
      entityType: 'Partner',
      entityId: saved.id,
      after: saved as unknown as Record<string, unknown>,
    });
    return saved;
  }

  async updatePartner(id: string, dto: UpdatePartnerDto): Promise<Partner> {
    const partner = await this.getPartner(id);
    const before = { ...partner } as unknown as Record<string, unknown>;
    if (dto.name !== undefined) partner.name = dto.name;
    if (dto.status !== undefined) partner.status = dto.status;
    if (dto.webhookUrl !== undefined) partner.webhookUrl = dto.webhookUrl;
    if (dto.config !== undefined) partner.config = dto.config;
    const saved = await this.partners.save(partner);
    await this.audit?.record({
      action: 'partner.updated',
      entityType: 'Partner',
      entityId: saved.id,
      before,
      after: saved as unknown as Record<string, unknown>,
    });
    return saved;
  }

  async listPartners(
    query: PartnerListQueryDto,
  ): Promise<{ items: Partner[]; meta: Record<string, unknown> }> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 250);
    const builder = this.partners.createQueryBuilder('p');
    if (query.status) builder.andWhere('p.status = :status', { status: query.status });
    if (query.type) builder.andWhere('p.type = :type', { type: query.type.toUpperCase() });
    if (query.search) {
      builder.andWhere('(LOWER(p.code) LIKE :search OR LOWER(p.name) LIKE :search)', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }
    const [items, total] = await builder
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async getPartner(id: string): Promise<Partner> {
    const partner = await this.partners.findOne({ where: { id } });
    if (!partner) throw new NotFoundException('Partner not found');
    return partner;
  }

  async findActiveByCode(code: string): Promise<Partner | null> {
    return this.partners.findOne({ where: { code, status: 'ACTIVE' } });
  }

  async rotateApiKey(
    partnerId: string,
    dto: CreatePartnerApiKeyDto | RotatePartnerApiKeyDto,
    createdByUserId?: string,
  ): Promise<RotatedKeyResult> {
    await this.getPartner(partnerId);
    const rawKey = generateApiKey();
    const prefix = rawKey.slice(0, 16);
    const key = this.apiKeys.create({
      partnerId,
      keyHash: hashApiKey(rawKey),
      prefix,
      scopes: dto.scopes,
      status: 'ACTIVE',
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
    const saved = await this.apiKeys.save(key);
    await this.audit?.record({
      actorUserId: createdByUserId,
      action: 'partner.api_key.rotated',
      entityType: 'PartnerApiKey',
      entityId: saved.id,
      after: { partnerId, prefix, scopes: dto.scopes } as Record<string, unknown>,
    });
    return {
      id: saved.id,
      rawKey,
      prefix,
      scopes: saved.scopes,
      expiresAt: saved.expiresAt,
      createdAt: saved.createdAt,
    };
  }

  async revokeApiKey(partnerId: string, keyId: string, revokedByUserId?: string): Promise<PartnerApiKey> {
    const key = await this.apiKeys.findOne({ where: { id: keyId, partnerId } });
    if (!key) throw new NotFoundException('API key not found');
    key.status = 'REVOKED';
    key.revokedAt = new Date();
    key.revokedByUserId = revokedByUserId;
    const saved = await this.apiKeys.save(key);
    await this.audit?.record({
      actorUserId: revokedByUserId,
      action: 'partner.api_key.revoked',
      entityType: 'PartnerApiKey',
      entityId: saved.id,
      before: { status: 'ACTIVE' } as Record<string, unknown>,
      after: saved as unknown as Record<string, unknown>,
    });
    return saved;
  }

  async listApiKeys(partnerId: string): Promise<PartnerApiKey[]> {
    return this.apiKeys.find({ where: { partnerId }, order: { createdAt: 'DESC' } });
  }

  async createWebhookSubscription(
    partnerId: string,
    dto: CreatePartnerWebhookDto,
  ): Promise<PartnerWebhookSubscription> {
    await this.getPartner(partnerId);
    const subscription = this.subscriptions.create({
      partnerId,
      eventTypes: dto.eventTypes,
      url: dto.url,
      secret: dto.secret,
      status: 'ACTIVE',
    });
    return this.subscriptions.save(subscription);
  }

  async listWebhookSubscriptions(
    partnerId: string,
    query: PartnerWebhookListQueryDto,
  ): Promise<{ items: PartnerWebhookSubscription[]; meta: Record<string, unknown> }> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 250);
    const where: Record<string, unknown> = { partnerId };
    if (query.status) where.status = query.status;
    const [items, total] = await this.subscriptions.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async revokeWebhookSubscription(
    partnerId: string,
    subscriptionId: string,
  ): Promise<PartnerWebhookSubscription> {
    const subscription = await this.subscriptions.findOne({ where: { id: subscriptionId, partnerId } });
    if (!subscription) throw new NotFoundException('Webhook subscription not found');
    subscription.status = 'INACTIVE';
    return this.subscriptions.save(subscription);
  }

  async getSubscription(partnerId: string, subscriptionId: string): Promise<PartnerWebhookSubscription> {
    const subscription = await this.subscriptions.findOne({ where: { id: subscriptionId, partnerId } });
    if (!subscription) throw new NotFoundException('Webhook subscription not found');
    return subscription;
  }

  async getUsage(
    partnerId: string,
    query: PartnerQuotaQueryDto,
  ): Promise<{ items: PartnerQuotaUsage[]; meta: Record<string, unknown> }> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 250);
    const where: Record<string, unknown> = { partnerId };
    if (query.period) where.period = query.period;
    if (query.metric) where.metric = query.metric;
    const [items, total] = await this.quota.findAndCount({
      where,
      order: { period: 'DESC', metric: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async setQuota(partnerId: string, dto: SetPartnerQuotaDto): Promise<PartnerQuotaUsage> {
    await this.getPartner(partnerId);
    let row = await this.quota.findOne({ where: { partnerId, period: dto.period, metric: dto.metric } });
    if (!row) {
      row = this.quota.create({
        partnerId,
        period: dto.period,
        metric: dto.metric,
        allowed: dto.allowed,
        used: 0,
      });
    } else {
      row.allowed = dto.allowed;
      row.resetAt = new Date();
    }
    return this.quota.save(row);
  }

  async findActiveApiKeyByHash(keyHash: string): Promise<PartnerApiKey | null> {
    return this.apiKeys.findOne({ where: { keyHash, status: 'ACTIVE' } });
  }

  async updateKeyLastUsed(keyId: string): Promise<void> {
    await this.apiKeys.update(keyId, { lastUsedAt: new Date() });
  }
}
