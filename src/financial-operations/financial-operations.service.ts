import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { encryptSecret } from '../common/utils/crypto-vault';
import { CashoutRequest, DriverProfile, StoredPaymentMethod } from '../database/entities';
import { PayoutOrchestratorService } from '../payouts/payout-orchestrator.service';
import { WalletsService } from '../wallets/wallets.service';
import {
  CreateCashoutRequestDto,
  CreateStoredPaymentMethodDto,
  ReviewCashoutRequestDto,
  UpdateStoredPaymentMethodDto,
} from './financial-operations.dto';
import { CashoutRequestStatus } from '../common/enums';

@Injectable()
export class FinancialOperationsService {
  private readonly logger = new Logger(FinancialOperationsService.name);

  constructor(
    @InjectRepository(StoredPaymentMethod)
    private readonly methods: Repository<StoredPaymentMethod>,
    @InjectRepository(CashoutRequest)
    private readonly cashouts: Repository<CashoutRequest>,
    @InjectRepository(DriverProfile)
    private readonly drivers: Repository<DriverProfile>,
    private readonly wallets: WalletsService,
    private readonly payoutOrchestrator: PayoutOrchestratorService,
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

  async requestCashout(userId: string, dto: CreateCashoutRequestDto, organizationId?: string) {
    const reference = dto.idempotencyKey?.trim() ?? `CO-${randomUUID()}`;
    const existing = await this.cashouts.findOne({ where: { userId, reference } });
    if (existing) return existing;

    const wallet = await this.wallets.get(userId);
    const pending = await this.cashouts.find({
      where: { userId, status: CashoutRequestStatus.PENDING },
    });
    const reserved = pending.reduce((sum, item) => sum + Number(item.amount), 0);
    if (Number(wallet.availableBalance) - Number(wallet.reservedForCashout) - reserved < dto.amount) {
      throw new BadRequestException('Available balance is insufficient after pending cashouts');
    }

    const driver = await this.drivers.findOne({ where: { userId } });
    const record = await this.cashouts.save(
      this.cashouts.create({
        userId,
        organizationId,
        driverId: driver?.id,
        reference,
        amount: dto.amount,
        currency: dto.currency ?? 'UGX',
        status: CashoutRequestStatus.PENDING,
        method: dto.method,
        metadata: dto.metadata,
      }),
    );

    try {
      await this.wallets.reserveCashout(
        userId,
        dto.amount,
        reference,
        'Cashout request reserve',
        {
          cashoutRequestId: record.id,
        },
        organizationId,
      );
    } catch (error) {
      this.logger.warn(`Cashout reserve failed: ${error instanceof Error ? error.message : String(error)}`);
      record.status = CashoutRequestStatus.FAILED;
      record.failureReason = 'Failed to reserve wallet balance';
      await this.cashouts.save(record);
      throw error;
    }

    if ((process.env.CASHOUT_AUTO_APPROVE ?? '').toLowerCase() === 'true') {
      return this.reviewCashout(record.id, 'SYSTEM', { status: 'APPROVED' });
    }
    return record;
  }

  listMyCashouts(userId: string) {
    return this.cashouts.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  listCashouts(status?: CashoutRequestStatus, organizationId?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (organizationId) where.organizationId = organizationId;
    return this.cashouts.find({
      where,
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async cancelCashout(userId: string, id: string) {
    const record = await this.cashouts.findOne({ where: { id, userId } });
    if (!record) throw new NotFoundException('Cashout request not found');
    if (record.status !== CashoutRequestStatus.PENDING)
      throw new ConflictException('Only pending cashouts can be cancelled');
    record.status = CashoutRequestStatus.CANCELLED;
    await this.cashouts.save(record);
    await this.releaseReserve(record);
    return record;
  }

  async reviewCashout(id: string, reviewerId: string, dto: ReviewCashoutRequestDto) {
    const record = await this.cashouts.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Cashout request not found');
    if (record.status !== CashoutRequestStatus.PENDING)
      throw new ConflictException('Cashout request already reviewed');

    record.reviewedByUserId = reviewerId;
    record.reviewedAt = new Date();
    if (dto.status === 'REJECTED') {
      record.status = CashoutRequestStatus.REJECTED;
      record.failureReason = dto.reason;
      await this.cashouts.save(record);
      await this.releaseReserve(record);
      return record;
    }

    const result = await this.payoutOrchestrator.payoutFromCashout(id, reviewerId, {
      providerName: dto.provider,
      idempotencyKey: record.reference,
    });
    return result.cashout;
  }

  private async releaseReserve(record: CashoutRequest) {
    try {
      await this.wallets.releaseCashout(
        record.userId,
        Number(record.amount),
        record.reference,
        'Cashout release',
        {
          cashoutRequestId: record.id,
        },
        record.organizationId,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to release reserve for cashout ${record.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
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
