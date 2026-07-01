import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PayoutDestination,
  PayoutInitiationResult,
  PayoutProviderAdapter,
  PayoutRequest,
  PayoutVerificationResult,
  PayoutWebhookVerification,
} from './payout-provider.interface';

interface FlutterwaveTransferResponse {
  status?: string;
  message?: string;
  data?: {
    id?: number;
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    fee?: number;
    bank_code?: string;
    account_number?: string;
    full_name?: string;
    complete_message?: string;
    meta?: Record<string, unknown>;
  };
}

@Injectable()
export class FlutterwavePayoutProvider implements PayoutProviderAdapter {
  readonly name = 'FLUTTERWAVE_PAYOUT';
  private readonly logger = new Logger(FlutterwavePayoutProvider.name);

  constructor(private readonly config: ConfigService) {}

  async initiate(request: PayoutRequest): Promise<PayoutInitiationResult> {
    const destinationValidation = this.validateDestination(request.destination);
    if (!destinationValidation.valid) {
      return {
        status: 'failed',
        providerError: { reason: destinationValidation.reason },
      };
    }

    const secret = this.secretKey();
    if (!secret) {
      return {
        status: 'failed',
        providerError: { reason: 'Flutterwave secret key is not configured' },
      };
    }

    try {
      const response = await fetch(`${this.baseUrl()}/v3/transfers`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          account_bank: request.destination.bankCode ?? 'MPS',
          account_number: request.destination.accountNumber ?? request.destination.phone,
          amount: request.amount,
          currency: request.currency,
          reference: request.reference,
          narration: request.narration ?? 'EVzone payout',
          callback_url: this.callbackUrl(),
        }),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });

      const body = (await response.json().catch(() => ({}))) as FlutterwaveTransferResponse;
      if (!response.ok) {
        return {
          status: 'failed',
          providerError: { httpStatus: response.status, ...this.safeResponse(body) },
        };
      }

      const data = body.data ?? {};
      const status = this.normalizeStatus(data.status ?? body.status);
      return {
        status,
        providerReference: data.id ? String(data.id) : undefined,
        providerBatchId: typeof data.meta?.batch_id === 'string' ? data.meta.batch_id : undefined,
        fee: typeof data.fee === 'number' ? data.fee : undefined,
        providerPayload: this.safeResponse(body),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Flutterwave initiate failed: ${message}`);
      return { status: 'failed', providerError: { reason: message } };
    }
  }

  async verify(reference: string): Promise<PayoutVerificationResult> {
    const secret = this.secretKey();
    if (!secret) {
      return { status: 'failed', failureReason: 'Flutterwave secret key is not configured' };
    }

    try {
      const response = await fetch(
        `${this.baseUrl()}/v3/transfers?reference=${encodeURIComponent(reference)}`,
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${secret}`,
          },
          signal: AbortSignal.timeout(this.timeoutMs()),
        },
      );
      const body = (await response.json().catch(() => ({}))) as FlutterwaveTransferResponse;
      const data = body.data ?? {};
      const status = this.normalizeStatus(data.status ?? body.status);
      return {
        status,
        providerReference: data.id ? String(data.id) : undefined,
        amount: typeof data.amount === 'number' ? data.amount : undefined,
        currency: data.currency,
        settledAt: status === 'completed' ? new Date() : undefined,
        failureReason: data.complete_message,
        providerPayload: this.safeResponse(body),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Flutterwave verify failed: ${message}`);
      return { status: 'failed', failureReason: message };
    }
  }

  async cancel(reference: string): Promise<boolean> {
    const secret = this.secretKey();
    if (!secret) return false;
    try {
      const verifyResult = await this.verify(reference);
      if (verifyResult.status !== 'pending' && verifyResult.status !== 'processing') return false;
      const response = await fetch(`${this.baseUrl()}/v3/transfers/${reference}`, {
        method: 'PUT',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ action: 'cancel' }),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
      return response.ok;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Flutterwave cancel failed: ${message}`);
      return false;
    }
  }

  verifyWebhook(payload: unknown, signature: string): PayoutWebhookVerification {
    const secret = this.webhookSecret();
    if (!secret) {
      return { valid: false, reason: 'Webhook secret not configured' };
    }
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    try {
      if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
        return { valid: false, reason: 'Invalid webhook signature' };
      }
    } catch {
      return { valid: false, reason: 'Signature length mismatch' };
    }

    const event = (payload as Record<string, unknown>) ?? {};
    const data = (event.data as Record<string, unknown>) ?? {};
    const reference =
      typeof data.reference === 'string'
        ? data.reference
        : typeof event.reference === 'string'
          ? event.reference
          : undefined;
    return {
      valid: true,
      reference,
      status: this.normalizeStatus(String(data.status ?? event.status)),
      payload: event,
    };
  }

  status() {
    return {
      provider: this.name,
      configured: Boolean(this.secretKey()),
      baseUrl: this.baseUrl(),
      callbackUrl: this.callbackUrl(),
    };
  }

  validateDestination(destination: PayoutDestination): { valid: boolean; reason?: string } {
    const target = destination.accountNumber ?? destination.phone;
    if (!target || String(target).trim().length < 3) {
      return { valid: false, reason: 'Destination requires an accountNumber or phone' };
    }
    if (!destination.bankCode && !destination.phone) {
      return { valid: false, reason: 'Destination requires a bankCode or phone' };
    }
    return { valid: true };
  }

  private secretKey(): string | undefined {
    return this.config.get<string>('FLUTTERWAVE_SECRET_KEY')?.trim();
  }

  private webhookSecret(): string | undefined {
    return this.config.get<string>('FLUTTERWAVE_PAYOUT_WEBHOOK_SECRET')?.trim();
  }

  private baseUrl(): string {
    return (this.config.get<string>('FLUTTERWAVE_BASE_URL') ?? 'https://api.flutterwave.com').replace(
      /\/$/,
      '',
    );
  }

  private callbackUrl(): string | undefined {
    return this.config.get<string>('FLUTTERWAVE_PAYOUT_CALLBACK_URL')?.trim();
  }

  private timeoutMs(): number {
    return Number(this.config.get<string>('FLUTTERWAVE_REQUEST_TIMEOUT_MS') ?? 10_000);
  }

  private normalizeStatus(value?: string): PayoutInitiationResult['status'] {
    const state = String(value ?? '').toLowerCase();
    if (['succeeded', 'successful', 'success', 'completed'].includes(state)) return 'completed';
    if (['pending', 'new', 'queued'].includes(state)) return 'pending';
    if (['processing', 'in progress', 'in_progress'].includes(state)) return 'processing';
    if (['failed', 'failure', 'error'].includes(state)) return 'failed';
    if (['cancelled', 'canceled', 'reversed'].includes(state)) return 'cancelled';
    return 'unknown';
  }

  private safeResponse(value: FlutterwaveTransferResponse): Record<string, unknown> {
    return {
      status: value.status,
      message: value.message,
      data: value.data
        ? {
            id: value.data.id,
            reference: value.data.reference,
            status: value.data.status,
            amount: value.data.amount,
            currency: value.data.currency,
            fee: value.data.fee,
          }
        : undefined,
    };
  }
}
