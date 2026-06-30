import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlutterwavePaymentProvider } from './flutterwave-payment.provider';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaytotaPaymentProvider } from './paytota-payment.provider';
import { PaymentProviderAdapter } from './payment-provider';

@Injectable()
export class PaymentProviderFactory {
  private readonly providers: Map<string, PaymentProviderAdapter>;

  constructor(
    private readonly config: ConfigService,
    mock: MockPaymentProvider,
    flutterwave: FlutterwavePaymentProvider,
    paytota: PaytotaPaymentProvider,
  ) {
    this.providers = new Map(
      [mock, flutterwave, paytota].map((provider) => [provider.name.toUpperCase(), provider]),
    );
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
    const defaultProvider = this.defaultProviderName();
    const providers = [...this.providers.values()].map((provider) => provider.status());
    const selected = providers.find((provider) => provider.provider === defaultProvider);
    return {
      defaultProvider,
      configured: Boolean(selected?.configured),
      connected: Boolean(selected?.connected),
      fallback: selected?.fallback ?? null,
      productionReady: selected?.productionReady !== false,
      providers,
    };
  }
}
