import { Module } from '@nestjs/common';
import { AmbulanceModule } from '../ambulance/ambulance.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DriversModule } from '../drivers/drivers.module';
import { MatchingModule } from '../matching/matching.module';
import { RidesModule } from '../rides/rides.module';
import { TouristModule } from '../tourist/tourist.module';
import { DriverJobsController } from './driver-jobs.controller';
import { DriverJobsService } from './driver-jobs.service';

@Module({
  imports: [DriversModule, MatchingModule, RidesModule, DeliveriesModule, TouristModule, AmbulanceModule],
  controllers: [DriverJobsController],
  providers: [DriverJobsService],
  exports: [DriverJobsService],
})
export class DriverJobsModule {}
