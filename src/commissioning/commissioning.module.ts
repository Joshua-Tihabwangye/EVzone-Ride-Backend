import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CommissionRule } from './commission-rule.entity';
import { CommissioningController } from './commissioning.controller';
import { CommissioningService } from './commissioning.service';

@Module({
  imports: [TypeOrmModule.forFeature([CommissionRule]), WalletsModule, AccountingModule],
  controllers: [CommissioningController],
  providers: [CommissioningService],
  exports: [CommissioningService],
})
export class CommissioningModule {}
