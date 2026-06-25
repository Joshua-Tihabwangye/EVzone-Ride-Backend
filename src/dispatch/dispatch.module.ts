import { Module } from '@nestjs/common';
import { AmbulanceModule } from '../ambulance/ambulance.module';
import { CorporatePayModule } from '../corporate-pay/corporate-pay.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RentalsModule } from '../rentals/rentals.module';
import { RidesModule } from '../rides/rides.module';
import { TouristModule } from '../tourist/tourist.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [
    OrganizationsModule,
    RidesModule,
    DeliveriesModule,
    TouristModule,
    AmbulanceModule,
    RentalsModule,
    CorporatePayModule,
    NotificationsModule,
  ],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
