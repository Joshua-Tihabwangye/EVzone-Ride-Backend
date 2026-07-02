import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { AccountingModule } from '../accounting/accounting.module';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [ObservabilityModule, AccountingModule],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
