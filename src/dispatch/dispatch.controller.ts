import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces';
import {
  AssignManualBookingDto,
  CreateAgentProfileDto,
  CreateDispatchDeskDto,
  CreateDispatchShiftDto,
  CreateManualBookingDto,
  DispatchListQueryDto,
  DispatchNoteDto,
  ManualBookingActionDto,
  UpdateAgentProfileDto,
  UpdateDispatchDeskDto,
  UpdateManualBookingDto,
} from './dispatch.dto';
import { DispatchService } from './dispatch.service';

@ApiTags('Agent & Dispatcher')
@ApiBearerAuth()
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly service: DispatchService) {}

  @Post(':organizationId/desks')
  createDesk(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateDispatchDeskDto,
  ) {
    return this.service.createDesk(user, organizationId, dto);
  }

  @Get(':organizationId/desks')
  desks(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string) {
    return this.service.listDesks(user, organizationId);
  }

  @Patch(':organizationId/desks/:deskId')
  updateDesk(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('deskId') deskId: string,
    @Body() dto: UpdateDispatchDeskDto,
  ) {
    return this.service.updateDesk(user, organizationId, deskId, dto);
  }

  @Post(':organizationId/agents')
  createAgent(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateAgentProfileDto,
  ) {
    return this.service.createAgent(user, organizationId, dto);
  }

  @Get(':organizationId/agents')
  agents(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string) {
    return this.service.listAgents(user, organizationId);
  }

  @Patch(':organizationId/agents/:agentId')
  updateAgent(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentProfileDto,
  ) {
    return this.service.updateAgent(user, organizationId, agentId, dto);
  }

  @Get(':organizationId/dashboard')
  dashboard(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query('deskId') deskId?: string,
  ) {
    return this.service.dashboard(user, organizationId, deskId);
  }

  @Post(':organizationId/manual-bookings')
  createManualBooking(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateManualBookingDto,
  ) {
    return this.service.createManualBooking(user, organizationId, dto);
  }

  @Get(':organizationId/manual-bookings')
  manualBookings(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query() query: DispatchListQueryDto,
  ) {
    return this.service.list(user, organizationId, query);
  }

  @Get(':organizationId/manual-bookings/:id')
  manualBooking(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.service.detail(user, organizationId, id);
  }

  @Patch(':organizationId/manual-bookings/:id')
  updateManualBooking(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateManualBookingDto,
  ) {
    return this.service.update(user, organizationId, id, dto);
  }

  @Post(':organizationId/manual-bookings/:id/assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: AssignManualBookingDto,
  ) {
    return this.service.assign(user, organizationId, id, dto);
  }

  @Post(':organizationId/manual-bookings/:id/notes')
  note(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: DispatchNoteDto,
  ) {
    return this.service.addNote(user, organizationId, id, dto);
  }

  @Post(':organizationId/manual-bookings/:id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ManualBookingActionDto,
  ) {
    return this.service.cancel(user, organizationId, id, dto);
  }

  @Post(':organizationId/manual-bookings/:id/sync-status')
  syncStatus(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.service.syncStatus(user, organizationId, id);
  }

  @Post(':organizationId/shifts')
  createShift(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateDispatchShiftDto,
  ) {
    return this.service.createShift(user, organizationId, dto);
  }

  @Get(':organizationId/shifts')
  shifts(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query('deskId') deskId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listShifts(user, organizationId, deskId, from, to);
  }

  @Post('shifts/:shiftId/check-in')
  checkIn(@CurrentUser() user: AuthUser, @Param('shiftId') shiftId: string) {
    return this.service.checkIn(user, shiftId);
  }

  @Post('shifts/:shiftId/check-out')
  checkOut(@CurrentUser() user: AuthUser, @Param('shiftId') shiftId: string) {
    return this.service.checkOut(user, shiftId);
  }
}
