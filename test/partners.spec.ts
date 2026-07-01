import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENTITIES, Partner } from '../src/database/entities';
import { PartnerAdapterRegistry } from '../src/partners/partner-adapter.registry';
import { CorporatePayPartnerAdapter } from '../src/partners/corporatepay-partner.adapter';
import { PartnerAuthService } from '../src/partners/partner-auth.service';
import { PartnerQuotaService } from '../src/partners/partner-quota.service';
import { PartnerService, currentQuotaPeriod } from '../src/partners/partner.service';
import { PartnerWebhookService } from '../src/partners/partner-webhook.service';
import { PartnerGuard } from '../src/partners/guards/partner.guard';
import { PartnerScopeGuard } from '../src/partners/guards/partner-scope.guard';


const auditMock = { record: jest.fn().mockResolvedValue({}) };
const metricsMock = {
  recordPartnerRequest: jest.fn(),
  recordPartnerWebhookDelivered: jest.fn(),
  setPartnerWebhookBacklog: jest.fn(),
  recordQueueJob: jest.fn(),
};

describe('Partner Integration Framework', () => {
  let db: DataSource;
  let partnerService: PartnerService;
  let authService: PartnerAuthService;
  let quotaService: PartnerQuotaService;
  let webhookService: PartnerWebhookService;
  let registry: PartnerAdapterRegistry;
  let adapter: CorporatePayPartnerAdapter;
  let partner: Partner;
  let rawKey: string;

  beforeAll(async () => {
    db = new DataSource({
      type: 'sqljs',
      entities: [...ENTITIES],
      synchronize: true,
      dropSchema: true,
      logging: false,
    });
    await db.initialize();

    partnerService = new PartnerService(db, auditMock as never);
    authService = new PartnerAuthService(db);
    quotaService = new PartnerQuotaService(db);
    webhookService = new PartnerWebhookService(db, metricsMock as never);
    registry = new PartnerAdapterRegistry();
    const corporateMock = {
      capabilities: jest.fn().mockReturnValue({ version: '1' }),
      catalog: jest.fn().mockReturnValue({ currency: 'UGX' }),
      quote: jest.fn().mockResolvedValue({ quoteId: 'q1' }),
      listEvents: jest.fn().mockResolvedValue({ items: [] }),
    };
    adapter = new CorporatePayPartnerAdapter(corporateMock as never, registry);
    adapter.onModuleInit();
  }, 60_000);

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await db.getRepository('partner_webhook_outbox').clear();
    await db.getRepository('partner_webhook_subscriptions').clear();
    await db.getRepository('partner_quota_usage').clear();
    await db.getRepository('partner_api_keys').clear();
    await db.getRepository(Partner).clear();
  });

  it('creates and lists partners', async () => {
    const created = await partnerService.createPartner({
      code: 'ACME',
      name: 'Acme Corp',
      type: 'CORPORATEPAY',
    });
    expect(created.status).toBe('ACTIVE');
    expect(created.type).toBe('CORPORATEPAY');

    const list = await partnerService.listPartners({});
    expect(list.items).toHaveLength(1);
    expect(list.meta.total).toBe(1);
  });

  it('rotates an API key and validates it', async () => {
    partner = await partnerService.createPartner({ code: 'KEYTEST', name: 'Key Test' });
    const rotated = await partnerService.rotateApiKey(partner.id, {
      scopes: ['profile:read', 'actions:write'],
    });
    rawKey = rotated.rawKey;
    expect(rawKey.startsWith('evz_part_')).toBe(true);

    const ctx = await authService.validateKey(rawKey);
    expect(ctx.partnerId).toBe(partner.id);
    expect(ctx.partnerType).toBe('CUSTOM');
    expect(ctx.scopes).toContain('profile:read');

    await expect(authService.validateKey(`${rawKey}x`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes an API key', async () => {
    partner = await partnerService.createPartner({ code: 'REVTEST', name: 'Revoke Test' });
    const rotated = await partnerService.rotateApiKey(partner.id, { scopes: ['profile:read'] });
    await partnerService.revokeApiKey(partner.id, rotated.id);
    await expect(authService.validateKey(rotated.rawKey)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enforces partner quotas', async () => {
    partner = await partnerService.createPartner({ code: 'QUOTATEST', name: 'Quota Test' });
    await partnerService.setQuota(partner.id, {
      metric: 'actions:test',
      period: currentQuotaPeriod(),
      allowed: 2,
    });

    await quotaService.assertQuota(partner.id, 'actions:test', 1);
    await quotaService.assertQuota(partner.id, 'actions:test', 1);
    await expect(quotaService.assertQuota(partner.id, 'actions:test', 1)).rejects.toBeInstanceOf(HttpException);
  });

  it('creates webhook subscriptions and enqueues outbox rows', async () => {
    partner = await partnerService.createPartner({
      code: 'WEBTEST',
      name: 'Webhook Test',
      type: 'CORPORATEPAY',
    });
    const sub = await partnerService.createWebhookSubscription(partner.id, {
      eventTypes: ['service_request.created'],
      url: 'https://example.com/webhook',
      secret: 'shh',
    });

    const result = await webhookService.enqueueEvent(partner.id, {
      eventType: 'service_request.created',
      payload: { id: '123' },
    });
    expect(result.enqueued).toBe(1);
    expect(result.rows[0].subscriptionId).toBe(sub.id);

    const events = await webhookService.listOutbox(partner.id, {});
    expect(events.items).toHaveLength(1);
  });

  it('delivers pending webhooks via the worker service', async () => {
    partner = await partnerService.createPartner({
      code: 'DELTEST',
      name: 'Delivery Test',
      type: 'CORPORATEPAY',
    });
    await partnerService.createWebhookSubscription(partner.id, {
      eventTypes: ['service_request.created'],
      url: 'https://partner.example/hook',
      secret: 'secret',
    });
    await webhookService.enqueueEvent(partner.id, {
      eventType: 'service_request.created',
      payload: { id: '456' },
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    const { processed } = await webhookService.processPendingDeliveries(10);
    expect(processed).toBe(1);

    const events = await webhookService.listOutbox(partner.id, { status: 'DELIVERED' });
    expect(events.items).toHaveLength(1);
  });

  it('resolves the CorporatePay adapter from the registry', () => {
    expect(registry.has('CORPORATEPAY')).toBe(true);
    expect(registry.get('corporatepay')).toBe(adapter);
  });

  it('executes CorporatePay adapter actions', async () => {
    const result = await adapter.execute(
      'capabilities',
      {},
      {
        partnerId: partner.id,
        partnerType: 'CORPORATEPAY',
        scopes: ['actions:write'],
      },
    );
    expect(result).toEqual({ version: '1' });
  });

  it('rejects unsupported adapter actions', async () => {
    await expect(
      adapter.execute('unsupported', {}, { partnerId: 'x', partnerType: 'CORPORATEPAY', scopes: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes events into PartnerEventPayload shape', () => {
    const normalized = adapter.normalizeEvent({ eventType: 'service_request.created', payload: { id: '1' } });
    expect(normalized?.eventType).toBe('service_request.created');
    expect(normalized?.payload.id).toBe('1');
  });

  it('PartnerGuard attaches partner context from header', async () => {
    partner = await partnerService.createPartner({ code: 'GUARDTEST', name: 'Guard Test' });
    const rotated = await partnerService.rotateApiKey(partner.id, { scopes: ['profile:read'] });
    const guard = new PartnerGuard(authService);

    const request = { headers: { 'x-partner-api-key': rotated.rawKey } } as unknown as Record<
      string,
      unknown
    >;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    expect(await guard.canActivate(context)).toBe(true);
    expect((request as { partner?: { partnerId: string } }).partner?.partnerId).toBe(partner.id);
  });

  it('PartnerScopeGuard enforces required scopes', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['actions:write']) } as unknown as Reflector;
    const guard = new PartnerScopeGuard(reflector);

    const request = {
      partner: { partnerId: 'p1', partnerType: 'CUSTOM', scopes: ['profile:read'] },
    } as unknown as Record<string, unknown>;
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);

    request.partner = { partnerId: 'p1', partnerType: 'CUSTOM', scopes: ['actions:write'] };
    expect(await guard.canActivate(context)).toBe(true);
  });
});
