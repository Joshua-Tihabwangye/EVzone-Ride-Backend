import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CorporateIntegrationModule } from '../corporate-integration/corporate-integration.module';
import {
  Partner,
  PartnerApiKey,
  PartnerQuotaUsage,
  PartnerWebhookOutbox,
  PartnerWebhookSubscription,
} from '../database/entities';
import { ObservabilityModule } from '../observability/observability.module';
import { CorporatePayPartnerAdapter } from './corporatepay-partner.adapter';
import { PartnerAdapterRegistry } from './partner-adapter.registry';
import { PartnerAuthService } from './partner-auth.service';
import { PartnerQuotaService } from './partner-quota.service';
import { PartnerService } from './partner.service';
import { PartnerWebhookService } from './partner-webhook.service';
import { PartnersAdminController } from './partners-admin.controller';
import { PartnersController } from './partners.controller';
import { PartnerGuard } from './guards/partner.guard';
import { PartnerScopeGuard } from './guards/partner-scope.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Partner,
      PartnerApiKey,
      PartnerWebhookSubscription,
      PartnerQuotaUsage,
      PartnerWebhookOutbox,
    ]),
    CorporateIntegrationModule,
    AuditModule,
    ObservabilityModule,
  ],
  providers: [
    PartnerService,
    PartnerAuthService,
    PartnerQuotaService,
    PartnerWebhookService,
    PartnerAdapterRegistry,
    CorporatePayPartnerAdapter,
    PartnerGuard,
    PartnerScopeGuard,
  ],
  controllers: [PartnersController, PartnersAdminController],
  exports: [PartnerService, PartnerAdapterRegistry],
})
export class PartnersModule {}
