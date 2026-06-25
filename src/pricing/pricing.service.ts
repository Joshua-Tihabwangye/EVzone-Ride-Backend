import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { ServiceType, VehicleType } from '../common/enums';
import { PricingRule, PromoCode, PromoRedemption, SurgeZone } from '../database/entities';
import { roundMoney } from '../common/utils/money';
import { CreatePricingRuleDto, CreatePromoCodeDto, CreateSurgeZoneDto, QuoteDto } from './pricing.dto';

export interface FareQuote {
  serviceType: ServiceType;
  currency: string;
  distanceKm: number;
  durationMinutes: number;
  multiplier: number;
  subtotal: number;
  bookingFee: number;
  extrasAmount: number;
  discountAmount: number;
  total: number;
  pricingRuleId: string;
  promoCode?: string;
  breakdown: Record<string, number>;
}

export function calculateFare(input: {
  baseFare: number;
  perKm: number;
  perMinute: number;
  distanceKm: number;
  durationMinutes: number;
  minimumFare: number;
  bookingFee: number;
  multiplier: number;
  extrasAmount?: number;
  discountAmount?: number;
}): { subtotal: number; total: number } {
  const metered = input.baseFare + input.perKm * input.distanceKm + input.perMinute * input.durationMinutes;
  const subtotal = Math.max(input.minimumFare, metered) * input.multiplier;
  const total = Math.max(
    0,
    subtotal + input.bookingFee + (input.extrasAmount ?? 0) - (input.discountAmount ?? 0),
  );
  return { subtotal: roundMoney(subtotal), total: roundMoney(total) };
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PricingRule) private readonly rules: Repository<PricingRule>,
    @InjectRepository(SurgeZone) private readonly surges: Repository<SurgeZone>,
    @InjectRepository(PromoCode) private readonly promos: Repository<PromoCode>,
    @InjectRepository(PromoRedemption) private readonly redemptions: Repository<PromoRedemption>,
  ) {}

  async quote(dto: QuoteDto, userId?: string): Promise<FareQuote> {
    const rule = await this.findRule(dto.serviceType, dto.vehicleType);
    const now = new Date();
    const surge = await this.surges.findOne({
      where: [
        {
          serviceType: dto.serviceType,
          active: true,
          startsAt: LessThanOrEqual(now),
          endsAt: MoreThanOrEqual(now),
        },
        { serviceType: dto.serviceType, active: true, startsAt: IsNull(), endsAt: IsNull() },
      ],
      order: { multiplier: 'DESC' },
    });
    const multiplier = Math.max(rule.defaultMultiplier, surge?.multiplier ?? 1);
    const extrasAmount = Object.entries(dto.extras ?? {}).reduce((sum, [key, quantity]) => {
      const unit = rule.extras?.[key] ?? 0;
      return sum + unit * Number(quantity || 0);
    }, 0);
    const preDiscount = calculateFare({
      baseFare: rule.baseFare,
      perKm: rule.perKm,
      perMinute: rule.perMinute,
      distanceKm: dto.distanceKm,
      durationMinutes: dto.durationMinutes,
      minimumFare: rule.minimumFare,
      bookingFee: rule.bookingFee,
      multiplier,
      extrasAmount,
    });
    const discountAmount = dto.promoCode
      ? await this.promoDiscount(dto.promoCode, dto.serviceType, preDiscount.total, userId)
      : 0;
    const calculated = calculateFare({
      baseFare: rule.baseFare,
      perKm: rule.perKm,
      perMinute: rule.perMinute,
      distanceKm: dto.distanceKm,
      durationMinutes: dto.durationMinutes,
      minimumFare: rule.minimumFare,
      bookingFee: rule.bookingFee,
      multiplier,
      extrasAmount,
      discountAmount,
    });
    return {
      serviceType: dto.serviceType,
      currency: 'UGX',
      distanceKm: dto.distanceKm,
      durationMinutes: dto.durationMinutes,
      multiplier,
      subtotal: calculated.subtotal,
      bookingFee: rule.bookingFee,
      extrasAmount: roundMoney(extrasAmount),
      discountAmount: roundMoney(discountAmount),
      total: calculated.total,
      pricingRuleId: rule.id,
      promoCode: dto.promoCode?.toUpperCase(),
      breakdown: {
        baseFare: rule.baseFare,
        distanceCharge: roundMoney(rule.perKm * dto.distanceKm),
        timeCharge: roundMoney(rule.perMinute * dto.durationMinutes),
        surgeMultiplier: multiplier,
        bookingFee: rule.bookingFee,
        extras: roundMoney(extrasAmount),
        discount: roundMoney(discountAmount),
      },
    };
  }

  async recordRedemption(input: {
    code?: string;
    userId: string;
    serviceType: ServiceType;
    serviceId: string;
    discountAmount: number;
  }): Promise<void> {
    if (!input.code || input.discountAmount <= 0) return;
    const promo = await this.promos.findOne({ where: { code: input.code.toUpperCase() } });
    if (!promo) return;
    await this.redemptions.save(this.redemptions.create({ promoCodeId: promo.id, ...input }));
  }

  listRules() {
    return this.rules.find({ order: { serviceType: 'ASC', createdAt: 'DESC' } });
  }

  createRule(dto: CreatePricingRuleDto) {
    return this.rules.save(this.rules.create({ ...dto, active: true }));
  }

  async updateRule(id: string, dto: Partial<CreatePricingRuleDto>) {
    const rule = await this.rules.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Pricing rule not found');
    Object.assign(rule, dto);
    return this.rules.save(rule);
  }

  async deleteRule(id: string) {
    const result = await this.rules.softDelete(id);
    if (!result.affected) throw new NotFoundException('Pricing rule not found');
    return { deleted: true };
  }

  listSurges() {
    return this.surges.find({ order: { active: 'DESC', createdAt: 'DESC' } });
  }

  createSurge(dto: CreateSurgeZoneDto) {
    return this.surges.save(
      this.surges.create({
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        active: dto.active ?? true,
      }),
    );
  }

  async updateSurge(id: string, dto: Partial<CreateSurgeZoneDto>) {
    const surge = await this.surges.findOne({ where: { id } });
    if (!surge) throw new NotFoundException('Surge zone not found');
    Object.assign(surge, dto);
    if (dto.startsAt) surge.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) surge.endsAt = new Date(dto.endsAt);
    return this.surges.save(surge);
  }

  async deleteSurge(id: string) {
    const result = await this.surges.softDelete(id);
    if (!result.affected) throw new NotFoundException('Surge zone not found');
    return { deleted: true };
  }

  listPromos() {
    return this.promos.find({ order: { active: 'DESC', createdAt: 'DESC' } });
  }

  async createPromo(dto: CreatePromoCodeDto) {
    const code = dto.code.trim().toUpperCase();
    if (await this.promos.findOne({ where: { code } })) {
      throw new BadRequestException('Promo code already exists');
    }
    return this.promos.save(
      this.promos.create({
        ...dto,
        code,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        minimumSpend: dto.minimumSpend ?? 0,
        globalUsageLimit: dto.globalUsageLimit ?? 0,
        perUserLimit: dto.perUserLimit ?? 1,
        active: dto.active ?? true,
      }),
    );
  }

  async updatePromo(id: string, dto: Partial<CreatePromoCodeDto>) {
    const promo = await this.promos.findOne({ where: { id } });
    if (!promo) throw new NotFoundException('Promo code not found');
    Object.assign(promo, dto, dto.code ? { code: dto.code.trim().toUpperCase() } : {});
    if (dto.startsAt) promo.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) promo.endsAt = new Date(dto.endsAt);
    return this.promos.save(promo);
  }

  async deletePromo(id: string) {
    const result = await this.promos.softDelete(id);
    if (!result.affected) throw new NotFoundException('Promo code not found');
    return { deleted: true };
  }

  private async findRule(serviceType: ServiceType, vehicleType?: VehicleType): Promise<PricingRule> {
    let rule: PricingRule | null = null;
    if (vehicleType) rule = await this.rules.findOne({ where: { serviceType, vehicleType, active: true } });
    rule ??= await this.rules.findOne({ where: { serviceType, active: true }, order: { createdAt: 'ASC' } });
    if (!rule) throw new NotFoundException(`No active pricing rule for ${serviceType}`);
    return rule;
  }

  private async promoDiscount(code: string, serviceType: ServiceType, total: number, userId?: string) {
    const promo = await this.promos.findOne({ where: { code: code.toUpperCase(), active: true } });
    if (!promo) throw new BadRequestException('Promo code is invalid');
    const now = new Date();
    if (promo.startsAt && promo.startsAt > now) throw new BadRequestException('Promo code is not active yet');
    if (promo.endsAt && promo.endsAt < now) throw new BadRequestException('Promo code has expired');
    if (promo.serviceType && promo.serviceType !== serviceType) {
      throw new BadRequestException('Promo code does not apply to this service');
    }
    if (total < promo.minimumSpend)
      throw new BadRequestException('Minimum spend for this promo was not reached');
    if (userId && promo.perUserLimit > 0) {
      const count = await this.redemptions.count({ where: { promoCodeId: promo.id, userId } });
      if (count >= promo.perUserLimit) throw new BadRequestException('Promo code usage limit reached');
    }
    if (promo.globalUsageLimit > 0) {
      const count = await this.redemptions.count({ where: { promoCodeId: promo.id } });
      if (count >= promo.globalUsageLimit) throw new BadRequestException('Promo code is fully redeemed');
    }
    const raw = promo.discountType === 'PERCENT' ? (total * promo.value) / 100 : promo.value;
    return Math.min(raw, promo.maximumDiscount ?? raw, total);
  }
}
