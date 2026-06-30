import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentProviderAdapter,
  PaymentVerificationInput,
  PaymentVerificationResult,
} from './payment-provider';

interface FlutterwaveChargeResponse {
  status?: string;
  message?: string;
  data?: {
    id?: string;
    status?: string;
    amount?: number | { value?: number };
    currency?: string;
    reference?: string;
    tx_ref?: string;
  };
}

@Injectable()
export class FlutterwavePaymentProvider implements PaymentProviderAdapter {
  readonly name = 'FLUTTERWAVE';
  private readonly logger = new Logger(FlutterwavePaymentProvider.name);

  constructor(private readonly config: ConfigService) {}

  async verify(input: PaymentVerificationInput): Promise<PaymentVerificationResult> {
    const token = input.providerToken?.trim();
    if (!token)
      return { approved: false, status: 'failed', reason: 'Flutterwave transaction ID is required' };
    const secret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY')?.trim();
    if (!secret) {
      return {
        approved: false,
        status: 'unavailable',
        reason: 'Flutterwave credentials are not configured',
      };
    }
    const baseUrl = (
      this.config.get<string>('FLUTTERWAVE_BASE_URL') ?? 'https://developersandbox-api.flutterwave.com'
    ).replace(/\/$/, '');
    try {
      const response = await fetch(`${baseUrl}/charges/${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${secret}`,
          'x-trace-id': input.expectedReference,
        },
        signal: AbortSignal.timeout(
          Number(this.config.get<string>('FLUTTERWAVE_REQUEST_TIMEOUT_MS') ?? 10_000),
        ),
      });
      const body = (await response.json().catch(() => ({}))) as FlutterwaveChargeResponse;
      if (!response.ok) {
        return {
          approved: false,
          status: 'failed',
          reason: `Flutterwave verification returned HTTP ${response.status}`,
          response: this.safeResponse(body),
        };
      }
      const data = body.data ?? {};
      const amount = typeof data.amount === 'number' ? data.amount : Number(data.amount?.value ?? 0);
      const currency = String(data.currency ?? '').toUpperCase();
      const reference = data.reference ?? data.tx_ref;
      const state = String(data.status ?? body.status ?? '').toLowerCase();
      const approved =
        ['succeeded', 'successful', 'success'].includes(state) &&
        Math.abs(amount - input.expectedAmount) < 0.01 &&
        currency === input.expectedCurrency.toUpperCase() &&
        (!reference || reference === input.expectedReference);
      return {
        approved,
        providerReference: data.id ?? token,
        status: state || (approved ? 'succeeded' : 'failed'),
        reason: approved
          ? undefined
          : 'Provider status, amount, currency, or transaction reference did not match the payment intent',
        response: this.safeResponse(body),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Flutterwave verification failed: ${message}`);
      return { approved: false, status: 'unavailable', reason: message };
    }
  }

  status() {
    const configured = Boolean(this.config.get<string>('FLUTTERWAVE_SECRET_KEY')?.trim());
    return {
      provider: this.name,
      configured,
      connected: configured,
      fallback: configured ? null : 'UNAVAILABLE',
      productionReady: this.config.get<string>('NODE_ENV') !== 'production' || configured,
      baseUrl:
        this.config.get<string>('FLUTTERWAVE_BASE_URL') ?? 'https://developersandbox-api.flutterwave.com',
    };
  }

  private safeResponse(value: FlutterwaveChargeResponse): Record<string, unknown> {
    return {
      status: value.status,
      message: value.message,
      data: value.data
        ? {
            id: value.data.id,
            status: value.data.status,
            amount: value.data.amount,
            currency: value.data.currency,
            reference: value.data.reference ?? value.data.tx_ref,
          }
        : undefined,
    };
  }
}
