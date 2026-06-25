import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AmbulanceActionDto,
  AmbulanceEstimateDto,
  CreateAmbulanceRequestDto,
  DispatchAmbulanceDto,
} from './ambulance.dto';
import { AmbulanceService } from './ambulance.service';

@ApiTags('Ambulance')
@ApiBearerAuth()
@Controller('ambulance')
export class AmbulanceController {
  constructor(private readonly service: AmbulanceService) {}

  @Public()
  @Get('facilities')
  facilities() {
    return this.service.listFacilities();
  }

  @Public()
  @Get('facilities/nearest')
  nearest(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('limit') limit = '10',
  ) {
    return this.service.nearestFacilities(Number(latitude), Number(longitude), Number(limit));
  }

  @Post('estimate')
  estimate(@CurrentUser() user: AuthUser, @Body() dto: AmbulanceEstimateDto) {
    return this.service.estimate(user.id, dto);
  }

  @Post('requests')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAmbulanceRequestDto) {
    return this.service.create(user.id, dto);
  }

  @Get('requests')
  list(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.list(user, Number(page), Math.min(Number(limit), 100));
  }

  @Get('driver/requests')
  @Roles(UserRole.DRIVER)
  driverRequests(@CurrentUser() user: AuthUser) {
    return this.service.driverRequests(user.id);
  }

  @Post('driver/:id/accept')
  @Roles(UserRole.DRIVER)
  driverAccept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.driverAccept(user.id, id);
  }

  @Post('driver/:id/arrive')
  @Roles(UserRole.DRIVER)
  arrive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.driverTransition(user.id, id, 'arrive');
  }

  @Post('driver/:id/start')
  @Roles(UserRole.DRIVER)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.driverTransition(user.id, id, 'start');
  }

  @Post('driver/:id/complete')
  @Roles(UserRole.DRIVER)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AmbulanceActionDto) {
    return this.service.driverTransition(user.id, id, 'complete', dto);
  }

  @Post('requests/:id/dispatch')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.MEDICAL_PARTNER)
  dispatch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DispatchAmbulanceDto) {
    return this.service.dispatch(user.id, id, dto);
  }

  @Get('requests/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  @Post('requests/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AmbulanceActionDto) {
    return this.service.cancel(user, id, dto);
  }
}
