import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { FlutterwaveWebhookAdapter } from './adapters/flutterwave-webhook.adapter';
import { PaytotaWebhookAdapter } from './adapters/paytota-webhook.adapter';
import { FlutterwaveWebhookDto } from './dto/flutterwave-webhook.dto';
import { PaytotaWebhookDto } from './dto/paytota-webhook.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly paytota: PaytotaWebhookAdapter,
    private readonly flutterwave: FlutterwaveWebhookAdapter,
  ) {}

  @Public()
  @Post('paytota')
  @HttpCode(200)
  paytotaWebhook(
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() dto: PaytotaWebhookDto,
  ) {
    return this.paytota.handle(req.rawBody ?? JSON.stringify(dto), headers, dto);
  }

  @Public()
  @Post('flutterwave')
  @HttpCode(200)
  flutterwaveWebhook(
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() dto: FlutterwaveWebhookDto,
  ) {
    return this.flutterwave.handle(req.rawBody ?? JSON.stringify(dto), headers, dto);
  }
}
