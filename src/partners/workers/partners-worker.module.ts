import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { ObservabilityModule } from '../../observability/observability.module';
import { PARTNER_WEBHOOK_DELIVERY_QUEUE } from '../../workers/bullmq-config.service';
import { PartnersModule } from '../partners.module';
import { PartnerWebhookDeliveryWorker } from './partner-webhook-delivery.worker';

@Module({})
export class PartnersWorkerModule {
  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL?.trim();

    if (!redisUrl) {
      return {
        module: PartnersWorkerModule,
        imports: [PartnersModule, ObservabilityModule],
      };
    }

    return {
      module: PartnersWorkerModule,
      imports: [
        PartnersModule,
        ObservabilityModule,
        BullModule.registerQueue({ name: PARTNER_WEBHOOK_DELIVERY_QUEUE }),
      ],
      providers: [PartnerWebhookDeliveryWorker],
    };
  }
}
