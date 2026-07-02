import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObservabilityModule } from '../observability/observability.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CashoutRequest, Payout, Wallet, WalletTransaction } from '../database/entities';
import { WalletsModule } from '../wallets/wallets.module';
import { PayoutOrchestratorService } from './payout-orchestrator.service';
import { PayoutsController } from './payouts.controller';
import { PayoutStatusService } from './payout-status.service';
import { FlutterwavePayoutProvider } from './providers/flutterwave-payout.provider';
import { MockPayoutProvider } from './providers/mock-payout.provider';
import { PayoutProviderFactory } from './providers/payout-provider.factory';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payout, CashoutRequest, Wallet, WalletTransaction]),
    ObservabilityModule,
    AccountingModule,
    WalletsModule,
  ],
  controllers: [PayoutsController],
  providers: [
    PayoutOrchestratorService,
    PayoutStatusService,
    MockPayoutProvider,
    FlutterwavePayoutProvider,
    PayoutProviderFactory,
  ],
  exports: [PayoutOrchestratorService, PayoutStatusService, PayoutProviderFactory],
})
export class PayoutsModule {}
