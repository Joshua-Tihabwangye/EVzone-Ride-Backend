import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  PayoutDestination,
  PayoutInitiationResult,
  PayoutProviderAdapter,
  PayoutRequest,
  PayoutVerificationResult,
} from './payout-provider.interface';

@Injectable()
export class MockPayoutProvider implements PayoutProviderAdapter {
  readonly name = 'MOCK_PAYOUT';
  private readonly logger = new Logger(MockPayoutProvider.name);

  constructor(private readonly config: ConfigService) {}

  async initiate(request: PayoutRequest): Promise<PayoutInitiationResult> {
    this.logger.debug(`Mock initiate: ${request.reference}`);
    const providerReference = `MOCK-${randomUUID()}`;
    if (this.shouldFail(request.reference)) {
      return {
        status: 'failed',
        providerReference,
        providerError: { reason: 'Mock configured to fail this reference' },
      };
    }
    return {
      status: this.autoComplete() ? 'completed' : 'pending',
      providerReference,
      fee: 0,
      providerPayload: {
        reference: request.reference,
        amount: request.amount,
        currency: request.currency,
        destination: request.destination,
      },
    };
  }

  async verify(reference: string): Promise<PayoutVerificationResult> {
    await this.delay();
    if (this.shouldFail(reference)) {
      return {
        status: 'failed',
        failureReason: 'Mock verification determined failure for reference',
      };
    }
    return {
      status: 'completed',
      providerReference: `MOCK-${reference}`,
      settledAt: new Date(),
    };
  }

  async cancel(): Promise<boolean> {
    return true;
  }

  status() {
    return {
      provider: this.name,
      configured: true,
      autoComplete: this.autoComplete(),
      failReferences: this.failReferencePattern(),
    };
  }

  private autoComplete(): boolean {
    return (
      process.env.NODE_ENV !== 'production' &&
      (this.config.get<string>('MOCK_PAYOUT_AUTO_COMPLETE') ?? 'false').toLowerCase() === 'true'
    );
  }

  private failReferencePattern(): string {
    return this.config.get<string>('MOCK_PAYOUT_FAIL_PATTERN') ?? 'mock-fail';
  }

  private shouldFail(reference: string): boolean {
    const pattern = this.failReferencePattern();
    return pattern.length > 0 && reference.toLowerCase().includes(pattern.toLowerCase());
  }

  private delay(): Promise<void> {
    const ms = Number(this.config.get<string>('MOCK_PAYOUT_DELAY_MS') ?? 0);
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }

  validateDestination(destination: PayoutDestination): { valid: boolean; reason?: string } {
    const target = destination.phone ?? destination.accountNumber;
    if (!target || String(target).trim().length < 3) {
      return { valid: false, reason: 'Destination requires a phone or accountNumber' };
    }
    return { valid: true };
  }
}
