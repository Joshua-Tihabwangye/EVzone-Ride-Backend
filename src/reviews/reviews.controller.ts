import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { CreateReviewDto, ModerateReviewDto, ReportReviewDto, RespondReviewDto } from './reviews.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews & Ratings')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.service.create(user, dto);
  }

  @Get('me')
  mine(
    @CurrentUser() user: AuthUser,
    @Query('mode') mode = 'written',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.mine(user.id, mode, Number(page), Math.min(Number(limit), 100));
  }

  @Public()
  @Get('service/:serviceType/:serviceId')
  forService(
    @Param('serviceType') serviceType: string,
    @Param('serviceId') serviceId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.forService(serviceType, serviceId, Number(page), Math.min(Number(limit), 100));
  }

  @Public()
  @Get('users/:userId/summary')
  summary(@Param('userId') userId: string) {
    return this.service.userSummary(userId);
  }

  @Post(':id/respond')
  respond(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RespondReviewDto) {
    return this.service.respond(user, id, dto);
  }

  @Post(':id/report')
  report(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReportReviewDto) {
    return this.service.report(user.id, id, dto);
  }

  @Patch(':id/moderate')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  moderate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.service.moderate(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
