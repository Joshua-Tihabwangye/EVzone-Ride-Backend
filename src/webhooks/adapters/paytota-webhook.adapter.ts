import { Injectable } from '@nestjs/common';
import { WebhookEventService } from '../webhook-event.service';
import { PaytotaWebhookDto } from '../dto/paytota-webhook.dto';

@Injectable()
export class PaytotaWebhookAdapter {
  constructor(private readonly events: WebhookEventService) {}

  handle(rawBody: string, headers: Record<string, string | string[] | undefined>, dto: PaytotaWebhookDto) {
    return this.events.ingest('PAYTOTA', rawBody, headers, dto as unknown as Record<string, unknown>);
  }
}
