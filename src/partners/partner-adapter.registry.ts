import { Injectable, NotFoundException } from '@nestjs/common';
import { PartnerAdapter } from './partner-adapter.interface';

@Injectable()
export class PartnerAdapterRegistry {
  private readonly adapters = new Map<string, PartnerAdapter>();

  register(...adapters: PartnerAdapter[]): void {
    for (const adapter of adapters) {
      this.adapters.set(adapter.partnerType.toUpperCase(), adapter);
    }
  }

  get(type: string): PartnerAdapter {
    const adapter = this.adapters.get(type.toUpperCase());
    if (!adapter) throw new NotFoundException(`No adapter registered for partner type '${type}'`);
    return adapter;
  }

  has(type: string): boolean {
    return this.adapters.has(type.toUpperCase());
  }

  list(): string[] {
    return [...this.adapters.keys()];
  }
}
