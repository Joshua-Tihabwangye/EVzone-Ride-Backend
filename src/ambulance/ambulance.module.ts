import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PricingModule } from '../pricing/pricing.module';
import { AmbulanceController } from './ambulance.controller';
import { AmbulanceService } from './ambulance.service';

@Module({
  imports: [DriversModule, PricingModule, NotificationsModule, PaymentsModule],
  controllers: [AmbulanceController],
  providers: [AmbulanceService],
  exports: [AmbulanceService],
})
export class AmbulanceModule {}
