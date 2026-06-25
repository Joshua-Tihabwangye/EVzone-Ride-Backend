import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { CashoutsController } from './cashouts.controller';
import { FinancialOperationsService } from './financial-operations.service';
import { PaymentMethodsController } from './payment-methods.controller';

@Module({
  imports: [WalletsModule],
  controllers: [PaymentMethodsController, CashoutsController],
  providers: [FinancialOperationsService],
  exports: [FinancialOperationsService],
})
export class FinancialOperationsModule {}
