import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlutterwavePaymentProvider } from './flutterwave-payment.provider';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentProviderAdapter } from './payment-provider';

@Injectable()
export class PaymentProviderFactory {
  private readonly providers: Map<string, PaymentProviderAdapter>;

  constructor(
    private readonly config: ConfigService,
    mock: MockPaymentProvider,
    flutterwave: FlutterwavePaymentProvider,
  ) {
    this.providers = new Map([mock, flutterwave].map((provider) => [provider.name.toUpperCase(), provider]));
  }

  get(name?: string): PaymentProviderAdapter {
    const normalized = (name ?? this.defaultProviderName()).trim().toUpperCase();
    const provider = this.providers.get(normalized);
    if (!provider) throw new BadRequestException(`Unsupported payment provider: ${normalized}`);
    return provider;
  }

  defaultProviderName(): string {
    return (this.config.get<string>('PAYMENT_PROVIDER') ?? 'MOCK').trim().toUpperCase();
  }

  status() {
    return {
      defaultProvider: this.defaultProviderName(),
      providers: [...this.providers.values()].map((provider) => provider.status()),
    };
  }
}
