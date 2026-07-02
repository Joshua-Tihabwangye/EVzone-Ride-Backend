import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BusinessMetricsService } from '../observability/metrics/business-metrics.service';
import { PartnerAdapterRegistry } from './partner-adapter.registry';
import { PartnerQuotaService } from './partner-quota.service';
import { PartnerService } from './partner.service';
import { PartnerWebhookService } from './partner-webhook.service';
import { PartnerScope } from './guards/partner-scope.decorator';
import { PartnerContext } from './partner-adapter.interface';
import { PartnerGuard, PartnerRequest } from './guards/partner.guard';
import { PartnerScopeGuard } from './guards/partner-scope.guard';
import {
  CreatePartnerWebhookDto,
  PartnerAdapterActionDto,
  PartnerOutboxQueryDto,
  PartnerQuotaQueryDto,
  PartnerSelfUpdateDto,
  PartnerWebhookListQueryDto,
  EnqueuePartnerEventDto,
} from './partners.dto';

@ApiTags('Partner Self-Service')
@UseGuards(PartnerGuard)
@Controller('partner/v1')
export class PartnersController {
  constructor(
    private readonly partnerService: PartnerService,
    private readonly quotaService: PartnerQuotaService,
    private readonly webhookService: PartnerWebhookService,
    private readonly adapterRegistry: PartnerAdapterRegistry,
    private readonly metrics: BusinessMetricsService,
  ) {}

  private context(req: PartnerRequest): PartnerContext {
    return req.partner!;
  }

  @Get('profile')
  profile(@Req() req: PartnerRequest) {
    return this.partnerService.getPartner(this.context(req).partnerId);
  }

  @Patch('profile')
  @UseGuards(PartnerScopeGuard)
  @PartnerScope('profile:write')
  updateProfile(@Req() req: PartnerRequest, @Body() dto: PartnerSelfUpdateDto) {
    return this.partnerService.updatePartner(this.context(req).partnerId, {
      webhookUrl: dto.webhookUrl,
      config: dto.config,
    });
  }

  @Post('webhooks')
  @UseGuards(PartnerScopeGuard)
  @PartnerScope('webhooks:write')
  createWebhook(@Req() req: PartnerRequest, @Body() dto: CreatePartnerWebhookDto) {
    return this.partnerService.createWebhookSubscription(this.context(req).partnerId, dto);
  }

  @Get('webhooks')
  listWebhooks(@Req() req: PartnerRequest, @Query() query: PartnerWebhookListQueryDto) {
    return this.partnerService.listWebhookSubscriptions(this.context(req).partnerId, query);
  }

  @Delete('webhooks/:id')
  @UseGuards(PartnerScopeGuard)
  @PartnerScope('webhooks:write')
  revokeWebhook(@Req() req: PartnerRequest, @Param('id') id: string) {
    return this.partnerService.revokeWebhookSubscription(this.context(req).partnerId, id);
  }

  @Get('usage')
  usage(@Req() req: PartnerRequest, @Query() query: PartnerQuotaQueryDto) {
    return this.partnerService.getUsage(this.context(req).partnerId, query);
  }

  @Post('actions/:action')
  @UseGuards(PartnerScopeGuard)
  @PartnerScope('actions:write')
  async dispatchAction(
    @Req() req: PartnerRequest,
    @Param('action') action: string,
    @Body() dto: PartnerAdapterActionDto,
  ) {
    const ctx = this.context(req);
    const adapter = this.adapterRegistry.get(ctx.partnerType);
    await this.quotaService.assertQuota(ctx.partnerId, `actions:${action}`, 1);
    try {
      const result = await adapter.execute(action, dto.payload, ctx);
      this.metrics.recordPartnerRequest(ctx.partnerType, action, 'success');
      return result;
    } catch (error) {
      this.metrics.recordPartnerRequest(ctx.partnerType, action, 'error');
      throw error;
    }
  }

  @Get('events')
  events(@Req() req: PartnerRequest, @Query() query: PartnerOutboxQueryDto) {
    return this.webhookService.listOutbox(this.context(req).partnerId, query);
  }

  @Post('events')
  @UseGuards(PartnerScopeGuard)
  @PartnerScope('events:write')
  enqueueEvent(@Req() req: PartnerRequest, @Body() dto: EnqueuePartnerEventDto) {
    return this.webhookService.enqueueEvent(this.context(req).partnerId, dto);
  }
}
