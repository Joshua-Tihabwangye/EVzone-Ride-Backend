import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, MoreThanOrEqual, Repository } from 'typeorm';
import { TransactionDirection } from '../common/enums';
import { LedgerAccountPeriodBalance, LedgerEntry } from '../database/entities';

@Injectable()
export class AccountingPeriodService {
  constructor(
    @InjectRepository(LedgerAccountPeriodBalance)
    private readonly balances: Repository<LedgerAccountPeriodBalance>,
    private readonly dataSource: DataSource,
  ) {}

  async closePeriod(
    year: number,
    month: number,
    closedByUserId?: string,
  ): Promise<LedgerAccountPeriodBalance[]> {
    if (month < 1 || month > 12) throw new BadRequestException('Month must be between 1 and 12');

    return this.dataSource.transaction(async (manager) => {
      const balanceRepo = manager.getRepository(LedgerAccountPeriodBalance);
      const existing = await balanceRepo.find({ where: { year, month } });
      const alreadyClosed = existing.filter((b) => b.status === 'CLOSED');
      if (alreadyClosed.length) {
        throw new BadRequestException(`Period ${year}-${month} is already closed`);
      }

      const entries = await this.entriesForPeriod(manager, year, month);
      const byAccount = new Map<string, { debits: number; credits: number; balance: number }>();

      for (const entry of entries) {
        const agg = byAccount.get(entry.accountId) ?? { debits: 0, credits: 0, balance: 0 };
        const amount = Number(entry.amount);
        if (entry.direction === TransactionDirection.DEBIT) {
          agg.debits += amount;
          agg.balance += amount;
        } else {
          agg.credits += amount;
          agg.balance -= amount;
        }
        byAccount.set(entry.accountId, agg);
      }

      const results: LedgerAccountPeriodBalance[] = [];
      for (const [accountId, agg] of byAccount.entries()) {
        const record = balanceRepo.create({
          accountId,
          year,
          month,
          status: 'CLOSED',
          openingBalance: 0,
          closingBalance: Math.round(agg.balance * 100) / 100,
          totalDebits: Math.round(agg.debits * 100) / 100,
          totalCredits: Math.round(agg.credits * 100) / 100,
          closedAt: new Date(),
          closedByUserId,
        });
        results.push(await balanceRepo.save(record));
      }

      if (results.length === 0) {
        const clearing = await manager
          .getRepository('LedgerAccount')
          .findOne({ where: { code: 'CLEARING:UGX' } });
        if (clearing) {
          results.push(
            await balanceRepo.save(
              balanceRepo.create({
                accountId: (clearing as { id: string }).id,
                year,
                month,
                status: 'CLOSED',
                openingBalance: 0,
                closingBalance: 0,
                totalDebits: 0,
                totalCredits: 0,
                closedAt: new Date(),
                closedByUserId,
              }),
            ),
          );
        }
      }

      return results;
    });
  }

  private async entriesForPeriod(
    manager: EntityManager,
    year: number,
    month: number,
  ): Promise<LedgerEntry[]> {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const entries = await manager.getRepository(LedgerEntry).find({
      where: {
        createdAt: MoreThanOrEqual(start),
      },
      order: { createdAt: 'ASC' },
    });
    return entries.filter((entry) => entry.createdAt < end);
  }

  async reopenPeriod(year: number, month: number): Promise<void> {
    await this.balances
      .createQueryBuilder()
      .update()
      .set({ status: 'OPEN', closedAt: () => 'NULL', closedByUserId: () => 'NULL' })
      .where('year = :year AND month = :month AND status = :status', {
        year,
        month,
        status: 'CLOSED',
      })
      .execute();
  }

  async isPeriodClosed(year: number, month: number, manager?: EntityManager): Promise<boolean> {
    const repo = manager ? manager.getRepository(LedgerAccountPeriodBalance) : this.balances;
    const closed = await repo.findOne({ where: { year, month, status: 'CLOSED' } });
    return !!closed;
  }

  async assertPeriodOpen(date: Date, manager?: EntityManager): Promise<void> {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const closed = await this.isPeriodClosed(year, month, manager);
    if (closed) {
      throw new BadRequestException(`Accounting period ${year}-${String(month).padStart(2, '0')} is closed`);
    }
  }
}
