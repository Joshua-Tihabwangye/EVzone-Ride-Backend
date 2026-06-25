import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrganizationStatus, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  ReviewDocumentDto,
  ReviewDriverDto,
  ReviewOrganizationDto,
  ReviewVehicleDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  UpsertPlatformSettingDto,
} from './admin.dto';
import { AdminPortalService } from './admin-portal.service';
import { AdminService } from './admin.service';

@ApiTags('Administration')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly portal: AdminPortalService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.service.dashboard();
  }

  @Get('users')
  users(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    if (page || limit || search) {
      return this.service.listUsers(Number(page ?? 1), Math.min(Number(limit ?? 20), 100), search);
    }
    return this.portal.listUsers();
  }

  @Post('users')
  createUser(@Body() input: Record<string, unknown>) {
    return this.portal.createPlatformUser(input);
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.portal.getUser(id);
  }

  @Patch('users/:id')
  patchUser(@Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.portal.patchUser(id, input);
  }

  @Patch('users/:id/status')
  updateUserStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.service.updateUserStatus(id, dto);
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.service.updateUserRole(id, dto);
  }

  @Get('drivers')
  drivers(@Query('page') page?: string, @Query('limit') limit?: string) {
    if (page || limit) {
      return this.service.listDrivers(Number(page ?? 1), Math.min(Number(limit ?? 20), 100));
    }
    return this.portal.listDrivers();
  }

  @Post('drivers')
  createDriver(@Body() input: Record<string, unknown>) {
    return this.portal.createDriver(input);
  }

  @Get('drivers/:id')
  driver(@Param('id') id: string) {
    return this.portal.getDriver(id);
  }

  @Patch('drivers/:id')
  patchDriver(@Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.portal.patchDriver(id, input);
  }

  @Patch('drivers/:id/review')
  reviewDriver(@Param('id') id: string, @Body() dto: ReviewDriverDto) {
    return this.service.reviewDriver(id, dto);
  }

  @Get('driver-documents/pending')
  pendingDriverDocuments(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.pendingDriverDocuments(Number(page), Math.min(Number(limit), 100));
  }

  @Patch('driver-documents/:id/review')
  reviewDriverDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.service.reviewDriverDocument(user.id, id, dto);
  }

  @Get('vehicle-documents/pending')
  pendingVehicleDocuments(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.pendingVehicleDocuments(Number(page), Math.min(Number(limit), 100));
  }

  @Patch('vehicle-documents/:id/review')
  reviewVehicleDocument(@Param('id') id: string, @Body() dto: ReviewDocumentDto) {
    return this.service.reviewVehicleDocument(id, dto);
  }

  @Patch('vehicles/:id/review')
  reviewVehicle(@Param('id') id: string, @Body() dto: ReviewVehicleDto) {
    return this.service.reviewVehicle(id, dto);
  }

  @Get('bookings/recent')
  bookings(@Query('limit') limit = '20') {
    return this.service.recentBookings(Number(limit));
  }

  @Get('organizations')
  organizations(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: OrganizationStatus,
  ) {
    return this.service.listOrganizations(Number(page), Math.min(Number(limit), 100), status);
  }

  @Patch('organizations/:id/review')
  reviewOrganization(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewOrganizationDto,
  ) {
    return this.service.reviewOrganization(user.id, id, dto);
  }

  @Get('fleets')
  fleets(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.listFleets(Number(page), Math.min(Number(limit), 100));
  }

  @Get('manual-bookings')
  manualBookings(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.listManualBookings(Number(page), Math.min(Number(limit), 100));
  }

  @Get('corporate-pay/transactions')
  corporatePay(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.listCorporatePay(Number(page), Math.min(Number(limit), 100));
  }

  @Get('integrations/health')
  integrationHealth() {
    return this.service.integrationHealth();
  }

  @Get('settings')
  settings() {
    return this.service.listSettings();
  }

  @Put('settings/:key')
  upsertSetting(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpsertPlatformSettingDto,
  ) {
    return this.service.upsertSetting(user.id, key, dto);
  }

  @Delete('settings/:key')
  deleteSetting(@Param('key') key: string) {
    return this.service.deleteSetting(key);
  }

  @Get('audit-logs')
  auditLogs(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.service.auditLogs(Number(page), Math.min(Number(limit), 100));
  }
}
