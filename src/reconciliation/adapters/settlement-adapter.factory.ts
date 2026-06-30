import { BadRequestException, Injectable } from '@nestjs/common';
import { SettlementAdapter } from './settlement-adapter.interface';
import { FlutterwaveSettlementAdapter } from './flutterwave-settlement.adapter';

@Injectable()
export class SettlementAdapterFactory {
  private readonly adapters: Map<string, SettlementAdapter>;

  constructor(flutterwave: FlutterwaveSettlementAdapter) {
    this.adapters = new Map([flutterwave].map((adapter) => [adapter.provider.toUpperCase(), adapter]));
  }

  get(provider: string): SettlementAdapter {
    const normalized = provider.trim().toUpperCase();
    const adapter = this.adapters.get(normalized);
    if (!adapter) throw new BadRequestException(`Unsupported settlement provider: ${provider}`);
    return adapter;
  }

  providers(): string[] {
    return [...this.adapters.keys()];
  }
}
