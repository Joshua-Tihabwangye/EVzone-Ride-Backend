import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  CreateTouristBookingDto,
  CreateTourPackageDto,
  TouristActionDto,
  TouristQuoteDto,
} from './tourist.dto';
import { TouristService } from './tourist.service';

@ApiTags('Tourist Vehicles')
@ApiBearerAuth()
@Controller('tourist')
export class TouristController {
  constructor(private readonly service: TouristService) {}

  @Public()
  @Get('packages')
  packages(@Query('city') city?: string) {
    return this.service.listPackages(city);
  }

  @Public()
  @Get('packages/:id')
  package(@Param('id') id: string) {
    return this.service.package(id);
  }

  @Post('packages')
  @Roles(UserRole.TOUR_OPERATOR, UserRole.ADMIN)
  createPackage(@CurrentUser() user: AuthUser, @Body() dto: CreateTourPackageDto) {
    return this.service.createPackage(user.id, dto);
  }

  @Patch('packages/:id')
  @Roles(UserRole.TOUR_OPERATOR, UserRole.ADMIN)
  updatePackage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTourPackageDto>,
  ) {
    return this.service.updatePackage(user.id, id, dto, user.role === UserRole.ADMIN);
  }

  @Post('quote')
  quote(@CurrentUser() user: AuthUser, @Body() dto: TouristQuoteDto) {
    return this.service.quote(user.id, dto);
  }

  @Post('bookings')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTouristBookingDto) {
    return this.service.create(user.id, dto);
  }

  @Get('bookings')
  list(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.list(user, Number(page), Math.min(Number(limit), 100));
  }

  @Get('bookings/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  @Post('bookings/:id/accept')
  @Roles(UserRole.DRIVER, UserRole.TOUR_OPERATOR, UserRole.ADMIN)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { vehicleId?: string }) {
    return this.service.accept(user, id, body.vehicleId);
  }

  @Post('bookings/:id/arrive')
  @Roles(UserRole.DRIVER)
  arrive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.transitionDriver(user.id, id, 'arrive');
  }

  @Post('bookings/:id/start')
  @Roles(UserRole.DRIVER)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.transitionDriver(user.id, id, 'start');
  }

  @Post('bookings/:id/complete')
  @Roles(UserRole.DRIVER)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TouristActionDto) {
    return this.service.transitionDriver(user.id, id, 'complete', dto);
  }

  @Post('bookings/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TouristActionDto) {
    return this.service.cancel(user, id, dto);
  }
}
