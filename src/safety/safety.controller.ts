import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ServiceType, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  CreateEmergencyDto,
  CreateMapReportDto,
  CreateSupportTicketDto,
  CreateTripShareDto,
  RequestTripPauseDto,
  RespondTripPauseDto,
  ResumeTripDto,
  SupportMessageDto,
  UpdateEmergencyDto,
  UpdateSupportTicketDto,
} from './safety.dto';
import { SafetyService } from './safety.service';

@ApiTags('Safety & Support')
@ApiBearerAuth()
@Controller('safety')
export class SafetyController {
  constructor(private readonly service: SafetyService) {}

  @Post('emergencies')
  createEmergency(@CurrentUser() user: AuthUser, @Body() dto: CreateEmergencyDto) {
    return this.service.createEmergency(user, dto, false);
  }

  @Post('sos')
  createSos(@CurrentUser() user: AuthUser, @Body() dto: CreateEmergencyDto) {
    return this.service.createEmergency(user, dto, true);
  }

  @Get('emergencies')
  listEmergencies(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.listIncidents(user, Number(page), Math.min(Number(limit), 100));
  }

  @Patch('emergencies/:id')
  updateEmergency(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmergencyDto) {
    return this.service.updateIncident(user, id, dto);
  }

  @Get('emergencies/:id/history')
  incidentHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.incidentHistory(user, id);
  }

  @Post('trip-pauses')
  requestTripPause(@CurrentUser() user: AuthUser, @Body() dto: RequestTripPauseDto) {
    return this.service.requestTripPause(user, dto);
  }

  @Get('trip-pauses')
  listTripPauses(
    @CurrentUser() user: AuthUser,
    @Query('serviceType') serviceType?: ServiceType,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.service.listTripPauses(user, serviceType, serviceId);
  }

  @Patch('trip-pauses/:id/respond')
  respondTripPause(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RespondTripPauseDto) {
    return this.service.respondTripPause(user, id, dto);
  }

  @Patch('trip-pauses/:id/resume')
  confirmTripResume(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResumeTripDto) {
    return this.service.confirmTripResume(user, id, dto);
  }

  @Patch('trip-pauses/:id/cancel')
  cancelTripPause(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelTripPause(user, id);
  }

  @Post('trip-shares')
  createShare(@CurrentUser() user: AuthUser, @Body() dto: CreateTripShareDto) {
    return this.service.createShare(user.id, dto);
  }

  @Public()
  @Get('trip-shares/public/:token')
  publicShare(@Param('token') token: string) {
    return this.service.publicShare(token);
  }

  @Get('proof/:serviceType/:serviceId')
  proof(
    @CurrentUser() user: AuthUser,
    @Param('serviceType') serviceType: ServiceType,
    @Param('serviceId') serviceId: string,
  ) {
    return this.service.proof(user.id, serviceType, serviceId);
  }

  @Post('map-reports')
  createMapReport(@CurrentUser() user: AuthUser, @Body() dto: CreateMapReportDto) {
    return this.service.createMapReport(user.id, dto);
  }

  @Get('map-reports')
  listMapReports(@CurrentUser() user: AuthUser) {
    return this.service.listMapReports(user);
  }

  @Post('support/tickets')
  createTicket(@CurrentUser() user: AuthUser, @Body() dto: CreateSupportTicketDto) {
    return this.service.createTicket(user.id, dto);
  }

  @Get('support/tickets')
  listTickets(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.listTickets(user, Number(page), Math.min(Number(limit), 100));
  }

  @Post('support/tickets/:id/messages')
  addTicketMessage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SupportMessageDto) {
    return this.service.addTicketMessage(user, id, dto);
  }

  @Patch('support/tickets/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  updateTicket(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSupportTicketDto) {
    return this.service.updateTicket(user, id, dto);
  }

  @Get('driving-hours')
  @Roles(UserRole.DRIVER)
  drivingHours(@CurrentUser() user: AuthUser) {
    return this.service.drivingHours(user.id);
  }
}
