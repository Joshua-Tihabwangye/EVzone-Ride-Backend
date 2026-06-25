import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AssignManualBookingDto,
  CreateManualBookingDto,
  DispatchListQueryDto,
  DispatchNoteDto,
  ManualBookingActionDto,
  UpdateManualBookingDto,
} from '../dispatch/dispatch.dto';
import { AgentPortalService } from './agent-portal.service';

const AGENT_PORTAL_ROLES = [UserRole.AGENT, UserRole.DISPATCHER, UserRole.SUPPORT, UserRole.ADMIN];

@ApiTags('Agent Portal v7 - Dispatch & Live Operations')
@ApiBearerAuth()
@Roles(...AGENT_PORTAL_ROLES)
@Controller('agent')
export class AgentPortalOperationsController {
  constructor(private readonly service: AgentPortalService) {}

  @Get('dispatch')
  dispatch(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.dispatchHub(user, organizationId);
  }

  @Get('dispatch/hub')
  dispatchHub(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.dispatchHub(user, organizationId);
  }

  @Get('dispatch/board')
  dispatchBoard(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.dispatchBoard(user, organizationId);
  }

  @Get('dispatch/bookings')
  bookings(
    @CurrentUser() user: AuthUser,
    @Query() query: DispatchListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listManualBookings(user, query, organizationId);
  }

  @Post('dispatch/bookings')
  @ApiOperation({
    summary: 'Create a manual ride, delivery, rental, tour, ambulance or school-shuttle booking',
  })
  createBooking(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateManualBookingDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createManualBooking(user, dto, organizationId);
  }

  @Get('dispatch/bookings/:bookingId')
  booking(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.manualBookingDetail(user, bookingId, organizationId);
  }

  @Patch('dispatch/bookings/:bookingId')
  updateBooking(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: UpdateManualBookingDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateManualBooking(user, bookingId, dto, organizationId);
  }

  @Post('dispatch/bookings/:bookingId/assign')
  assignBooking(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: AssignManualBookingDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.assignManualBooking(user, bookingId, dto, organizationId);
  }

  @Post('dispatch/bookings/:bookingId/notes')
  addBookingNote(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: DispatchNoteDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.addManualBookingNote(user, bookingId, dto, organizationId);
  }

  @Post('dispatch/bookings/:bookingId/cancel')
  cancelBooking(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: ManualBookingActionDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.cancelManualBooking(user, bookingId, dto, organizationId);
  }

  @Post('dispatch/bookings/:bookingId/sync')
  syncBooking(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.syncManualBooking(user, bookingId, organizationId);
  }

  @Post('dispatch/bookings/:bookingId/confirm')
  confirmBooking(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.syncManualBooking(user, bookingId, organizationId);
  }

  @Get('bookings')
  bookingListAlias(
    @CurrentUser() user: AuthUser,
    @Query() query: DispatchListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listManualBookings(user, query, organizationId);
  }

  @Post('bookings')
  createBookingAlias(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateManualBookingDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createManualBooking(user, dto, organizationId);
  }

  @Get('bookings/:bookingId')
  bookingAlias(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.manualBookingDetail(user, bookingId, organizationId);
  }

  @Get('live-ops')
  liveOps(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.liveOps(user, organizationId);
  }

  @Get('live-ops/map')
  liveMap(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.liveOps(user, organizationId);
  }

  @Get('live-ops/services/:serviceType/:serviceId')
  liveService(
    @CurrentUser() user: AuthUser,
    @Param('serviceType') serviceType: string,
    @Param('serviceId') serviceId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.liveTripDetail(user, serviceType, serviceId, organizationId);
  }

  @Get('live-ops/trips/:serviceId')
  liveTrip(
    @CurrentUser() user: AuthUser,
    @Param('serviceId') serviceId: string,
    @Query('serviceType') serviceType = 'RIDE',
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.liveTripDetail(user, serviceType, serviceId, organizationId);
  }

  @Get('live-ops/drivers/:driverId')
  liveDriver(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.driverDetail(user, driverId, organizationId);
  }

  @Get('drivers/:driverId')
  driver(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.driverDetail(user, driverId, organizationId);
  }

  @Get('riders/:riderId')
  rider(
    @CurrentUser() user: AuthUser,
    @Param('riderId') riderId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.riderProfile(user, riderId, organizationId);
  }

  @Get('companies/:companyId')
  company(
    @CurrentUser() user: AuthUser,
    @Param('companyId') companyId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.companyProfile(user, companyId, organizationId);
  }
}
