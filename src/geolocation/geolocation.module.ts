import { Module } from '@nestjs/common';
import { GeolocationController } from './geolocation.controller';
import { DriverLocatorService } from './driver-locator.service';
import { GeolocationService } from './geolocation.service';
import { PostgisBootstrapService } from './postgis-bootstrap.service';

@Module({
  controllers: [GeolocationController],
  providers: [GeolocationService, DriverLocatorService, PostgisBootstrapService],
  exports: [GeolocationService, DriverLocatorService, PostgisBootstrapService],
})
export class GeolocationModule {}
