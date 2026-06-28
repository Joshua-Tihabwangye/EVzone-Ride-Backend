import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { DriverLocationDto } from '../drivers/drivers.dto';
import { DriversService } from '../drivers/drivers.service';
import { CompatDriverLocationHeartbeatDto } from './compatibility.dto';

@ApiTags('Driver Compatibility API')
@ApiBearerAuth()
@Controller('locations')
@Roles(UserRole.DRIVER, UserRole.ADMIN)
export class LocationCompatibilityController {
  constructor(private readonly drivers: DriversService) {}

  @Post('heartbeat')
  heartbeat(@CurrentUser() user: AuthUser, @Body() dto: CompatDriverLocationHeartbeatDto) {
    const location: DriverLocationDto = {
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracyMeters: dto.accuracyMeters ?? dto.accuracy,
      speedKph: dto.speedKph ?? dto.speed,
      heading: dto.heading,
      serviceType: dto.serviceType,
      serviceId: dto.serviceId,
    };

    return this.drivers.updateLocation(user.id, location);
  }
}
