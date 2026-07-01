import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AccountingModule } from '../src/accounting/accounting.module';
import { AccountingPeriodService } from '../src/accounting/accounting-period.service';
import { AccountingService } from '../src/accounting/accounting.service';
import { LedgerAccountType, TransactionDirection } from '../src/common/enums';
import { DatabaseModule } from '../src/database/database.module';
import { ENTITIES } from '../src/database/entities';

describe('Accounting Integrity', () => {
  let moduleRef: TestingModule;
  let service: AccountingService;
  let periodService: AccountingPeriodService;
  let dataSource: DataSource;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        TypeOrmModule.forRoot({
          type: 'sqljs',
          entities: [...ENTITIES],
          synchronize: true,
          logging: false,
        }),
        AccountingModule,
      ],
    }).compile();

    service = moduleRef.get(AccountingService);
    periodService = moduleRef.get(AccountingPeriodService);
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM ledger_entries');
    await dataSource.query('DELETE FROM journal_transactions');
    await dataSource.query("DELETE FROM ledger_accounts WHERE code LIKE 'WALLET:%'");
    await dataSource.query('DELETE FROM ledger_account_period_balances');
    await dataSource.query('DELETE FROM earnings_ledger');
  });

  it('should reject unknown account codes', async () => {
    await expect(
      service.postJournal({
        reference: 'TEST-001',
        transactionType: 'TEST',
        currency: 'UGX',
        lines: [
          {
            accountCode: 'UNKNOWN:UGX',
            accountName: 'Unknown',
            accountType: LedgerAccountType.ASSET,
            direction: TransactionDirection.DEBIT,
            amount: 100,
          },
          {
            accountCode: 'CLEARING:UGX',
            accountName: 'Clearing',
            accountType: LedgerAccountType.ASSET,
            direction: TransactionDirection.CREDIT,
            amount: 100,
          },
        ],
      }),
    ).rejects.toThrow(/Chart of Accounts/);
  });

  it('should reject unbalanced journals', async () => {
    await expect(
      service.postJournal({
        reference: 'TEST-002',
        transactionType: 'TEST',
        currency: 'UGX',
        lines: [
          {
            accountCode: 'CLEARING:UGX',
            accountName: 'Clearing',
            accountType: LedgerAccountType.ASSET,
            direction: TransactionDirection.DEBIT,
            amount: 100,
          },
          {
            accountCode: 'CLEARING:UGX',
            accountName: 'Clearing',
            accountType: LedgerAccountType.ASSET,
            direction: TransactionDirection.CREDIT,
            amount: 50,
          },
        ],
      }),
    ).rejects.toThrow(/not balanced/);
  });

  it('should reject duplicate references', async () => {
    const dto = {
      reference: 'TEST-003',
      transactionType: 'TEST',
      currency: 'UGX',
      lines: [
        {
          accountCode: 'WALLET:UGX:user-a',
          accountName: 'Wallet',
          accountType: LedgerAccountType.LIABILITY,
          direction: TransactionDirection.DEBIT,
          amount: 100,
        },
        {
          accountCode: 'CLEARING:UGX',
          accountName: 'Clearing',
          accountType: LedgerAccountType.ASSET,
          direction: TransactionDirection.CREDIT,
          amount: 100,
        },
      ],
    };

    await service.postJournal(dto);
    await expect(service.postJournal(dto)).rejects.toThrow();
  });

  it('should create a reversal and leave original immutable', async () => {
    const reference = 'TEST-004';
    await service.postJournal({
      reference,
      transactionType: 'TEST',
      currency: 'UGX',
      lines: [
        {
          accountCode: 'WALLET:UGX:user-b',
          accountName: 'Wallet',
          accountType: LedgerAccountType.LIABILITY,
          direction: TransactionDirection.DEBIT,
          amount: 200,
        },
        {
          accountCode: 'CLEARING:UGX',
          accountName: 'Clearing',
          accountType: LedgerAccountType.ASSET,
          direction: TransactionDirection.CREDIT,
          amount: 200,
        },
      ],
    });

    const reversal = await service.reverse(reference, 'Correction');
    expect(reversal.journal.transactionType).toContain('REVERSAL');

    const original = await dataSource.getRepository('JournalTransaction').findOne({ where: { reference } });
    expect(original).not.toBeNull();
    expect(original!.status).toBe('REVERSED');
  });

  it('should block new journals in a closed period', async () => {
    const now = new Date();
    const closed = await periodService.closePeriod(now.getUTCFullYear(), now.getUTCMonth() + 1);
    expect(closed.length).toBeGreaterThan(0);
    const isClosed = await periodService.isPeriodClosed(now.getUTCFullYear(), now.getUTCMonth() + 1);
    expect(isClosed).toBe(true);

    await expect(
      service.postJournal({
        reference: 'TEST-005',
        transactionType: 'TEST',
        currency: 'UGX',
        lines: [
          {
            accountCode: 'WALLET:UGX:user-c',
            accountName: 'Wallet',
            accountType: LedgerAccountType.LIABILITY,
            direction: TransactionDirection.DEBIT,
            amount: 50,
          },
          {
            accountCode: 'CLEARING:UGX',
            accountName: 'Clearing',
            accountType: LedgerAccountType.ASSET,
            direction: TransactionDirection.CREDIT,
            amount: 50,
          },
        ],
      }),
    ).rejects.toThrow(/closed/);
  });
});
