import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AccountingService } from '../accounting/accounting.service';
import { Transactional } from '../common/transaction';
import { getManager, getRepository } from '../common/transaction/transaction.helper';
import { PaymentStatus, TransactionDirection, WalletTransactionType } from '../common/enums';
import { Payout, User, Wallet, WalletTransaction } from '../database/entities';

const rounded = (value: number) => Math.round(Number(value) * 100) / 100;

@Injectable()
export class WalletsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(WalletTransaction) private readonly transactions: Repository<WalletTransaction>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly accounting: AccountingService,
    private readonly events: EventEmitter2,
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

  @Transactional()
  async topUp(userId: string, amount: number, providerToken?: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Wallet top-up must use a configured payment provider in production');
    }
    return this.credit(
      userId,
      amount,
      WalletTransactionType.TOP_UP,
      `TOPUP-${randomUUID()}`,
      'Wallet top-up',
    );
  }

  @Transactional()
  async transfer(
    senderUserId: string,
    recipientIdentifier: string,
    amount: number,
    note?: string,
    idempotencyKey?: string,
  ) {
    const users = getRepository(User);
    const recipient = await users
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:identifier)', { identifier: recipientIdentifier })
      .orWhere('user.phone = :identifier', { identifier: recipientIdentifier })
      .getOne();
    if (!recipient) throw new NotFoundException('Recipient not found');
    if (recipient.id === senderUserId) throw new BadRequestException('Cannot transfer to your own wallet');

    const reference = idempotencyKey ? `TRF-${idempotencyKey.slice(0, 32)}` : `TRF-${randomUUID()}`;

    if (idempotencyKey) {
      const existing = await getRepository(WalletTransaction).findOne({
        where: { reference },
      });
      if (existing) {
        return {
          reference,
          amount,
          recipient: { id: recipient.id, firstName: recipient.firstName, lastName: recipient.lastName },
        };
      }
    }

    const [senderWallet, recipientWallet] = await this.ensureAndLockWallets([senderUserId, recipient.id]);
    await this.debitLocked(
      senderWallet,
      amount,
      WalletTransactionType.TRANSFER,
      reference,
      note ?? 'Wallet transfer',
    );
    await this.creditLocked(
      recipientWallet,
      amount,
      WalletTransactionType.TRANSFER,
      reference,
      note ?? 'Wallet transfer',
    );
    return {
      reference,
      amount,
      recipient: { id: recipient.id, firstName: recipient.firstName, lastName: recipient.lastName },
    };
  }

  @Transactional()
  async withdraw(userId: string, amount: number, destination: string, idempotencyKey?: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Direct wallet withdrawal is disabled in production; use cashout review');
    }
    const reference = idempotencyKey ? `PAYOUT-${idempotencyKey.slice(0, 32)}` : `PAYOUT-${randomUUID()}`;

    if (idempotencyKey) {
      const existing = await getRepository(Payout).findOne({ where: { reference } });
      if (existing) return existing;
    }

    const wallet = await this.ensureAndLockWallet(userId);
    await this.debitLocked(wallet, amount, WalletTransactionType.PAYOUT, reference, 'Driver payout');
    const payouts = getRepository(Payout);
    const payout = await payouts.save(
      payouts.create({
        driverId: userId,
        amount,
        currency: 'UGX',
        status: PaymentStatus.PAID,
        destination,
        reference,
        metadata: { provider: 'EVZONE_LOCAL', settledAt: new Date().toISOString(), idempotencyKey },
      }),
    );
    return payout;
  }

  @Transactional()
  async credit(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    reference: string,
    description?: string,
    metadata?: Record<string, unknown>,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    const wallet = await this.ensureAndLockWallet(userId);
    return this.creditLocked(wallet, amount, type, reference, description, metadata);
  }

  @Transactional()
  async debit(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    reference: string,
    description?: string,
    metadata?: Record<string, unknown>,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    const wallet = await this.ensureAndLockWallet(userId);
    return this.debitLocked(wallet, amount, type, reference, description, metadata);
  }

  private async ensureWallet(userId: string, manager?: EntityManager): Promise<Wallet> {
    const repo = manager ? manager.getRepository(Wallet) : this.wallets;
    let wallet = await repo.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await repo.save(repo.create({ userId, currency: 'UGX', availableBalance: 0 }));
    }
    return wallet;
  }

  private async ensureAndLockWallet(userId: string): Promise<Wallet> {
    const wallets = getRepository(Wallet);
    let wallet = await wallets.findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      // Use DO NOTHING so a concurrent insert does not overwrite an already-credited wallet.
      await wallets
        .createQueryBuilder()
        .insert()
        .into(Wallet)
        .values({ userId, currency: 'UGX', availableBalance: 0, pendingBalance: 0, active: true } as any)
        .orIgnore()
        .execute();
      wallet = await wallets.findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
    }
    if (!wallet) {
      throw new InternalServerErrorException('Failed to acquire wallet lock');
    }
    return wallet;
  }

  private async ensureAndLockWallets(userIds: string[]): Promise<Wallet[]> {
    const ordered = [...new Set(userIds)].sort();
    const locked = new Map<string, Wallet>();
    for (const userId of ordered) {
      locked.set(userId, await this.ensureAndLockWallet(userId));
    }
    return userIds.map((userId) => locked.get(userId)!);
  }

  private async creditLocked(
    wallet: Wallet,
    amount: number,
    type: WalletTransactionType,
    reference: string,
    description?: string,
    metadata?: Record<string, unknown>,
  ) {
    const transactions = getRepository(WalletTransaction);
    const existing = await transactions.findOne({
      where: { walletId: wallet.id, reference, direction: TransactionDirection.CREDIT },
    });
    if (existing) return { wallet, transaction: existing };

    wallet.availableBalance = rounded(Number(wallet.availableBalance) + amount);
    await getRepository(Wallet).save(wallet);

    const transaction = await transactions.save(
      transactions.create({
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

    await this.accounting.postWalletMovement(
      {
        userId: wallet.userId,
        amount,
        direction: TransactionDirection.CREDIT,
        type,
        reference,
        currency: wallet.currency,
        description,
        metadata,
      },
      getManager(),
    );

    this.events.emit('domain.event', {
      eventType: 'wallet.credited',
      aggregateType: 'Wallet',
      aggregateId: wallet.id,
      eventKey: reference,
      payload: {
        userId: wallet.userId,
        walletId: wallet.id,
        transactionId: transaction.id,
        amount,
        type,
        reference,
      },
    });

    return { wallet, transaction };
  }

  private async debitLocked(
    wallet: Wallet,
    amount: number,
    type: WalletTransactionType,
    reference: string,
    description?: string,
    metadata?: Record<string, unknown>,
  ) {
    const transactions = getRepository(WalletTransaction);
    const existing = await transactions.findOne({
      where: { walletId: wallet.id, reference, direction: TransactionDirection.DEBIT },
    });
    if (existing) return { wallet, transaction: existing };

    if (rounded(Number(wallet.availableBalance)) < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }
    wallet.availableBalance = rounded(Number(wallet.availableBalance) - amount);
    await getRepository(Wallet).save(wallet);

    const transaction = await transactions.save(
      transactions.create({
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

    await this.accounting.postWalletMovement(
      {
        userId: wallet.userId,
        amount,
        direction: TransactionDirection.DEBIT,
        type,
        reference,
        currency: wallet.currency,
        description,
        metadata,
      },
      getManager(),
    );

    this.events.emit('domain.event', {
      eventType: 'wallet.debited',
      aggregateType: 'Wallet',
      aggregateId: wallet.id,
      eventKey: reference,
      payload: {
        userId: wallet.userId,
        walletId: wallet.id,
        transactionId: transaction.id,
        amount,
        type,
        reference,
      },
    });

    return { wallet, transaction };
  }
}
