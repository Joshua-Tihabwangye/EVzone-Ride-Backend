import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { AccountingService } from '../accounting/accounting.service';
import { LedgerAccountType, ServiceType, TransactionDirection, WalletTransactionType } from '../common/enums';
import { CommissionRule } from './commission-rule.entity';
import { WalletsService } from '../wallets/wallets.service';

export interface CommissionContext {
  serviceType: ServiceType;
  amount: number;
  currency?: string;
  marketId?: string;
  organizationId?: string;
  fleetId?: string;
  vehicleType?: string;
  tipAmount?: number;
  effectiveDate?: Date;
}

export interface CommissionBreakdown {
  ruleId?: string;
  driverShare: number;
  platformFee: number;
  tax: number;
  tipPayout: number;
  totalPlatformFee: number;
}

export interface PaymentCommissionInput {
  reference: string;
  serviceType: ServiceType;
  serviceId: string;
  amount: number;
  currency: string;
  providerUserId?: string;
  payerUserId: string;
  marketId?: string;
  organizationId?: string;
  fleetId?: string;
  vehicleType?: string;
  tipAmount?: number;
}

@Injectable()
export class CommissioningService {
  constructor(
    @InjectRepository(CommissionRule) private readonly rules: Repository<CommissionRule>,
    private readonly wallets: WalletsService,
    private readonly accounting: AccountingService,
  ) {}

  async createRule(dto: Partial<CommissionRule>): Promise<CommissionRule> {
    const rule = this.rules.create(this.sanitizeRule(dto));
    return this.rules.save(rule);
  }

  async listRules(serviceType?: ServiceType, active?: boolean) {
    const where: Record<string, unknown> = {};
    if (serviceType) where.serviceType = serviceType;
    if (active !== undefined) where.active = active;
    return this.rules.find({ where, order: { priority: 'DESC', createdAt: 'DESC' } });
  }

  async getRule(id: string) {
    const rule = await this.rules.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Commission rule not found');
    return rule;
  }

  async updateRule(id: string, dto: Partial<CommissionRule>) {
    const rule = await this.getRule(id);
    Object.assign(rule, this.sanitizeRule(dto));
    return this.rules.save(rule);
  }

  async setActive(id: string, active: boolean) {
    const rule = await this.getRule(id);
    rule.active = active;
    return this.rules.save(rule);
  }

  async computeCommission(context: CommissionContext): Promise<CommissionBreakdown> {
    const rule = await this.resolveRule(context);
    const amount = Number(context.amount);
    const tipAmount = context.tipAmount ?? 0;

    const platformFeePercent = Number(rule.platformFeePercent ?? 0);
    const fixedPlatformFee = Number(rule.fixedPlatformFee ?? 0);
    const driverSharePercent = Number(rule.driverSharePercent ?? 0);
    const taxPercent = Number(rule.taxPercent ?? 0);
    const tipPayoutPercent = Number(rule.tipPayoutPercent ?? 100);

    const variablePlatformFee = Math.round((amount * platformFeePercent * 100) / 100) / 100;
    const platformFee = Math.round((variablePlatformFee + fixedPlatformFee) * 100) / 100;
    const driverShare = Math.max(0, Math.round((amount * driverSharePercent * 100) / 100) / 100);
    const tax = Math.round((amount * taxPercent * 100) / 100) / 100;
    const tipPayout = tipAmount > 0 ? Math.round((tipAmount * tipPayoutPercent * 100) / 100) / 100 : 0;

    return {
      ruleId: rule.id,
      driverShare,
      platformFee,
      tax,
      tipPayout,
      totalPlatformFee: platformFee,
    };
  }

  async applyPaymentCommission(input: PaymentCommissionInput): Promise<CommissionBreakdown> {
    const commission = await this.computeCommission({
      serviceType: input.serviceType,
      amount: input.amount,
      currency: input.currency,
      marketId: input.marketId,
      organizationId: input.organizationId,
      fleetId: input.fleetId,
      vehicleType: input.vehicleType,
      tipAmount: input.tipAmount,
      effectiveDate: new Date(),
    });

    if (commission.driverShare > 0 && input.providerUserId && input.providerUserId !== input.payerUserId) {
      await this.wallets.credit(
        input.providerUserId,
        commission.driverShare,
        WalletTransactionType.EARNING,
        `EARN-${input.reference}`,
        `${input.serviceType} earnings`,
        {
          serviceId: input.serviceId,
          serviceType: input.serviceType,
          platformFee: commission.platformFee,
          ruleId: commission.ruleId,
        },
      );
    }

    if (commission.platformFee > 0) {
      await this.accounting.postJournal({
        reference: `PLATFORM-FEE-${input.reference}`,
        transactionType: 'PLATFORM_FEE_RECOGNITION',
        description: 'Recognise platform fee revenue',
        serviceType: input.serviceType,
        serviceId: input.serviceId,
        currency: input.currency,
        lines: [
          {
            accountCode: `CLEARING:${input.currency}`,
            accountName: `${input.currency} settlement clearing`,
            accountType: LedgerAccountType.ASSET,
            accountCategory: 'ASSET',
            ownerType: 'SYSTEM',
            direction: TransactionDirection.DEBIT,
            amount: commission.platformFee,
            memo: 'Clearing reduced by platform fee',
          },
          {
            accountCode: `REVENUE:PLATFORM_FEE:${input.currency}`,
            accountName: `${input.currency} platform fee revenue`,
            accountType: LedgerAccountType.REVENUE,
            accountCategory: 'REVENUE',
            ownerType: 'SYSTEM',
            direction: TransactionDirection.CREDIT,
            amount: commission.platformFee,
            memo: 'Platform fee revenue',
          },
        ],
      });
    }

    return commission;
  }

  private async resolveRule(context: CommissionContext): Promise<CommissionRule> {
    const currency = context.currency ?? 'UGX';
    const effectiveDate = context.effectiveDate ?? new Date();

    const candidates = await this.rules.find({
      where: {
        serviceType: context.serviceType,
        currency,
        active: true,
        effectiveFrom: LessThanOrEqual(effectiveDate),
      },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });

    const matching = candidates.filter((rule) => {
      if (rule.effectiveUntil && rule.effectiveUntil < effectiveDate) return false;
      if (rule.marketId && rule.marketId !== context.marketId) return false;
      if (rule.organizationId && rule.organizationId !== context.organizationId) return false;
      if (rule.fleetId && rule.fleetId !== context.fleetId) return false;
      if (rule.vehicleType && rule.vehicleType !== context.vehicleType) return false;
      return true;
    });

    if (matching.length === 0) {
      return this.defaultRule(context.serviceType, currency);
    }
    return matching[0];
  }

  private defaultRule(serviceType: ServiceType, currency: string): CommissionRule {
    return this.rules.create({
      name: 'Default provider share',
      serviceType,
      currency,
      driverSharePercent: 85,
      platformFeePercent: 15,
      fixedPlatformFee: 0,
      taxPercent: 0,
      tipPayoutPercent: 100,
      priority: 0,
      active: true,
      effectiveFrom: new Date('2000-01-01'),
    });
  }

  private sanitizeRule(dto: Partial<CommissionRule>): Partial<CommissionRule> {
    if (dto.driverSharePercent !== undefined && dto.platformFeePercent !== undefined) {
      const sum = Number(dto.driverSharePercent) + Number(dto.platformFeePercent);
      if (sum > 100)
        throw new BadRequestException('Driver share and platform fee percentages cannot exceed 100%');
    }
    return dto;
  }
}
