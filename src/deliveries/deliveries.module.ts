import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { MatchingModule } from '../matching/matching.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PricingModule } from '../pricing/pricing.module';
import { WalletsModule } from '../wallets/wallets.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveryRoutesController } from './delivery-routes.controller';
import { DeliveryRoutesService } from './delivery-routes.service';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [DriversModule, MatchingModule, PricingModule, NotificationsModule, PaymentsModule, WalletsModule],
  controllers: [DeliveriesController, DeliveryRoutesController],
  providers: [DeliveriesService, DeliveryRoutesService],
  exports: [DeliveriesService, DeliveryRoutesService],
})
export class DeliveriesModule {}
