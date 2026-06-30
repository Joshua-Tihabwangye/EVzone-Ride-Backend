import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { GeofenceCheckDto, PlaceSearchDto, ReverseGeocodeDto, RouteEstimateDto } from './geolocation.dto';
import { DriverLocatorService } from './driver-locator.service';
import { GeolocationService } from './geolocation.service';
import { PostgisStatusService } from './postgis-status.service';

@ApiTags('Geolocation')
@Controller('geo')
export class GeolocationController {
  constructor(
    private readonly service: GeolocationService,
    private readonly locator: DriverLocatorService,
    private readonly postgis: PostgisStatusService,
  ) {}

  @Get('infrastructure/status')
  infrastructureStatus() {
    return { locator: this.locator.status(), postgis: this.postgis.status() };
  }

  @Public()
  @Get('places')
  search(@Query() query: PlaceSearchDto) {
    return this.service.searchPlaces(query);
  }

  @Public()
  @Get('reverse')
  reverse(@Query() query: ReverseGeocodeDto) {
    return this.service.reverseGeocode(query);
  }

  @Public()
  @Post('route')
  route(@Body() dto: RouteEstimateDto) {
    return this.service.estimateRoute(dto);
  }

  @Public()
  @Post('geofence/check')
  geofence(@Body() dto: GeofenceCheckDto) {
    return { inside: this.service.pointInPolygon(dto.point, dto.polygon) };
  }
}
