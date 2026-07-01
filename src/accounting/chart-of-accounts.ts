import { LedgerAccountType } from '../common/enums';

export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface SystemAccountDefinition {
  code: string;
  name: string;
  accountType: LedgerAccountType;
  accountCategory: AccountCategory;
  ownerType: string;
  ownerId?: string;
  currency: string;
  description?: string;
}

export function clearingAccountCode(currency: string): string {
  return `CLEARING:${currency}`;
}

export function platformFeeRevenueAccountCode(currency: string): string {
  return `REVENUE:PLATFORM_FEE:${currency}`;
}

export function driverPayoutExpenseAccountCode(currency: string): string {
  return `EXPENSE:DRIVER_PAYOUT:${currency}`;
}

export function paymentProviderReceivableAccountCode(currency: string): string {
  return `RECEIVABLE:PAYMENT_PROVIDER:${currency}`;
}

export function payoutProviderPayableAccountCode(currency: string): string {
  return `PAYABLE:PAYOUT_PROVIDER:${currency}`;
}

export function walletLiabilityAccountCode(currency: string, userId: string): string {
  return `WALLET:${currency}:${userId}`;
}

export function isWalletAccountCode(code: string): boolean {
  return code.startsWith('WALLET:');
}

export function parseWalletAccountCode(code: string): { currency: string; userId: string } | null {
  const parts = code.split(':');
  if (parts.length !== 3 || parts[0] !== 'WALLET') return null;
  return { currency: parts[1], userId: parts[2] };
}

export function systemAccountDefinitions(currency: string): SystemAccountDefinition[] {
  return [
    {
      code: clearingAccountCode(currency),
      name: `${currency} settlement clearing`,
      accountType: LedgerAccountType.ASSET,
      accountCategory: 'ASSET',
      ownerType: 'SYSTEM',
      currency,
      description: 'Temporary asset account holding funds in transit between wallets and providers.',
    },
    {
      code: platformFeeRevenueAccountCode(currency),
      name: `${currency} platform fee revenue`,
      accountType: LedgerAccountType.REVENUE,
      accountCategory: 'REVENUE',
      ownerType: 'SYSTEM',
      currency,
      description: 'Revenue from platform fees charged on service payments.',
    },
    {
      code: driverPayoutExpenseAccountCode(currency),
      name: `${currency} driver payout expense`,
      accountType: LedgerAccountType.EXPENSE,
      accountCategory: 'EXPENSE',
      ownerType: 'SYSTEM',
      currency,
      description: 'Expense incurred when paying out driver earnings.',
    },
    {
      code: paymentProviderReceivableAccountCode(currency),
      name: `${currency} payment provider receivable`,
      accountType: LedgerAccountType.ASSET,
      accountCategory: 'ASSET',
      ownerType: 'SYSTEM',
      currency,
      description: 'Funds owed to EVzone by payment providers before settlement.',
    },
    {
      code: payoutProviderPayableAccountCode(currency),
      name: `${currency} payout provider payable`,
      accountType: LedgerAccountType.LIABILITY,
      accountCategory: 'LIABILITY',
      ownerType: 'SYSTEM',
      currency,
      description: 'Funds owed by EVzone to payout providers for driver cashouts.',
    },
  ];
}

export function allSystemAccountCodes(currencies: string[]): string[] {
  return currencies.flatMap((currency) => systemAccountDefinitions(currency).map((def) => def.code));
}
