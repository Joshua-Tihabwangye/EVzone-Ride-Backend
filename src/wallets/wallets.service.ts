import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AccountingService } from '../accounting/accounting.service';
import { PaymentStatus, TransactionDirection, WalletTransactionType } from '../common/enums';
import { Payout, User, Wallet, WalletTransaction } from '../database/entities';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(WalletTransaction) private readonly transactions: Repository<WalletTransaction>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly accounting: AccountingService,
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

  async transfer(senderUserId: string, recipientIdentifier: string, amount: number, note?: string) {
    const recipient = await this.users
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:identifier)', { identifier: recipientIdentifier })
      .orWhere('user.phone = :identifier', { identifier: recipientIdentifier })
      .getOne();
    if (!recipient) throw new NotFoundException('Recipient not found');
    if (recipient.id === senderUserId) throw new BadRequestException('Cannot transfer to your own wallet');
    const reference = `TRF-${randomUUID()}`;
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

  async withdraw(userId: string, amount: number, destination: string) {
    const reference = `PAYOUT-${randomUUID()}`;
    await this.debit(userId, amount, WalletTransactionType.PAYOUT, reference, 'Driver payout');
    const payout = await this.payouts.save(
      this.payouts.create({
        driverId: userId,
        amount,
        currency: 'UGX',
        status: PaymentStatus.PAID,
        destination,
        reference,
        metadata: { provider: 'EVZONE_LOCAL', settledAt: new Date().toISOString() },
      }),
    );
    return payout;
  }

  async credit(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    reference: string,
    description?: string,
    metadata?: Record<string, unknown>,
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
    return { wallet, transaction };
  }

  async debit(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    reference: string,
    description?: string,
    metadata?: Record<string, unknown>,
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
    return { wallet, transaction };
  }

  private async ensureWallet(userId: string): Promise<Wallet> {
    let wallet = await this.wallets.findOne({ where: { userId } });
    if (!wallet)
      wallet = await this.wallets.save(this.wallets.create({ userId, currency: 'UGX', availableBalance: 0 }));
    return wallet;
  }
}
