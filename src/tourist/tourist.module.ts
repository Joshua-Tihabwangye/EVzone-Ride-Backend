import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PricingModule } from '../pricing/pricing.module';
import { TouristController } from './tourist.controller';
import { TouristService } from './tourist.service';

@Module({
  imports: [DriversModule, PricingModule, NotificationsModule, PaymentsModule],
  controllers: [TouristController],
  providers: [TouristService],
  exports: [TouristService],
})
export class TouristModule {}
