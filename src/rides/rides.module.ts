import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { HealthModule } from '../health/health.module';
import { MatchingModule } from '../matching/matching.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PricingModule } from '../pricing/pricing.module';
import { WalletsModule } from '../wallets/wallets.module';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';

@Module({
  imports: [DriversModule, MatchingModule, PricingModule, NotificationsModule, PaymentsModule, WalletsModule],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
