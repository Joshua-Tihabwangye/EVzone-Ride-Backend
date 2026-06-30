import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEventRecord } from '../database/entities';
import { WebhookReplayGuardService } from './webhook-replay-guard.service';
import { WebhookSignatureService } from './webhook-signature.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEventRecord])],
  providers: [WebhookSignatureService, WebhookReplayGuardService],
  exports: [WebhookSignatureService, WebhookReplayGuardService],
})
export class WebhooksModule {}
