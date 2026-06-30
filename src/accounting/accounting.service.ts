import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  JournalStatus,
  LedgerAccountType,
  ServiceType,
  TransactionDirection,
  WalletTransactionType,
} from '../common/enums';
import { EarningsLedger, JournalTransaction, LedgerAccount, LedgerEntry } from '../database/entities';
import { PostJournalDto } from './accounting.dto';

@Injectable()
export class AccountingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(LedgerAccount) private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(JournalTransaction)
    private readonly journals: Repository<JournalTransaction>,
    @InjectRepository(LedgerEntry) private readonly entries: Repository<LedgerEntry>,
    @InjectRepository(EarningsLedger) private readonly earnings: Repository<EarningsLedger>,
    private readonly events: EventEmitter2,
  ) {}

  async postJournal(input: PostJournalDto, manager?: EntityManager) {
    const currency = input.currency ?? 'UGX';
    const rounded = (value: number) => Math.round(Number(value) * 100) / 100;
    const debits = rounded(
      input.lines
        .filter((line) => line.direction === TransactionDirection.DEBIT)
        .reduce((sum, line) => sum + Number(line.amount), 0),
    );
    const credits = rounded(
      input.lines
        .filter((line) => line.direction === TransactionDirection.CREDIT)
        .reduce((sum, line) => sum + Number(line.amount), 0),
    );
    if (debits <= 0 || credits <= 0 || debits !== credits) {
      throw new BadRequestException({
        message: 'Journal is not balanced',
        debits,
        credits,
      });
    }

    const execute = async (txManager: EntityManager) => {
      const duplicate = await txManager.findOne(JournalTransaction, {
        where: { reference: input.reference },
      });
      if (duplicate) return duplicate;
      let journal = await txManager.save(
        JournalTransaction,
        txManager.create(JournalTransaction, {
          reference: input.reference,
          transactionType: input.transactionType,
          description: input.description,
          serviceType: input.serviceType,
          serviceId: input.serviceId,
          metadata: input.metadata,
          status: JournalStatus.PENDING,
        }),
      );

      for (const line of input.lines) {
        const account = await this.ensureAccount(txManager, {
          code: line.accountCode,
          name: line.accountName,
          accountType: line.accountType,
          ownerType: line.ownerType,
          ownerId: line.ownerId,
          currency,
        });
        const amount = rounded(line.amount);
        account.balance = rounded(
          Number(account.balance) + this.balanceEffect(account.accountType, line.direction, amount),
        );
        await txManager.save(LedgerAccount, account);
        await txManager.save(
          LedgerEntry,
          txManager.create(LedgerEntry, {
            journalId: journal.id,
            accountId: account.id,
            direction: line.direction,
            amount,
            currency,
            balanceAfter: account.balance,
            memo: line.memo,
            metadata: line.metadata,
          }),
        );
      }
      journal.status = JournalStatus.POSTED;
      journal.postedAt = new Date();
      journal = await txManager.save(JournalTransaction, journal);
      return journal;
    };

    let result: JournalTransaction;
    if (manager) {
      result = await execute(manager);
    } else {
      const existing = await this.journals.findOne({ where: { reference: input.reference } });
      if (existing) return this.detail(existing.id);
      result = await this.dataSource.transaction(execute);

      this.events.emit('domain.event', {
        topic: 'accounting',
        eventType: 'accounting.journal.posted',
        aggregateType: 'JournalTransaction',
        aggregateId: result.id,
        eventKey: result.reference,
        payload: {
          journalId: result.id,
          reference: result.reference,
          transactionType: result.transactionType,
          serviceType: result.serviceType,
          serviceId: result.serviceId,
          debits,
          credits,
        },
      });
    }

    return this.detail(result.id);
  }

  async postWalletMovement(
    input: {
      userId: string;
      amount: number;
      direction: TransactionDirection;
      type: WalletTransactionType;
      reference: string;
      currency?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    },
    manager?: EntityManager,
  ) {
    const currency = input.currency ?? 'UGX';
    const walletDirection = input.direction;
    const counterDirection =
      walletDirection === TransactionDirection.CREDIT
        ? TransactionDirection.DEBIT
        : TransactionDirection.CREDIT;
    const journal = await this.postJournal(
      {
        reference: `WALLET-${input.reference}-${input.direction}-${input.userId}`,
        transactionType: `WALLET_${input.type}`,
        description: input.description,
        serviceType: this.enumServiceType(input.metadata?.serviceType),
        serviceId: this.text(input.metadata?.serviceId),
        currency,
        metadata: { ...input.metadata, sourceReference: input.reference },
        lines: [
          {
            accountCode: `WALLET:${currency}:${input.userId}`,
            accountName: `User wallet ${input.userId}`,
            accountType: LedgerAccountType.LIABILITY,
            ownerType: 'USER',
            ownerId: input.userId,
            direction: walletDirection,
            amount: input.amount,
            memo: input.description,
          },
          {
            accountCode: `CLEARING:${currency}`,
            accountName: `${currency} settlement clearing`,
            accountType: LedgerAccountType.ASSET,
            ownerType: 'SYSTEM',
            direction: counterDirection,
            amount: input.amount,
            memo: input.description,
          },
        ],
      },
      manager,
    );

    if (
      input.direction === TransactionDirection.CREDIT &&
      [WalletTransactionType.EARNING, WalletTransactionType.TIP].includes(input.type)
    ) {
      const journalRecord = journal.journal;
      const earningsRepo = manager ? manager.getRepository(EarningsLedger) : this.earnings;
      const exists = await earningsRepo.findOne({
        where: { userId: input.userId, journalId: journalRecord.id },
      });
      if (!exists) {
        const platformFee = Number(input.metadata?.platformFee ?? 0);
        await earningsRepo.save(
          earningsRepo.create({
            userId: input.userId,
            driverId: this.text(input.metadata?.driverId),
            serviceType: this.enumServiceType(input.metadata?.serviceType),
            serviceId: this.text(input.metadata?.serviceId),
            journalId: journalRecord.id,
            grossAmount: Number(input.amount) + platformFee,
            platformFee,
            netAmount: Number(input.amount),
            tipAmount: input.type === WalletTransactionType.TIP ? Number(input.amount) : 0,
            currency,
          }),
        );
      }
    }
    return journal;
  }

  async reverse(reference: string, reason: string, actorUserId?: string) {
    const original = await this.journals.findOne({ where: { reference } });
    if (!original) throw new NotFoundException('Journal not found');
    if (original.status !== JournalStatus.POSTED) {
      throw new BadRequestException('Only posted journals can be reversed');
    }
    const entries = await this.entries.find({ where: { journalId: original.id } });
    const accounts = await this.accounts.find({
      where: entries.map((entry) => ({ id: entry.accountId })),
    });
    const reversal = await this.postJournal({
      reference: `REV-${reference}`,
      transactionType: `REVERSAL_${original.transactionType}`,
      description: reason,
      serviceType: original.serviceType,
      serviceId: original.serviceId,
      metadata: { originalJournalId: original.id, actorUserId },
      lines: entries.map((entry) => {
        const account = accounts.find((candidate) => candidate.id === entry.accountId);
        if (!account) throw new NotFoundException('Ledger account not found');
        return {
          accountCode: account.code,
          accountName: account.name,
          accountType: account.accountType,
          ownerType: account.ownerType,
          ownerId: account.ownerId,
          direction:
            entry.direction === TransactionDirection.DEBIT
              ? TransactionDirection.CREDIT
              : TransactionDirection.DEBIT,
          amount: Number(entry.amount),
          memo: reason,
        };
      }),
    });
    original.status = JournalStatus.REVERSED;
    original.reversedAt = new Date();
    original.metadata = { ...(original.metadata ?? {}), reversalReference: `REV-${reference}` };
    await this.journals.save(original);
    return reversal;
  }

  async detail(idOrReference: string) {
    const journal = await this.journals
      .createQueryBuilder('journal')
      .where('journal.id = :value', { value: idOrReference })
      .orWhere('journal.reference = :value', { value: idOrReference })
      .getOne();
    if (!journal) throw new NotFoundException('Journal not found');
    const entries = await this.entries.find({ where: { journalId: journal.id } });
    const accounts = entries.length
      ? await this.accounts.find({ where: entries.map((entry) => ({ id: entry.accountId })) })
      : [];
    return {
      journal,
      entries: entries.map((entry) => ({
        ...entry,
        account: accounts.find((account) => account.id === entry.accountId),
      })),
      totals: {
        debits: entries
          .filter((entry) => entry.direction === TransactionDirection.DEBIT)
          .reduce((sum, entry) => sum + Number(entry.amount), 0),
        credits: entries
          .filter((entry) => entry.direction === TransactionDirection.CREDIT)
          .reduce((sum, entry) => sum + Number(entry.amount), 0),
      },
    };
  }

  listJournals(limit = 100) {
    return this.journals.find({ order: { createdAt: 'DESC' }, take: Math.min(limit, 500) });
  }

  listAccounts(limit = 500) {
    return this.accounts.find({ order: { code: 'ASC' }, take: Math.min(limit, 2000) });
  }

  earningsForUser(userId: string, limit = 100) {
    return this.earnings.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 500),
    });
  }

  async trialBalance(currency = 'UGX') {
    const [accounts, entries] = await Promise.all([
      this.accounts.find({ where: { currency, active: true }, order: { code: 'ASC' } }),
      this.entries.find({ where: { currency } }),
    ]);
    const round = (value: number) => Math.round(value * 100) / 100;
    const totalDebits = round(
      entries
        .filter((entry) => entry.direction === TransactionDirection.DEBIT)
        .reduce((sum, entry) => sum + Number(entry.amount), 0),
    );
    const totalCredits = round(
      entries
        .filter((entry) => entry.direction === TransactionDirection.CREDIT)
        .reduce((sum, entry) => sum + Number(entry.amount), 0),
    );
    const groups = Object.values(LedgerAccountType).map((type) => ({
      accountType: type,
      balance: round(
        accounts
          .filter((account) => account.accountType === type)
          .reduce((sum, account) => sum + Number(account.balance), 0),
      ),
    }));
    return {
      currency,
      generatedAt: new Date(),
      balanced: totalDebits === totalCredits,
      totals: { debits: totalDebits, credits: totalCredits, difference: round(totalDebits - totalCredits) },
      groups,
      accounts,
    };
  }

  private async ensureAccount(
    manager: EntityManager,
    input: {
      code: string;
      name: string;
      accountType: LedgerAccountType;
      ownerType?: string;
      ownerId?: string;
      currency: string;
    },
  ) {
    let account = await manager.findOne(LedgerAccount, { where: { code: input.code } });
    if (!account) {
      account = await manager.save(
        LedgerAccount,
        manager.create(LedgerAccount, {
          ...input,
          ownerType: input.ownerType ?? 'SYSTEM',
          balance: 0,
          active: true,
        }),
      );
    }
    return account;
  }

  private balanceEffect(
    accountType: LedgerAccountType,
    direction: TransactionDirection,
    amount: number,
  ): number {
    const debitNormal = [LedgerAccountType.ASSET, LedgerAccountType.EXPENSE].includes(accountType);
    const increases = debitNormal
      ? direction === TransactionDirection.DEBIT
      : direction === TransactionDirection.CREDIT;
    return increases ? amount : -amount;
  }

  private enumServiceType(value: unknown): ServiceType | undefined {
    return typeof value === 'string' && Object.values(ServiceType).includes(value as ServiceType)
      ? (value as ServiceType)
      : undefined;
  }

  private text(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
