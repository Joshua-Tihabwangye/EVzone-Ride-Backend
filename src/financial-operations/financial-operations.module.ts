import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { AuditModule } from '../audit/audit.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CashoutsController } from './cashouts.controller';
import { FinancialOperationsService } from './financial-operations.service';
import { PaymentMethodsController } from './payment-methods.controller';

@Module({
  imports: [ObservabilityModule, WalletsModule, PayoutsModule, AuditModule],
  controllers: [PaymentMethodsController, CashoutsController],
  providers: [FinancialOperationsService],
  exports: [FinancialOperationsService],
})
export class FinancialOperationsModule {}
