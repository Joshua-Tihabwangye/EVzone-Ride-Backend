import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CorporatePayTransaction } from '../database/entities';
import { ReconciliationRecord } from './entities/reconciliation-record.entity';
import { ReconciliationRun } from './entities/reconciliation-run.entity';
import { PaymentsModule } from '../payments/payments.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { FlutterwaveSettlementAdapter } from './adapters/flutterwave-settlement.adapter';
import { ManualSettlementUploadService } from './adapters/manual-settlement-upload.service';
import { SettlementAdapterFactory } from './adapters/settlement-adapter.factory';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationScheduler } from './workers/reconciliation.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReconciliationRun, ReconciliationRecord, CorporatePayTransaction]),
    PaymentsModule,
    PayoutsModule,
  ],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    FlutterwaveSettlementAdapter,
    ManualSettlementUploadService,
    SettlementAdapterFactory,
    ReconciliationScheduler,
  ],
  exports: [ReconciliationService, SettlementAdapterFactory],
})
export class ReconciliationModule {}
