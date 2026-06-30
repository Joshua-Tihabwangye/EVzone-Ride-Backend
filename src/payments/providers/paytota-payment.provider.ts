import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentProviderAdapter,
  PaymentVerificationInput,
  PaymentVerificationResult,
} from './payment-provider';

interface PaytotaPurchaseResponse {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PaytotaPaymentProvider implements PaymentProviderAdapter {
  readonly name = 'PAYTOTA';
  private readonly logger = new Logger(PaytotaPaymentProvider.name);

  constructor(private readonly config: ConfigService) {}

  async verify(input: PaymentVerificationInput): Promise<PaymentVerificationResult> {
    const token = input.providerToken?.trim();
    if (!token) {
      return { approved: false, status: 'failed', reason: 'Paytota purchase token is required' };
    }

    const secret = this.config.get<string>('PAYTOTA_SECRET_KEY')?.trim();
    if (!secret) {
      return {
        approved: false,
        status: 'unavailable',
        reason: 'Paytota credentials are not configured',
      };
    }

    const baseUrl = (this.config.get<string>('PAYTOTA_BASE_URL') ?? 'https://api.paytota.com').replace(
      /\/$/,
      '',
    );
    const verifyPath = (this.config.get<string>('PAYTOTA_VERIFY_PATH') ?? '/v1/purchases/{token}').replace(
      '{token}',
      encodeURIComponent(token),
    );

    try {
      const response = await fetch(`${baseUrl}${verifyPath}`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${secret}`,
          'x-trace-id': input.expectedReference,
        },
        signal: AbortSignal.timeout(Number(this.config.get<string>('PAYTOTA_REQUEST_TIMEOUT_MS') ?? 10_000)),
      });

      const body = (await response.json().catch(() => ({}))) as PaytotaPurchaseResponse;
      if (!response.ok) {
        return {
          approved: false,
          status: 'failed',
          reason: `Paytota verification returned HTTP ${response.status}`,
          response: body as Record<string, unknown>,
        };
      }

      const state = String(body.status ?? '').toLowerCase();
      const amount = Number(body.amount ?? 0);
      const currency = String(body.currency ?? '').toUpperCase();
      const reference = body.reference;
      const approved =
        ['succeeded', 'successful', 'success', 'paid'].includes(state) &&
        Math.abs(amount - input.expectedAmount) < 0.01 &&
        currency === input.expectedCurrency.toUpperCase() &&
        (!reference || reference === input.expectedReference);

      return {
        approved,
        providerReference: body.id ?? token,
        status: state || (approved ? 'succeeded' : 'failed'),
        reason: approved
          ? undefined
          : 'Provider status, amount, currency, or reference did not match the payment intent',
        response: body as Record<string, unknown>,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Paytota verification failed: ${message}`);
      return { approved: false, status: 'unavailable', reason: message };
    }
  }

  status(): Record<string, unknown> {
    const configured = Boolean(this.config.get<string>('PAYTOTA_SECRET_KEY')?.trim());
    return {
      provider: this.name,
      configured,
      connected: configured,
      fallback: configured ? null : 'UNAVAILABLE',
      productionReady: this.config.get<string>('NODE_ENV') !== 'production' || configured,
      baseUrl: this.config.get<string>('PAYTOTA_BASE_URL') ?? 'https://api.paytota.com',
    };
  }
}
