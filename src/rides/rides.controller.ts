import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AddSharedPassengerDto,
  CancelRideDto,
  CompleteRideDto,
  CreateRideDto,
  EstimateRideDto,
  RescheduleRideDto,
  RideFeedbackDto,
  VerifyRideOtpDto,
} from './rides.dto';
import { RidesService } from './rides.service';

@ApiTags('Rides - Ride Hailing')
@ApiBearerAuth()
@Controller('rides')
export class RidesController {
  constructor(private readonly service: RidesService) {}

  @Post('estimate')
  estimate(@CurrentUser() user: AuthUser, @Body() dto: EstimateRideDto) {
    return this.service.estimate(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRideDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope = 'all',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.list(user, scope, Number(page), Math.min(Number(limit), 100));
  }

  @Get('driver/requests')
  @Roles(UserRole.DRIVER)
  requests(@CurrentUser() user: AuthUser) {
    return this.service.driverRequests(user.id);
  }

  @Post('driver/:id/accept')
  @Roles(UserRole.DRIVER)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.accept(user.id, id);
  }

  @Post('driver/:id/reject')
  @Roles(UserRole.DRIVER)
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.reject(user.id, id, body.reason);
  }

  @Post('driver/:id/arrive')
  @Roles(UserRole.DRIVER)
  arrive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.arrive(user.id, id);
  }

  @Post('driver/:id/waiting')
  @Roles(UserRole.DRIVER)
  waiting(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.waiting(user.id, id);
  }

  @Post('driver/:id/verify-otp')
  @Roles(UserRole.DRIVER)
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VerifyRideOtpDto) {
    return this.service.verifyOtp(user.id, id, dto.code);
  }

  @Post('driver/:id/start')
  @Roles(UserRole.DRIVER)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.start(user.id, id);
  }

  @Post('driver/:id/complete')
  @Roles(UserRole.DRIVER)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteRideDto) {
    return this.service.complete(user.id, id, dto);
  }

  @Post('driver/:id/no-show')
  @Roles(UserRole.DRIVER)
  noShow(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.noShow(user.id, id, body.reason);
  }

  @Public()
  @Get('share/:token')
  shared(@Param('token') token: string) {
    return this.service.publicShare(token);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detailForUser(user.id, id, user.role);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelRideDto) {
    return this.service.cancel(user, id, dto);
  }

  @Patch(':id/reschedule')
  reschedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RescheduleRideDto) {
    return this.service.reschedule(user.id, id, dto);
  }

  @Post(':id/change-driver')
  changeDriver(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.changeDriver(user.id, id);
  }

  @Post(':id/passengers')
  addPassenger(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddSharedPassengerDto) {
    return this.service.addSharedPassenger(user.id, id, dto);
  }

  @Post(':id/share')
  share(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { recipients?: Record<string, unknown>[] },
  ) {
    return this.service.createShare(user.id, id, body.recipients);
  }

  @Post(':id/feedback')
  feedback(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RideFeedbackDto) {
    return this.service.submitFeedback(user.id, id, dto);
  }
}
