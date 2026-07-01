import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EarningsLedger,
  JournalTransaction,
  LedgerAccount,
  LedgerAccountPeriodBalance,
  LedgerEntry,
} from '../database/entities';
import { AccountingController } from './accounting.controller';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingService } from './accounting.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([
      LedgerAccount,
      LedgerAccountPeriodBalance,
      JournalTransaction,
      LedgerEntry,
      EarningsLedger,
    ]),
  ],
  controllers: [AccountingController],
  providers: [AccountingService, ChartOfAccountsService, AccountingPeriodService],
  exports: [AccountingService, ChartOfAccountsService, AccountingPeriodService],
})
export class AccountingModule {}
