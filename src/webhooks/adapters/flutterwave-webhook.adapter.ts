import { Injectable } from '@nestjs/common';
import { WebhookEventService } from '../webhook-event.service';
import { FlutterwaveWebhookDto } from '../dto/flutterwave-webhook.dto';

@Injectable()
export class FlutterwaveWebhookAdapter {
  constructor(private readonly events: WebhookEventService) {}

  handle(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    dto: FlutterwaveWebhookDto,
  ) {
    return this.events.ingest('FLUTTERWAVE', rawBody, headers, dto as unknown as Record<string, unknown>);
  }
}
