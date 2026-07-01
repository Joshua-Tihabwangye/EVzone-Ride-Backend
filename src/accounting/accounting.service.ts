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
import {
  EarningsLedger,
  JournalTransaction,
  LedgerAccount,
  LedgerAccountPeriodBalance,
  LedgerEntry,
} from '../database/entities';
import { AccountingPeriodService } from './accounting-period.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { isWalletAccountCode, parseWalletAccountCode } from './chart-of-accounts';
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
    private readonly chartOfAccounts: ChartOfAccountsService,
    private readonly periodService: AccountingPeriodService,
  ) {}

<<<<<<< HEAD
  async postJournal(input: PostJournalDto, managerOverride?: EntityManager) {
=======
  async postJournal(input: PostJournalDto, manager?: EntityManager) {
>>>>>>> origin/main
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

<<<<<<< HEAD
    const executor = async (manager: EntityManager) => {
      await this.periodService.assertPeriodOpen(new Date(), manager);

      let journal = await manager.save(
=======
    const execute = async (txManager: EntityManager) => {
      const duplicate = await txManager.findOne(JournalTransaction, {
        where: { reference: input.reference },
      });
      if (duplicate) return duplicate;
      let journal = await txManager.save(
>>>>>>> origin/main
        JournalTransaction,
        txManager.create(JournalTransaction, {
          reference: input.reference,
          transactionType: input.transactionType,
          description: input.description,
          serviceType: input.serviceType,
          serviceId: input.serviceId,
          metadata: input.metadata,
          status: JournalStatus.PENDING,
          organizationId: input.organizationId,
        }),
      );

      for (const line of input.lines) {
<<<<<<< HEAD
        await this.validateAccountCode(line.accountCode, currency);
        const account = await this.ensureAccount(manager, {
=======
        const account = await this.ensureAccount(txManager, {
>>>>>>> origin/main
          code: line.accountCode,
          name: line.accountName,
          accountType: line.accountType,
          accountCategory: line.accountCategory,
          ownerType: line.ownerType,
          ownerId: line.ownerId,
          organizationId: line.organizationId ?? input.organizationId,
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

<<<<<<< HEAD
    const journal = managerOverride
      ? await executor(managerOverride)
      : await this.dataSource.transaction(executor);

    this.events.emit('domain.event', {
      topic: 'accounting',
      eventType: 'accounting.journal.posted',
      aggregateType: 'JournalTransaction',
      aggregateId: journal.id,
      eventKey: journal.reference,
      payload: {
        journalId: journal.id,
        reference: journal.reference,
        transactionType: journal.transactionType,
        serviceType: journal.serviceType,
        serviceId: journal.serviceId,
        debits,
        credits,
      },
    });
    return this.detail(journal.id, managerOverride);
  }

  async postWalletMovement(input: {
    userId: string;
    amount: number;
    direction: TransactionDirection;
    type: WalletTransactionType;
    reference: string;
    currency?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    organizationId?: string;
  }) {
=======
    let result: JournalTransaction;
    if (manager) {
      result = await execute(manager);
      return this.detail(result.id, manager);
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
>>>>>>> origin/main
    const currency = input.currency ?? 'UGX';
    const walletDirection = input.direction;
    const counterDirection =
      walletDirection === TransactionDirection.CREDIT
        ? TransactionDirection.DEBIT
        : TransactionDirection.CREDIT;
<<<<<<< HEAD
=======
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
>>>>>>> origin/main

    const journalReference = `WALLET-${input.reference}-${input.direction}-${input.userId}`;
    const existingJournal = await this.journals.findOne({ where: { reference: journalReference } });
    if (existingJournal) {
      return this.detail(existingJournal.id);
    }

    const journalResult = await this.postJournal(
      {
        reference: journalReference,
        transactionType: `WALLET_${input.type}`,
        description: input.description,
        serviceType: this.enumServiceType(input.metadata?.serviceType),
        serviceId: this.text(input.metadata?.serviceId),
        currency,
        organizationId: input.organizationId,
        metadata: { ...input.metadata, sourceReference: input.reference },
        lines: [
          {
            accountCode: `WALLET:${currency}:${input.userId}`,
            accountName: `User wallet ${input.userId}`,
            accountType: LedgerAccountType.LIABILITY,
            accountCategory: 'LIABILITY',
            ownerType: 'USER',
            ownerId: input.userId,
            organizationId: input.organizationId,
            direction: walletDirection,
            amount: input.amount,
            memo: input.description,
          },
          {
            accountCode: `CLEARING:${currency}`,
            accountName: `${currency} settlement clearing`,
            accountType: LedgerAccountType.ASSET,
            accountCategory: 'ASSET',
            ownerType: 'SYSTEM',
            direction: counterDirection,
            amount: input.amount,
            memo: input.description,
          },
        ],
      },
      undefined,
    );

    const journalRecord = journalResult.journal;
    if (
      input.direction === TransactionDirection.CREDIT &&
      [WalletTransactionType.EARNING, WalletTransactionType.TIP].includes(input.type)
    ) {
<<<<<<< HEAD
      const exists = await this.earnings.findOne({
=======
      const journalRecord = journal.journal;
      const earningsRepo = manager ? manager.getRepository(EarningsLedger) : this.earnings;
      const exists = await earningsRepo.findOne({
>>>>>>> origin/main
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
    return journalResult;
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
      currency: original.currency,
      organizationId: original.organizationId,
      metadata: { originalJournalId: original.id, actorUserId },
      lines: entries.map((entry) => {
        const account = accounts.find((candidate) => candidate.id === entry.accountId);
        if (!account) throw new NotFoundException('Ledger account not found');
        return {
          accountCode: account.code,
          accountName: account.name,
          accountType: account.accountType,
          accountCategory: account.accountCategory,
          ownerType: account.ownerType,
          ownerId: account.ownerId,
          organizationId: account.organizationId,
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

  async detail(idOrReference: string, manager?: EntityManager) {
<<<<<<< HEAD
    const journalRepo = manager ? manager.getRepository(JournalTransaction) : this.journals;
    const journal = await journalRepo
      .createQueryBuilder('journal')
      .where('journal.id = :value', { value: idOrReference })
      .orWhere('journal.reference = :value', { value: idOrReference })
      .getOne();
    if (!journal) throw new NotFoundException('Journal not found');
    const entriesRepo = manager ? manager.getRepository(LedgerEntry) : this.entries;
=======
    const journalsRepo = manager ? manager.getRepository(JournalTransaction) : this.journals;
    const entriesRepo = manager ? manager.getRepository(LedgerEntry) : this.entries;
    const accountsRepo = manager ? manager.getRepository(LedgerAccount) : this.accounts;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrReference);
    const journal = isUuid
      ? await journalsRepo.findOne({ where: { id: idOrReference } })
      : await journalsRepo.findOne({ where: { reference: idOrReference } });
    if (!journal) throw new NotFoundException('Journal not found');
>>>>>>> origin/main
    const entries = await entriesRepo.find({ where: { journalId: journal.id } });
    const accounts = entries.length
      ? await accountsRepo.find({ where: entries.map((entry) => ({ id: entry.accountId })) })
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

  async trialBalance(currency = 'UGX', year?: number, month?: number) {
    if (year && month) {
      return this.trialBalanceFromPeriod(currency, year, month);
    }
    return this.trialBalanceFull(currency);
  }

  private async trialBalanceFull(currency = 'UGX') {
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
      type,
      accounts: accounts
        .filter((account) => account.accountType === type)
        .map((account) => ({
          ...account,
          balance: round(Number(account.balance)),
        })),
      balance: round(
        accounts
          .filter((account) => account.accountType === type)
          .reduce((sum, account) => sum + Number(account.balance), 0),
      ),
    }));
    return { currency, totalDebits, totalCredits, balanced: totalDebits === totalCredits, groups };
  }

  private async trialBalanceFromPeriod(currency: string, year: number, month: number) {
    const balances = await this.dataSource
      .getRepository(LedgerAccountPeriodBalance)
      .find({ where: { year, month } });
    const accountIds = balances.map((b) => b.accountId);
    const accounts = accountIds.length
      ? await this.accounts.find({ where: accountIds.map((id) => ({ id })) })
      : [];
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const round = (value: number) => Math.round(value * 100) / 100;

    const filteredAccounts = accounts.filter((a) => a.currency === currency);
    const groups = Object.values(LedgerAccountType).map((type) => ({
      type,
      accounts: filteredAccounts.filter((account) => account.accountType === type),
      balance: round(
        balances
          .filter((b) => accountById.get(b.accountId)?.accountType === type)
          .reduce((sum, b) => sum + Number(b.closingBalance), 0),
      ),
    }));
    const totalDebits = round(balances.reduce((sum, b) => sum + Number(b.totalDebits), 0));
    const totalCredits = round(balances.reduce((sum, b) => sum + Number(b.totalCredits), 0));
    return {
      currency,
      year,
      month,
      totalDebits,
      totalCredits,
      balanced: totalDebits === totalCredits,
      groups,
    };
  }

  private async validateAccountCode(code: string, currency: string) {
    if (isWalletAccountCode(code)) {
      const parsed = parseWalletAccountCode(code);
      if (!parsed || parsed.currency !== currency) {
        throw new BadRequestException(`Invalid wallet account code ${code}`);
      }
      return;
    }
    if (!this.chartOfAccounts.isKnownAccountCode(code)) {
      throw new BadRequestException(`Account code ${code} is not in the Chart of Accounts`);
    }
  }

  private async ensureAccount(
    manager: EntityManager,
    input: {
      code: string;
      name: string;
      accountType: LedgerAccountType;
      accountCategory?: string;
      ownerType?: string;
      ownerId?: string;
      organizationId?: string;
      currency: string;
    },
  ): Promise<LedgerAccount> {
    let account = await manager.findOne(LedgerAccount, { where: { code: input.code } });
    if (!account) {
      account = manager.create(LedgerAccount, {
        code: input.code,
        name: input.name,
        accountType: input.accountType,
        accountCategory: input.accountCategory ?? this.inferCategory(input.accountType),
        ownerType: input.ownerType ?? 'SYSTEM',
        ownerId: input.ownerId,
        organizationId: input.organizationId,
        currency: input.currency,
        balance: 0,
        active: true,
      });
      account = await manager.save(LedgerAccount, account);
    }
    return account;
  }

  private inferCategory(accountType: LedgerAccountType): string {
    switch (accountType) {
      case LedgerAccountType.ASSET:
        return 'ASSET';
      case LedgerAccountType.LIABILITY:
        return 'LIABILITY';
      case LedgerAccountType.EQUITY:
        return 'EQUITY';
      case LedgerAccountType.REVENUE:
        return 'REVENUE';
      case LedgerAccountType.EXPENSE:
        return 'EXPENSE';
      default:
        return 'ASSET';
    }
  }

  private balanceEffect(
    accountType: LedgerAccountType,
    direction: TransactionDirection,
    amount: number,
  ): number {
    const isDebit = direction === TransactionDirection.DEBIT;
    switch (accountType) {
      case LedgerAccountType.ASSET:
      case LedgerAccountType.EXPENSE:
        return isDebit ? amount : -amount;
      case LedgerAccountType.LIABILITY:
      case LedgerAccountType.REVENUE:
      case LedgerAccountType.EQUITY:
        return isDebit ? -amount : amount;
      default:
        return isDebit ? amount : -amount;
    }
  }

  private enumServiceType(value: unknown): ServiceType | undefined {
    if (typeof value !== 'string') return undefined;
    return Object.values(ServiceType).includes(value as ServiceType) ? (value as ServiceType) : undefined;
  }

  private text(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
