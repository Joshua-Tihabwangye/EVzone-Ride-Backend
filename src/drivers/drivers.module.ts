import { Module } from '@nestjs/common';
import { GeolocationModule } from '../geolocation/geolocation.module';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [GeolocationModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
