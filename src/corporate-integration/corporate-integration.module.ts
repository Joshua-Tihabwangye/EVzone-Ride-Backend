import { Module } from '@nestjs/common';
import { AmbulanceModule } from '../ambulance/ambulance.module';
import { CorporatePayModule } from '../corporate-pay/corporate-pay.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { HealthModule } from '../health/health.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { RentalsModule } from '../rentals/rentals.module';
import { RidesModule } from '../rides/rides.module';
import { TouristModule } from '../tourist/tourist.module';
import { CorporateIntegrationController } from './corporate-integration.controller';
import { CorporateIntegrationService } from './corporate-integration.service';
import { CorporatePayPartnerGuard } from './corporate-partner.guard';

@Module({
  imports: [
    DispatchModule,
    CorporatePayModule,
    RidesModule,
    DeliveriesModule,
    TouristModule,
    AmbulanceModule,
    RentalsModule,
  ],
  controllers: [CorporateIntegrationController],
  providers: [CorporateIntegrationService, CorporatePayPartnerGuard],
  exports: [CorporateIntegrationService],
})
export class CorporateIntegrationModule {}
