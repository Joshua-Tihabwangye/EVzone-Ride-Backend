import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { FleetAssignmentStatus, MaintenanceStatus, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AdminReviewFleetDto,
  CreateFleetAssignmentDto,
  CreateFleetProfileDto,
  CreateMaintenanceRecordDto,
  CreateSchoolConnectionDto,
  FleetListQueryDto,
  LinkFleetDriverDto,
  LinkFleetVehicleDto,
  RunSchoolSyncDto,
  UpdateFleetAssignmentDto,
  UpdateFleetDriverDto,
  UpdateFleetProfileDto,
  UpdateFleetVehicleDto,
  UpdateMaintenanceRecordDto,
  UpdateSchoolConnectionDto,
} from './fleet-partners.dto';
import { FleetPartnersService } from './fleet-partners.service';

@ApiTags('Fleet Partner')
@ApiBearerAuth()
@Controller('fleet-partners')
export class FleetPartnersController {
  constructor(private readonly service: FleetPartnersService) {}

  @Public()
  @Post('school/webhooks/:connectionId')
  schoolWebhook(
    @Param('connectionId') connectionId: string,
    @Headers('x-evzone-signature') signature: string | undefined,
    @Body() dto: RunSchoolSyncDto,
  ) {
    return this.service.receiveSchoolWebhook(connectionId, JSON.stringify(dto), signature, dto);
  }

  @Get('admin/fleets')
  @Roles(UserRole.ADMIN)
  adminList(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.adminList(Number(page), Math.min(Number(limit), 100));
  }

  @Patch('admin/fleets/:fleetId/status')
  @Roles(UserRole.ADMIN)
  adminStatus(
    @CurrentUser() user: AuthUser,
    @Param('fleetId') fleetId: string,
    @Body() dto: AdminReviewFleetDto,
  ) {
    return this.service.adminSetStatus(user, fleetId, dto.status, dto.reason);
  }

  @Post(':organizationId/profile')
  createProfile(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateFleetProfileDto,
  ) {
    return this.service.createProfile(user, organizationId, dto);
  }

  @Get(':organizationId/profile')
  profile(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string) {
    return this.service.profile(user, organizationId);
  }

  @Patch(':organizationId/profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateFleetProfileDto,
  ) {
    return this.service.updateProfile(user, organizationId, dto);
  }

  @Get(':organizationId/dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string) {
    return this.service.dashboard(user, organizationId);
  }

  @Post(':organizationId/vehicles')
  linkVehicle(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: LinkFleetVehicleDto,
  ) {
    return this.service.linkVehicle(user, organizationId, dto);
  }

  @Get(':organizationId/vehicles')
  vehicles(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query() query: FleetListQueryDto,
  ) {
    return this.service.listVehicles(user, organizationId, query);
  }

  @Patch(':organizationId/vehicles/:linkId')
  updateVehicle(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('linkId') linkId: string,
    @Body() dto: UpdateFleetVehicleDto,
  ) {
    return this.service.updateVehicle(user, organizationId, linkId, dto);
  }

  @Delete(':organizationId/vehicles/:linkId')
  removeVehicle(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.service.removeVehicle(user, organizationId, linkId);
  }

  @Post(':organizationId/drivers')
  linkDriver(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: LinkFleetDriverDto,
  ) {
    return this.service.linkDriver(user, organizationId, dto);
  }

  @Get(':organizationId/drivers')
  drivers(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query() query: FleetListQueryDto,
  ) {
    return this.service.listDrivers(user, organizationId, query);
  }

  @Patch(':organizationId/drivers/:linkId')
  updateDriver(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('linkId') linkId: string,
    @Body() dto: UpdateFleetDriverDto,
  ) {
    return this.service.updateDriver(user, organizationId, linkId, dto);
  }

  @Delete(':organizationId/drivers/:linkId')
  removeDriver(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.service.removeDriver(user, organizationId, linkId);
  }

  @Post(':organizationId/assignments')
  createAssignment(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateFleetAssignmentDto,
  ) {
    return this.service.createAssignment(user, organizationId, dto);
  }

  @Get(':organizationId/assignments')
  assignments(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query('status') status?: FleetAssignmentStatus,
  ) {
    return this.service.listAssignments(user, organizationId, status);
  }

  @Patch(':organizationId/assignments/:assignmentId')
  updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateFleetAssignmentDto,
  ) {
    return this.service.updateAssignment(user, organizationId, assignmentId, dto);
  }

  @Post(':organizationId/maintenance')
  createMaintenance(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateMaintenanceRecordDto,
  ) {
    return this.service.createMaintenance(user, organizationId, dto);
  }

  @Get(':organizationId/maintenance')
  maintenance(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query('status') status?: MaintenanceStatus,
  ) {
    return this.service.listMaintenance(user, organizationId, status);
  }

  @Patch(':organizationId/maintenance/:recordId')
  updateMaintenance(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateMaintenanceRecordDto,
  ) {
    return this.service.updateMaintenance(user, organizationId, recordId, dto);
  }

  @Get(':organizationId/compliance')
  compliance(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string) {
    return this.service.compliance(user, organizationId);
  }

  @Post(':organizationId/school/connections')
  createSchoolConnection(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateSchoolConnectionDto,
  ) {
    return this.service.createSchoolConnection(user, organizationId, dto);
  }

  @Get(':organizationId/school/connections')
  schoolConnections(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string) {
    return this.service.listSchoolConnections(user, organizationId);
  }

  @Patch(':organizationId/school/connections/:connectionId')
  updateSchoolConnection(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: UpdateSchoolConnectionDto,
  ) {
    return this.service.updateSchoolConnection(user, organizationId, connectionId, dto);
  }

  @Post(':organizationId/school/connections/:connectionId/test')
  testSchoolConnection(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.service.testSchoolConnection(user, organizationId, connectionId);
  }

  @Post(':organizationId/school/connections/:connectionId/sync')
  syncSchool(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: RunSchoolSyncDto,
  ) {
    return this.service.runSchoolSync(user, organizationId, connectionId, dto);
  }

  @Get(':organizationId/school/connections/:connectionId/resources')
  schoolResources(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
    @Query('resourceType') resourceType?: string,
  ) {
    return this.service.schoolResourcesList(user, organizationId, connectionId, resourceType);
  }

  @Get(':organizationId/school/connections/:connectionId/jobs')
  schoolJobs(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.service.schoolSyncJobs(user, organizationId, connectionId);
  }
}
