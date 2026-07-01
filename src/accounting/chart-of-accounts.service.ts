import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerAccount } from '../database/entities';
import {
  allSystemAccountCodes,
  isWalletAccountCode,
  parseWalletAccountCode,
  SystemAccountDefinition,
  systemAccountDefinitions,
} from './chart-of-accounts';

@Injectable()
export class ChartOfAccountsService implements OnModuleInit {
  private readonly supportedCurrencies: string[];

  constructor(
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
  ) {
    const configured = process.env.SUPPORTED_CURRENCIES ?? 'UGX';
    this.supportedCurrencies = configured.split(',').map((c) => c.trim().toUpperCase());
  }

  async onModuleInit(): Promise<void> {
    await this.seedSystemAccounts();
  }

  async seedSystemAccounts(): Promise<void> {
    for (const currency of this.supportedCurrencies) {
      for (const definition of systemAccountDefinitions(currency)) {
        await this.ensureAccount(definition);
      }
    }
  }

  private async ensureAccount(definition: SystemAccountDefinition): Promise<void> {
    const existing = await this.accounts.findOne({ where: { code: definition.code } });
    if (existing) return;
    await this.accounts.save(
      this.accounts.create({
        code: definition.code,
        name: definition.name,
        accountType: definition.accountType,
        accountCategory: definition.accountCategory,
        ownerType: definition.ownerType,
        ownerId: definition.ownerId,
        currency: definition.currency,
        active: true,
      }),
    );
  }

  isKnownAccountCode(code: string): boolean {
    if (isWalletAccountCode(code)) {
      const parsed = parseWalletAccountCode(code);
      return parsed ? this.supportedCurrencies.includes(parsed.currency) : false;
    }
    return allSystemAccountCodes(this.supportedCurrencies).includes(code);
  }

  supportedCurrencyCodes(): string[] {
    return [...this.supportedCurrencies];
  }
}
