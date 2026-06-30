import { Module } from '@nestjs/common';
import { GeolocationController } from './geolocation.controller';
import { DriverLocatorService } from './driver-locator.service';
import { GeolocationService } from './geolocation.service';
import { PostgisStatusService } from './postgis-status.service';

@Module({
  controllers: [GeolocationController],
  providers: [GeolocationService, DriverLocatorService, PostgisStatusService],
  exports: [GeolocationService, DriverLocatorService, PostgisStatusService],
})
export class GeolocationModule {}
