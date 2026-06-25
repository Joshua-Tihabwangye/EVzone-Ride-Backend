import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MatchingJobStatus, ServiceType, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { MatchingService } from './matching.service';

@ApiTags('Matching & Job Offers')
@ApiBearerAuth()
@Controller('matching')
export class MatchingController {
  constructor(private readonly service: MatchingService) {}

  @Get('driver/offers')
  @Roles(UserRole.DRIVER)
  driverOffers(@CurrentUser() user: AuthUser, @Query('serviceType') serviceType?: ServiceType) {
    return this.service.listOffersForDriver(user.id, serviceType);
  }

  @Get('jobs')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER)
  jobs(@Query('status') status?: MatchingJobStatus, @Query('limit') limit = '100') {
    return this.service.listJobs(status, Number(limit));
  }

  @Get('jobs/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER)
  detail(@Param('id') id: string) {
    return this.service.jobDetail(id);
  }

  @Post('jobs/:id/retry')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER)
  retry(@Param('id') id: string) {
    return this.service.dispatch(id);
  }
}
