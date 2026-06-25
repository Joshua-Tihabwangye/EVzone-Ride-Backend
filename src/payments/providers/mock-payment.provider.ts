import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PaymentProviderAdapter,
  PaymentVerificationInput,
  PaymentVerificationResult,
} from './payment-provider';

@Injectable()
export class MockPaymentProvider implements PaymentProviderAdapter {
  readonly name = 'MOCK';

  async verify(input: PaymentVerificationInput): Promise<PaymentVerificationResult> {
    const amountCode = String(Math.abs(Math.floor(input.expectedAmount)) % 10_000).padStart(4, '0');
    const acceptedTokens = new Set(['0000', amountCode, 'EVZONE-DEMO-SUCCESS']);
    const developmentAutoApprove =
      process.env.NODE_ENV !== 'production' &&
      (process.env.MOCK_PAYMENT_AUTO_APPROVE ?? 'true').toLowerCase() === 'true';
    const approved =
      developmentAutoApprove || Boolean(input.providerToken && acceptedTokens.has(input.providerToken));
    return {
      approved,
      providerReference: approved ? `MOCK-${randomUUID()}` : undefined,
      status: approved ? 'succeeded' : 'failed',
      reason: approved
        ? undefined
        : 'Mock verification failed. Use 0000, EVZONE-DEMO-SUCCESS, or the amount-derived four-digit code.',
      response: {
        expectedReference: input.expectedReference,
        expectedAmount: input.expectedAmount,
        expectedCurrency: input.expectedCurrency,
        acceptedAmountCode: process.env.NODE_ENV === 'production' ? undefined : amountCode,
      },
    };
  }

  status() {
    return {
      provider: this.name,
      configured: true,
      autoApprove:
        process.env.NODE_ENV !== 'production' &&
        (process.env.MOCK_PAYMENT_AUTO_APPROVE ?? 'true').toLowerCase() === 'true',
    };
  }
}
