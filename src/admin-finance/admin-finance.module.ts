import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import {
  CashoutRequest,
  DriverProfile,
  EarningsLedger,
  FinanceSettlementBatch,
  JournalTransaction,
  Payment,
  Payout,
  Wallet,
  WalletReconciliationReport,
  WalletTransaction,
} from '../database/entities';
import { FinancialOperationsModule } from '../financial-operations/financial-operations.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PaymentsModule } from '../payments/payments.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashoutRequest,
      DriverProfile,
      EarningsLedger,
      FinanceSettlementBatch,
      JournalTransaction,
      Payment,
      Payout,
      Wallet,
      WalletReconciliationReport,
      WalletTransaction,
    ]),
    ObservabilityModule,
    AuditModule,
    FinancialOperationsModule,
    PayoutsModule,
    PaymentsModule,
    AccountingModule,
  ],
  controllers: [AdminFinanceController],
  providers: [AdminFinanceService],
  exports: [AdminFinanceService],
})
export class AdminFinanceModule {}
