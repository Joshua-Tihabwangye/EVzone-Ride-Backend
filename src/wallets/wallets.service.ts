import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { WithSpan } from '../observability/tracing/trace.decorator';
import { BusinessMetricsService } from '../observability/metrics/business-metrics.service';
import { AccountingService } from '../accounting/accounting.service';
import { PaymentStatus, PayoutStatus, TransactionDirection, WalletTransactionType } from '../common/enums';
import { Payout, User, Wallet, WalletTransaction } from '../database/entities';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(WalletTransaction) private readonly transactions: Repository<WalletTransaction>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly accounting: AccountingService,
    private readonly businessMetrics: BusinessMetricsService,
  ) {}

  async get(userId: string) {
    return this.ensureWallet(userId);
  }

  async listTransactions(userId: string, page = 1, limit = 20) {
    const wallet = await this.ensureWallet(userId);
    const [items, total] = await this.transactions.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async topUp(userId: string, amount: number, providerToken?: string) {
    if (process.env.NODE_ENV === 'production' && providerToken !== 'EVZONE-DEMO-SUCCESS') {
      throw new BadRequestException('A valid payment provider token is required');
    }
    return this.credit(
      userId,
      amount,
      WalletTransactionType.TOP_UP,
      `TOPUP-${randomUUID()}`,
      'Wallet top-up',
    );
  }

  @WithSpan()
  async transfer(
    senderUserId: string,
    recipientIdentifier: string,
    amount: number,
    note?: string,
    idempotencyKey?: string,
  ) {
    const recipient = await this.users
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:identifier)', { identifier: recipientIdentifier })
      .orWhere('user.phone = :identifier', { identifier: recipientIdentifier })
      .getOne();
    if (!recipient) throw new NotFoundException('Recipient not found');
    if (recipient.id === senderUserId) throw new BadRequestException('Cannot transfer to your own wallet');
    const reference = idempotencyKey ? `TRF-${idempotencyKey}` : `TRF-${randomUUID()}`;
    await this.debit(
      senderUserId,
      amount,
      WalletTransactionType.TRANSFER,
      reference,
      note ?? 'Wallet transfer',
    );
    try {
      await this.credit(
        recipient.id,
        amount,
        WalletTransactionType.TRANSFER,
        reference,
        note ?? 'Wallet transfer',
      );
    } catch (error) {
      await this.credit(
        senderUserId,
        amount,
        WalletTransactionType.REFUND,
        `${reference}-REV`,
        'Transfer reversal',
      );
      throw error;
    }
    return {
      reference,
      amount,
      recipient: { id: recipient.id, firstName: recipient.firstName, lastName: recipient.lastName },
    };
  }

  async reserveCashout(
    userId: string,
    amount: number,
    reference: string,
    description = 'Cashout reserve',
    metadata?: Record<string, unknown>,
    organizationId?: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    const wallet = await this.ensureWallet(userId);
    const existing = await this.transactions.findOne({
      where: { walletId: wallet.id, reference, direction: TransactionDirection.DEBIT },
    });
    if (existing) return { wallet, transaction: existing };

    if (Number(wallet.availableBalance) < amount)
      throw new BadRequestException('Insufficient wallet balance');

    wallet.availableBalance = Number(wallet.availableBalance) - amount;
    wallet.reservedForCashout = Number(wallet.reservedForCashout) + amount;
    await this.saveWallet(wallet);

    const transaction = await this.transactions.save(
      this.transactions.create({
        walletId: wallet.id,
        organizationId,
        type: WalletTransactionType.CASHOUT_RESERVE,
        direction: TransactionDirection.DEBIT,
        amount,
        balanceAfter: wallet.availableBalance,
        reference,
        status: PaymentStatus.PAID,
        description,
        metadata,
      }),
    );
    return { wallet, transaction };
  }

  async releaseCashout(
    userId: string,
    amount: number,
    reference: string,
    description = 'Cashout release',
    metadata?: Record<string, unknown>,
    organizationId?: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    const wallet = await this.ensureWallet(userId);
    const existing = await this.transactions.findOne({
      where: { walletId: wallet.id, reference, direction: TransactionDirection.CREDIT },
    });
    if (existing) return { wallet, transaction: existing };

    if (Number(wallet.reservedForCashout) < amount)
      throw new BadRequestException('Reserved balance is less than release amount');

    wallet.availableBalance = Number(wallet.availableBalance) + amount;
    wallet.reservedForCashout = Number(wallet.reservedForCashout) - amount;
    await this.saveWallet(wallet);

    const transaction = await this.transactions.save(
      this.transactions.create({
        walletId: wallet.id,
        organizationId,
        type: WalletTransactionType.CASHOUT_RELEASE,
        direction: TransactionDirection.CREDIT,
        amount,
        balanceAfter: wallet.availableBalance,
        reference,
        status: PaymentStatus.PAID,
        description,
        metadata,
      }),
    );
    return { wallet, transaction };
  }

  async debitReserved(
    userId: string,
    amount: number,
    reference: string,
    description = 'Driver payout',
    metadata?: Record<string, unknown>,
    organizationId?: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    const wallet = await this.ensureWallet(userId);
    const existing = await this.transactions.findOne({
      where: { walletId: wallet.id, reference, direction: TransactionDirection.DEBIT },
    });
    if (existing) return { wallet, transaction: existing };

    if (Number(wallet.reservedForCashout) < amount)
      throw new BadRequestException('Reserved balance is insufficient for payout');

    wallet.reservedForCashout = Number(wallet.reservedForCashout) - amount;
    await this.saveWallet(wallet);

    const transaction = await this.transactions.save(
      this.transactions.create({
        walletId: wallet.id,
        organizationId,
        type: WalletTransactionType.PAYOUT,
        direction: TransactionDirection.DEBIT,
        amount,
        balanceAfter: wallet.availableBalance,
        reference,
        status: PaymentStatus.PAID,
        description,
        metadata,
      }),
    );

    await this.accounting.postWalletMovement({
      userId,
      amount,
      direction: TransactionDirection.DEBIT,
      type: WalletTransactionType.PAYOUT,
      reference,
      currency: wallet.currency,
      description,
      metadata,
    });
    return { wallet, transaction };
  }

  @WithSpan()
  async credit(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    reference: string,
    description?: string,
    metadata?: Record<string, unknown>,
    organizationId?: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    const wallet = await this.ensureWallet(userId);
    const existing = await this.transactions.findOne({
      where: { walletId: wallet.id, reference, direction: TransactionDirection.CREDIT },
    });
    if (existing) return { wallet, transaction: existing };
    wallet.availableBalance = Number(wallet.availableBalance) + amount;
    await this.wallets.save(wallet);
    const transaction = await this.transactions.save(
      this.transactions.create({
        walletId: wallet.id,
        organizationId,
        type,
        direction: TransactionDirection.CREDIT,
        amount,
        balanceAfter: wallet.availableBalance,
        reference,
        status: PaymentStatus.PAID,
        description,
        metadata,
      }),
    );
    await this.accounting.postWalletMovement({
      userId,
      amount,
      direction: TransactionDirection.CREDIT,
      type,
      reference,
      currency: wallet.currency,
      description,
      metadata,
    });
    this.businessMetrics.recordWalletMovement('CREDIT', type);
    return { wallet, transaction };
  }

  @WithSpan()
  async debit(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    reference: string,
    description?: string,
    metadata?: Record<string, unknown>,
    organizationId?: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    const wallet = await this.ensureWallet(userId);
    const existing = await this.transactions.findOne({
      where: { walletId: wallet.id, reference, direction: TransactionDirection.DEBIT },
    });
    if (existing) return { wallet, transaction: existing };
    if (Number(wallet.availableBalance) < amount)
      throw new BadRequestException('Insufficient wallet balance');
    wallet.availableBalance = Number(wallet.availableBalance) - amount;
    await this.wallets.save(wallet);
    const transaction = await this.transactions.save(
      this.transactions.create({
        walletId: wallet.id,
        organizationId,
        type,
        direction: TransactionDirection.DEBIT,
        amount,
        balanceAfter: wallet.availableBalance,
        reference,
        status: PaymentStatus.PAID,
        description,
        metadata,
      }),
    );
    await this.accounting.postWalletMovement({
      userId,
      amount,
      direction: TransactionDirection.DEBIT,
      type,
      reference,
      currency: wallet.currency,
      description,
      metadata,
    });
    this.businessMetrics.recordWalletMovement('DEBIT', type);
    return { wallet, transaction };
  }

  @WithSpan()
  async withdraw(userId: string, amount: number, destination: string, organizationId?: string) {
    const reference = `PAYOUT-${randomUUID()}`;
    const wallet = await this.ensureWallet(userId);
    if (Number(wallet.availableBalance) - Number(wallet.reservedForCashout) < amount) {
      throw new BadRequestException('Insufficient available balance');
    }
    await this.debit(
      userId,
      amount,
      WalletTransactionType.PAYOUT,
      reference,
      'Manual wallet withdrawal',
      undefined,
      organizationId,
    );
    const payout = await this.payouts.save(
      this.payouts.create({
        driverId: userId,
        organizationId,
        amount,
        currency: 'UGX',
        status: PayoutStatus.PENDING,
        destination,
        reference,
        idempotencyKey: reference,
        provider: 'MANUAL',
        metadata: { source: 'WALLET_WITHDRAW' },
      }),
    );
    return payout;
  }

  private async ensureWallet(userId: string): Promise<Wallet> {
    let wallet = await this.wallets.findOne({ where: { userId } });
    if (!wallet)
      wallet = await this.wallets.save(
        this.wallets.create({ userId, currency: 'UGX', availableBalance: 0, reservedForCashout: 0 }),
      );
    return wallet;
  }

  private async saveWallet(wallet: Wallet): Promise<Wallet> {
    try {
      return await this.wallets.save(wallet);
    } catch (error) {
      if ((error as { name?: string })?.name === 'OptimisticLockVersionMismatchError') {
        throw new ConflictException('Wallet was modified concurrently');
      }
      throw error;
    }
  }
}
