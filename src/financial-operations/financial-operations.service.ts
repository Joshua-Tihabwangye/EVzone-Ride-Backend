import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { encryptSecret } from '../common/utils/crypto-vault';
import { CashoutRequest, DriverProfile, StoredPaymentMethod } from '../database/entities';
import { WalletsService } from '../wallets/wallets.service';
import {
  CreateCashoutRequestDto,
  CreateStoredPaymentMethodDto,
  ReviewCashoutRequestDto,
  UpdateStoredPaymentMethodDto,
} from './financial-operations.dto';

@Injectable()
export class FinancialOperationsService {
  constructor(
    @InjectRepository(StoredPaymentMethod)
    private readonly methods: Repository<StoredPaymentMethod>,
    @InjectRepository(CashoutRequest)
    private readonly cashouts: Repository<CashoutRequest>,
    @InjectRepository(DriverProfile)
    private readonly drivers: Repository<DriverProfile>,
    private readonly wallets: WalletsService,
    private readonly events: EventEmitter2,
  ) {}

  listMethods(userId: string) {
    return this.methods.find({
      where: { userId, enabled: true },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async createMethod(userId: string, dto: CreateStoredPaymentMethodDto) {
    const currentCount = await this.methods.count({ where: { userId, enabled: true } });
    const makeDefault = dto.isDefault === true || currentCount === 0;
    if (makeDefault) await this.methods.update({ userId }, { isDefault: false });

    const record = this.methods.create({
      userId,
      type: dto.type,
      label: dto.label,
      provider: dto.provider,
      providerToken: dto.token ? encryptSecret({ token: dto.token }) : undefined,
      maskedValue: dto.maskedValue ?? this.mask(dto.token),
      expiryMonth: dto.expiryMonth,
      expiryYear: dto.expiryYear,
      isDefault: makeDefault,
      enabled: true,
      metadata: dto.metadata,
    });
    return this.methods.save(record);
  }

  async updateMethod(userId: string, id: string, dto: UpdateStoredPaymentMethodDto) {
    const record = await this.methods.findOne({ where: { id, userId } });
    if (!record) throw new NotFoundException('Payment method not found');
    if (dto.isDefault) await this.methods.update({ userId }, { isDefault: false });
    Object.assign(record, dto);
    const saved = await this.methods.save(record);
    if (!saved.enabled && saved.isDefault) {
      saved.isDefault = false;
      await this.methods.save(saved);
      const replacement = await this.methods.findOne({
        where: { userId, enabled: true },
        order: { createdAt: 'DESC' },
      });
      if (replacement) {
        replacement.isDefault = true;
        await this.methods.save(replacement);
      }
    }
    return saved;
  }

  async removeMethod(userId: string, id: string) {
    return this.updateMethod(userId, id, { enabled: false });
  }

  async requestCashout(userId: string, dto: CreateCashoutRequestDto) {
    const wallet = await this.wallets.get(userId);
    const pending = await this.cashouts.find({ where: { userId, status: 'PENDING' } });
    const reserved = pending.reduce((sum, item) => sum + Number(item.amount), 0);
    if (Number(wallet.availableBalance) - reserved < dto.amount) {
      throw new BadRequestException('Available balance is insufficient after pending cashouts');
    }
    const driver = await this.drivers.findOne({ where: { userId } });
    const record = await this.cashouts.save(
      this.cashouts.create({
        userId,
        driverId: driver?.id,
        amount: dto.amount,
        status: 'PENDING',
        method: dto.method,
        metadata: dto.metadata,
      }),
    );
    this.events.emit('domain.event', {
      eventType: 'cashout.requested',
      aggregateType: 'CashoutRequest',
      aggregateId: record.id,
      eventKey: record.userId,
      payload: {
        cashoutId: record.id,
        userId: record.userId,
        driverId: record.driverId,
        amount: record.amount,
        status: record.status,
      },
    });
    if ((process.env.CASHOUT_AUTO_APPROVE ?? '').toLowerCase() === 'true') {
      return this.reviewCashout(record.id, 'SYSTEM', { status: 'APPROVED' });
    }
    return record;
  }

  listMyCashouts(userId: string) {
    return this.cashouts.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  listCashouts(status?: string) {
    return this.cashouts.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async cancelCashout(userId: string, id: string) {
    const record = await this.cashouts.findOne({ where: { id, userId } });
    if (!record) throw new NotFoundException('Cashout request not found');
    if (record.status !== 'PENDING') throw new ConflictException('Only pending cashouts can be cancelled');
    record.status = 'CANCELLED';
    return this.cashouts.save(record);
  }

  async reviewCashout(id: string, reviewerId: string, dto: ReviewCashoutRequestDto) {
    const record = await this.cashouts.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Cashout request not found');
    if (record.status !== 'PENDING') throw new ConflictException('Cashout request already reviewed');

    record.reviewedByUserId = reviewerId;
    record.reviewedAt = new Date();
    if (dto.status === 'REJECTED') {
      record.status = 'REJECTED';
      record.failureReason = dto.reason;
      return this.cashouts.save(record);
    }

    const destination = this.destination(record.method);
    const payoutProvider = (process.env.CASHOUT_PAYOUT_PROVIDER ?? 'LOCAL').toUpperCase();
    if (process.env.NODE_ENV === 'production' && payoutProvider === 'LOCAL') {
      record.status = 'APPROVED';
      record.metadata = {
        ...(record.metadata ?? {}),
        payoutProvider,
        payoutBlocked: 'Real payout provider is required in production',
      };
      await this.cashouts.save(record);
      throw new BadRequestException('A real cashout payout provider is required in production');
    }
    try {
      const payout = await this.wallets.withdraw(record.userId, Number(record.amount), destination);
      record.status = 'PAID';
      record.processedAt = new Date();
      record.metadata = {
        ...(record.metadata ?? {}),
        payoutId: payout.id,
        payoutReference: payout.reference,
      };
      return this.cashouts.save(record);
    } catch (error) {
      record.status = 'FAILED';
      record.failureReason = error instanceof Error ? error.message : String(error);
      await this.cashouts.save(record);
      throw error;
    }
  }

  private mask(value?: string): string | undefined {
    if (!value) return undefined;
    const normalized = value.replace(/\s+/g, '');
    return normalized.length <= 4 ? normalized : `•••• ${normalized.slice(-4)}`;
  }

  private destination(method: Record<string, unknown>): string {
    const destination = method.phone ?? method.accountNumber ?? method.destination ?? method.label;
    if (typeof destination !== 'string' || destination.trim().length < 3) {
      throw new BadRequestException('Cashout method requires phone, accountNumber or destination');
    }
    return destination.trim();
  }
}
