import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlutterwavePayoutProvider } from './flutterwave-payout.provider';
import { MockPayoutProvider } from './mock-payout.provider';
import { PayoutProviderAdapter } from './payout-provider.interface';

@Injectable()
export class PayoutProviderFactory {
  private readonly providers: Map<string, PayoutProviderAdapter>;

  constructor(
    private readonly config: ConfigService,
    mock: MockPayoutProvider,
    flutterwave: FlutterwavePayoutProvider,
  ) {
    this.providers = new Map([mock, flutterwave].map((provider) => [provider.name.toUpperCase(), provider]));
  }

  get(name?: string): PayoutProviderAdapter {
    const normalized = (name ?? this.defaultProviderName()).trim().toUpperCase();
    const provider = this.providers.get(normalized);
    if (!provider) throw new BadRequestException(`Unsupported payout provider: ${normalized}`);
    return provider;
  }

  defaultProviderName(): string {
    return (this.config.get<string>('PAYOUT_PROVIDER') ?? 'MOCK_PAYOUT').trim().toUpperCase();
  }

  status() {
    return {
      defaultProvider: this.defaultProviderName(),
      providers: [...this.providers.values()].map((provider) => provider.status()),
    };
  }
}
