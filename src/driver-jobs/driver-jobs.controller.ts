import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ServiceType, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { AcceptDriverJobDto, DeclineDriverJobDto } from './driver-jobs.dto';
import { DriverJobsService } from './driver-jobs.service';

@ApiTags('Driver Jobs')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller(['driver/jobs', 'drivers/me/all-jobs'])
export class DriverJobsController {
  constructor(private readonly service: DriverJobsService) {}

  @Get()
  offers(@CurrentUser() user: AuthUser, @Query('serviceType') serviceType?: ServiceType) {
    return this.service.listOffers(user.id, serviceType);
  }

  @Get('active')
  active(@CurrentUser() user: AuthUser) {
    return this.service.active(user.id);
  }

  @Get(':offerId')
  detail(@CurrentUser() user: AuthUser, @Param('offerId') offerId: string) {
    return this.service.detail(user.id, offerId);
  }

  @Post(':offerId/accept')
  accept(@CurrentUser() user: AuthUser, @Param('offerId') offerId: string, @Body() dto: AcceptDriverJobDto) {
    return this.service.accept(user, offerId, dto);
  }

  @Post(':offerId/decline')
  decline(
    @CurrentUser() user: AuthUser,
    @Param('offerId') offerId: string,
    @Body() dto: DeclineDriverJobDto,
  ) {
    return this.service.decline(user.id, offerId, dto);
  }
}
