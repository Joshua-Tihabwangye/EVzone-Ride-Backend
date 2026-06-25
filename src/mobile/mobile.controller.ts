import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthUser } from '../common/interfaces';
import { RegisterDeviceTokenDto } from '../notifications/notifications.dto';
import { MobileService } from './mobile.service';

@ApiTags('Mobile App Contracts')
@ApiBearerAuth()
@Controller('mobile/v1')
export class MobileController {
  constructor(private readonly service: MobileService) {}

  @Public()
  @Get('capabilities')
  capabilities(@Headers('x-app-platform') platform?: string, @Headers('x-app-version') appVersion?: string) {
    return this.service.capabilities(platform, appVersion);
  }

  @Public()
  @Get('config')
  config() {
    return this.service.publicConfig();
  }

  @Get('bootstrap')
  bootstrap(
    @CurrentUser() user: AuthUser,
    @Headers('x-app-platform') platform?: string,
    @Headers('x-app-version') appVersion?: string,
  ) {
    return this.service.bootstrap(user, platform, appVersion);
  }

  @Post('devices')
  registerDevice(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceTokenDto) {
    return this.service.registerDevice(user.id, dto);
  }

  @Get('devices')
  devices(@CurrentUser() user: AuthUser) {
    return this.service.devices(user.id);
  }

  @Delete('devices/:id')
  removeDevice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeDevice(user.id, id);
  }
}
