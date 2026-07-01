import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObservabilityModule } from '../observability/observability.module';
import { Payment, WebhookEventRecord } from '../database/entities';
import { PaymentsModule } from '../payments/payments.module';
import { FlutterwaveWebhookAdapter } from './adapters/flutterwave-webhook.adapter';
import { PaytotaWebhookAdapter } from './adapters/paytota-webhook.adapter';
import { WebhookEventProcessor } from './webhook-event.processor';
import { WebhookEventService } from './webhook-event.service';
import { WebhookRawBodyMiddleware } from './webhook-raw-body.middleware';
import { WebhookReplayGuardService } from './webhook-replay-guard.service';
import { WebhookRetryWorker } from './webhook-retry.worker';
import { WebhookSignatureService } from './webhook-signature.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEventRecord, Payment]), PaymentsModule, ObservabilityModule],
  controllers: [WebhooksController],
  providers: [
    WebhookSignatureService,
    WebhookReplayGuardService,
    WebhookEventService,
    WebhookEventProcessor,
    PaytotaWebhookAdapter,
    FlutterwaveWebhookAdapter,
    WebhookRetryWorker,
  ],
  exports: [WebhookSignatureService, WebhookReplayGuardService, WebhookEventService],
})
export class WebhooksModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(WebhookRawBodyMiddleware).forRoutes(WebhooksController);
  }
}
