import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  CreateFleetIncidentDto,
  CreateFleetPortalDispatchDto,
  CreateFleetPortalDriverDto,
  CreateFleetPortalVehicleDto,
  CreateFleetServiceOrderDto,
  FleetPortalListQueryDto,
  PatchFleetBranchDto,
  PatchFleetPortalDispatchDto,
  PatchFleetPortalDriverDto,
  PatchFleetPortalVehicleDto,
  PatchFleetServiceOrderDto,
  UpdateFleetPortalProfileDto,
  UpsertFleetBranchDto,
} from './fleet-portal.dto';
import { FleetPortalService } from './fleet-portal.service';

const FLEET_PORTAL_ROLES = [
  UserRole.FLEET_PARTNER,
  UserRole.FLEET_MANAGER,
  UserRole.DISPATCHER,
  UserRole.AGENT,
  UserRole.ADMIN,
];

@ApiTags('Fleet Partner Portal v6')
@ApiBearerAuth()
@Roles(...FLEET_PORTAL_ROLES)
@Controller('fleet')
export class FleetPortalController {
  constructor(private readonly service: FleetPortalService) {}

  @Get('me/organizations')
  @ApiOperation({ summary: 'List Fleet Partner organizations available to the authenticated account' })
  organizations(@CurrentUser() user: AuthUser) {
    return this.service.organizationsForUser(user);
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Get the active Fleet Partner profile' })
  profile(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.profile(user, organizationId);
  }

  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateFleetPortalProfileDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateProfile(user, dto, organizationId);
  }

  @Get('me/branches')
  branches(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.listBranches(user, organizationId);
  }

  @Post('me/branches')
  createBranch(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertFleetBranchDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createBranch(user, dto, organizationId);
  }

  @Get('me/branches/:branchId')
  branch(
    @CurrentUser() user: AuthUser,
    @Param('branchId') branchId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.branch(user, branchId, organizationId);
  }

  @Patch('me/branches/:branchId')
  updateBranch(
    @CurrentUser() user: AuthUser,
    @Param('branchId') branchId: string,
    @Body() dto: PatchFleetBranchDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateBranch(user, branchId, dto, organizationId);
  }

  @Delete('me/branches/:branchId')
  deleteBranch(
    @CurrentUser() user: AuthUser,
    @Param('branchId') branchId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.deleteBranch(user, branchId, organizationId);
  }

  @Get('me/settings')
  portalSettings(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.portalSettings(user, organizationId);
  }

  @Patch('me/settings')
  updatePortalSettings(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updatePortalSettings(user, body, organizationId);
  }

  @Get('me/security')
  security(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.securitySettings(user, organizationId);
  }

  @Patch('me/security')
  updateSecurity(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateSecuritySettings(user, body, organizationId);
  }

  @Get('me/integrations')
  integrations(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.integrations(user, organizationId);
  }

  @Patch('me/integrations')
  updateIntegrations(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateIntegrations(user, body, organizationId);
  }

  @Get('me/roles')
  roles(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.roles(user, organizationId);
  }

  @Patch('me/roles')
  updateRoles(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateRoles(user, body, organizationId);
  }

  @Get('me/notifications')
  notifications(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.notifications(user, organizationId);
  }

  @Patch('me/notifications/:notificationId')
  markNotification(
    @CurrentUser() user: AuthUser,
    @Param('notificationId') notificationId: string,
    @Body() body: { read?: boolean },
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.markNotification(user, notificationId, body.read ?? true, organizationId);
  }

  @Get('me/activity-logs')
  activityLogs(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.activityLogs(user, query, organizationId);
  }

  @Get('me/members')
  members(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.members(user, organizationId);
  }

  @Post('me/invitations')
  inviteMember(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.inviteMember(user, body, organizationId);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.dashboard(user, organizationId);
  }

  @Get('map')
  map(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.map(user, organizationId);
  }

  @Get('drivers')
  drivers(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listDrivers(user, query, organizationId);
  }

  @Post('drivers')
  createDriver(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFleetPortalDriverDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createDriver(user, dto, organizationId);
  }

  @Get('drivers/:driverId')
  driver(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.driver(user, driverId, organizationId);
  }

  @Patch('drivers/:driverId')
  updateDriver(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Body() dto: PatchFleetPortalDriverDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateDriver(user, driverId, dto, organizationId);
  }

  @Delete('drivers/:driverId')
  removeDriver(
    @CurrentUser() user: AuthUser,
    @Param('driverId') driverId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.removeDriver(user, driverId, organizationId);
  }

  @Get('vehicles')
  vehicles(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listVehicles(user, query, organizationId);
  }

  @Post('vehicles')
  createVehicle(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFleetPortalVehicleDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createVehicle(user, dto, organizationId);
  }

  @Get('vehicles/:vehicleId')
  vehicle(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.vehicle(user, vehicleId, organizationId);
  }

  @Patch('vehicles/:vehicleId')
  updateVehicle(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: PatchFleetPortalVehicleDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateVehicle(user, vehicleId, dto, organizationId);
  }

  @Delete('vehicles/:vehicleId')
  removeVehicle(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.removeVehicle(user, vehicleId, organizationId);
  }

  @Get('vehicles/:vehicleId/documents')
  vehicleDocuments(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listVehicleDocuments(user, vehicleId, organizationId);
  }

  @Post('vehicles/:vehicleId/documents')
  createVehicleDocument(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createVehicleDocument(user, vehicleId, body, organizationId);
  }

  @Patch('vehicles/:vehicleId/documents/:documentId')
  updateVehicleDocument(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateVehicleDocument(user, vehicleId, documentId, body, organizationId);
  }

  @Get('vehicles/:vehicleId/accessories')
  vehicleAccessories(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listVehicleAccessories(user, vehicleId, organizationId);
  }

  @Patch('vehicles/:vehicleId/accessories')
  replaceVehicleAccessories(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.replaceVehicleAccessories(user, vehicleId, body, organizationId);
  }

  @Get('vehicles/:vehicleId/maintenance')
  vehicleMaintenance(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listMaintenance(user, vehicleId, organizationId);
  }

  @Post('vehicles/:vehicleId/maintenance')
  createMaintenance(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId') vehicleId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createMaintenance(user, vehicleId, body, organizationId);
  }

  @Patch('maintenance/:maintenanceId')
  updateMaintenance(
    @CurrentUser() user: AuthUser,
    @Param('maintenanceId') maintenanceId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateMaintenance(user, maintenanceId, body, organizationId);
  }

  @Get('dispatches')
  dispatches(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listDispatches(user, query, organizationId);
  }

  @Post('dispatches')
  createDispatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFleetPortalDispatchDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createDispatch(user, dto, organizationId);
  }

  @Get('dispatches/:dispatchId')
  dispatch(
    @CurrentUser() user: AuthUser,
    @Param('dispatchId') dispatchId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.dispatch(user, dispatchId, organizationId);
  }

  @Patch('dispatches/:dispatchId')
  updateDispatch(
    @CurrentUser() user: AuthUser,
    @Param('dispatchId') dispatchId: string,
    @Body() dto: PatchFleetPortalDispatchDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateDispatch(user, dispatchId, dto, organizationId);
  }

  @Get('rentals')
  rentals(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listServiceOrders(user, 'RENTAL', query, organizationId);
  }

  @Post('rentals')
  createRental(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFleetServiceOrderDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createServiceOrder(user, 'RENTAL', dto, organizationId);
  }

  @Get('rentals/:rentalId')
  rental(
    @CurrentUser() user: AuthUser,
    @Param('rentalId') rentalId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.serviceOrder(user, rentalId, 'RENTAL', organizationId);
  }

  @Patch('rentals/:rentalId')
  updateRental(
    @CurrentUser() user: AuthUser,
    @Param('rentalId') rentalId: string,
    @Body() dto: PatchFleetServiceOrderDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateServiceOrder(user, rentalId, 'RENTAL', dto, organizationId);
  }

  @Get('tours')
  tours(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listServiceOrders(user, 'TOUR', query, organizationId);
  }

  @Post('tours')
  createTour(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFleetServiceOrderDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createServiceOrder(user, 'TOUR', dto, organizationId);
  }

  @Get('tours/:tourId/messages')
  tourMessages(
    @CurrentUser() user: AuthUser,
    @Param('tourId') tourId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listTourMessages(user, tourId, organizationId);
  }

  @Post('tours/:tourId/messages')
  createTourMessage(
    @CurrentUser() user: AuthUser,
    @Param('tourId') tourId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createTourMessage(user, tourId, body, organizationId);
  }

  @Get('tours/:tourId')
  tour(
    @CurrentUser() user: AuthUser,
    @Param('tourId') tourId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.serviceOrder(user, tourId, 'TOUR', organizationId);
  }

  @Patch('tours/:tourId')
  updateTour(
    @CurrentUser() user: AuthUser,
    @Param('tourId') tourId: string,
    @Body() dto: PatchFleetServiceOrderDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateServiceOrder(user, tourId, 'TOUR', dto, organizationId);
  }

  @Get('school-shuttles')
  schoolShuttles(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listServiceOrders(user, 'SCHOOL_SHUTTLE', query, organizationId);
  }

  @Post('school-shuttles')
  createSchoolShuttle(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFleetServiceOrderDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createServiceOrder(user, 'SCHOOL_SHUTTLE', dto, organizationId);
  }

  @Get('school-shuttles/routes')
  shuttleRoutes(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(user, 'SCHOOL_ROUTE', query, organizationId);
  }

  @Post('school-shuttles/routes')
  createShuttleRoute(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(user, 'SCHOOL_ROUTE', body, undefined, organizationId);
  }

  @Get('school-shuttles/routes/:routeId')
  shuttleRoute(
    @CurrentUser() user: AuthUser,
    @Param('routeId') routeId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.getLooseResource(user, routeId, 'SCHOOL_ROUTE', organizationId);
  }

  @Patch('school-shuttles/routes/:routeId')
  updateShuttleRoute(
    @CurrentUser() user: AuthUser,
    @Param('routeId') routeId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateLooseResource(user, routeId, 'SCHOOL_ROUTE', body, organizationId);
  }

  @Get('school-shuttles/students')
  shuttleStudents(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(user, 'SCHOOL_STUDENT', query, organizationId);
  }

  @Post('school-shuttles/students')
  createShuttleStudent(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(user, 'SCHOOL_STUDENT', body, undefined, organizationId);
  }

  @Get('school-shuttles/students/:studentId')
  shuttleStudent(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.getLooseResource(user, studentId, 'SCHOOL_STUDENT', organizationId);
  }

  @Patch('school-shuttles/students/:studentId')
  updateShuttleStudent(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateLooseResource(user, studentId, 'SCHOOL_STUDENT', body, organizationId);
  }

  @Get('school-shuttles/attendance')
  shuttleAttendance(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId: string | undefined,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(
      user,
      'SCHOOL_ATTENDANCE',
      { ...query, parentId: studentId ?? query.parentId },
      organizationId,
    );
  }

  @Post('school-shuttles/attendance')
  createShuttleAttendance(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(
      user,
      'SCHOOL_ATTENDANCE',
      body,
      typeof body.studentId === 'string' ? body.studentId : undefined,
      organizationId,
    );
  }

  @Get('school-shuttles/feedback')
  shuttleFeedback(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(user, 'SCHOOL_FEEDBACK', query, organizationId);
  }

  @Post('school-shuttles/feedback')
  createShuttleFeedback(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(user, 'SCHOOL_FEEDBACK', body, undefined, organizationId);
  }

  @Get('school-shuttles/trips')
  shuttleTrips(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(user, 'SCHOOL_TRIP', query, organizationId);
  }

  @Post('school-shuttles/trips')
  createShuttleTrip(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(
      user,
      'SCHOOL_TRIP',
      body,
      typeof body.routeId === 'string' ? body.routeId : undefined,
      organizationId,
    );
  }

  @Get('school-shuttles/trips/:tripId')
  shuttleTrip(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.getLooseResource(user, tripId, 'SCHOOL_TRIP', organizationId);
  }

  @Patch('school-shuttles/trips/:tripId')
  updateShuttleTrip(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateLooseResource(user, tripId, 'SCHOOL_TRIP', body, organizationId);
  }

  @Get('school-shuttles/attendants')
  shuttleAttendants(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(user, 'SCHOOL_ATTENDANT', query, organizationId);
  }

  @Post('school-shuttles/attendants')
  createShuttleAttendant(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(user, 'SCHOOL_ATTENDANT', body, undefined, organizationId);
  }

  @Get('school-shuttles/payments')
  shuttlePayments(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(user, 'SCHOOL_PAYMENT', query, organizationId);
  }

  @Post('school-shuttles/payments')
  createShuttlePayment(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(
      user,
      'SCHOOL_PAYMENT',
      body,
      typeof body.studentId === 'string' ? body.studentId : undefined,
      organizationId,
    );
  }

  @Get('school-shuttles/safety')
  shuttleSafety(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(user, 'SCHOOL_SAFETY', query, organizationId);
  }

  @Post('school-shuttles/safety')
  createShuttleSafety(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(user, 'SCHOOL_SAFETY', body, undefined, organizationId);
  }

  @Get('school-shuttles/rosters')
  shuttleRosters(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(user, 'SCHOOL_ROSTER', query, organizationId);
  }

  @Post('school-shuttles/rosters')
  createShuttleRoster(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(
      user,
      'SCHOOL_ROSTER',
      body,
      typeof body.routeId === 'string' ? body.routeId : undefined,
      organizationId,
    );
  }

  @Get('school-shuttles/reminders')
  shuttleReminders(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listLooseResources(user, 'SCHOOL_REMINDER', query, organizationId);
  }

  @Post('school-shuttles/reminders')
  createShuttleReminder(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createLooseResource(user, 'SCHOOL_REMINDER', body, undefined, organizationId);
  }

  @Get('school-shuttles/:shuttleId')
  schoolShuttle(
    @CurrentUser() user: AuthUser,
    @Param('shuttleId') shuttleId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.serviceOrder(user, shuttleId, 'SCHOOL_SHUTTLE', organizationId);
  }

  @Patch('school-shuttles/:shuttleId')
  updateSchoolShuttle(
    @CurrentUser() user: AuthUser,
    @Param('shuttleId') shuttleId: string,
    @Body() dto: PatchFleetServiceOrderDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateServiceOrder(user, shuttleId, 'SCHOOL_SHUTTLE', dto, organizationId);
  }

  @Get('compliance/incidents')
  incidents(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.incidents(user, query, organizationId);
  }

  @Post('compliance/incidents')
  createIncident(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFleetIncidentDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createIncident(user, dto, organizationId);
  }

  @Patch('compliance/incidents/:incidentId')
  updateIncident(
    @CurrentUser() user: AuthUser,
    @Param('incidentId') incidentId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateLooseResource(user, incidentId, 'INCIDENT', body, organizationId);
  }

  @Get('compliance/training-courses')
  trainingCourses(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.trainingCourses(user, organizationId);
  }

  @Post('compliance/training-courses/:courseId/assign')
  assignTraining(
    @CurrentUser() user: AuthUser,
    @Param('courseId') courseId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.assignTraining(user, courseId, body, organizationId);
  }

  @Get('earnings/payouts')
  payouts(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.payouts(user, organizationId);
  }

  @Get('earnings/summary')
  earningsSummary(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.earningsSummary(user, organizationId);
  }

  @Get('earnings/statements')
  earningsStatements(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.earningsStatements(user, query, organizationId);
  }

  @Get('earnings/statements/:period')
  earningsStatement(
    @CurrentUser() user: AuthUser,
    @Param('period') period: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.earningsStatement(user, period, organizationId);
  }

  @Get('trips')
  trips(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.trips(user, query, organizationId);
  }

  @Get('trips/:tripId')
  trip(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.trip(user, tripId, organizationId);
  }

  @Get('rider-services')
  riderServices(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.riderServices(user, query, organizationId);
  }

  @Get('ambulances')
  ambulanceCases(
    @CurrentUser() user: AuthUser,
    @Query() query: FleetPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.ambulanceCases(user, query, organizationId);
  }

  @Get('support/tickets')
  supportTickets(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.supportTickets(user, organizationId);
  }

  @Post('support/tickets')
  createSupportTicket(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createSupportTicket(user, body, organizationId);
  }

  @Post('support/tickets/:ticketId/messages')
  addSupportMessage(
    @CurrentUser() user: AuthUser,
    @Param('ticketId') ticketId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.addSupportMessage(user, ticketId, body, organizationId);
  }
}
