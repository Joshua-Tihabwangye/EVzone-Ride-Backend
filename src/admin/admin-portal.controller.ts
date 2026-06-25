import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { AdminPortalService } from './admin-portal.service';

type JsonRecord = Record<string, unknown>;

@ApiTags('Admin Portal')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminPortalController {
  constructor(private readonly portal: AdminPortalService) {}

  @Get('riders')
  listRiders() {
    return this.portal.listRiders();
  }

  @Post('riders')
  createRider(@Body() input: JsonRecord) {
    return this.portal.createRider(input);
  }

  @Get('riders/:id')
  getRider(@Param('id') id: string) {
    return this.portal.getRider(id);
  }

  @Patch('riders/:id')
  patchRider(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchRider(id, input);
  }

  @Get('roles')
  roles() {
    return this.portal.listRoles();
  }

  @Post('roles')
  createRole(@Body() input: JsonRecord) {
    return this.portal.createRole(input);
  }

  @Get('roles/:id')
  role(@Param('id') id: string) {
    return this.portal.getRole(id);
  }

  @Patch('roles/:id')
  patchRole(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchRole(id, input);
  }

  @Get('pricing-zones')
  pricingZones() {
    return this.portal.listPricingZones();
  }

  @Post('pricing-zones')
  createPricingZone(@Body() input: JsonRecord) {
    return this.portal.createPricingZone(input);
  }

  @Get('pricing-zones/:id')
  pricingZone(@Param('id') id: string) {
    return this.portal.getPricingZone(id);
  }

  @Patch('pricing-zones/:id')
  patchPricingZone(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchPricingZone(id, input);
  }

  @Get('services')
  services() {
    return this.portal.listServices();
  }

  @Patch('services/:id')
  patchService(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchService(id, input, user.id);
  }

  @Get('training/modules')
  trainingModules() {
    return this.portal.listTrainingModules();
  }

  @Post('training/modules')
  createTrainingModule(@Body() input: JsonRecord) {
    return this.portal.createTrainingModule(input);
  }

  @Patch('training/modules/:id')
  patchTrainingModule(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchTrainingModule(id, input);
  }

  @Delete('training/modules/:id')
  deleteTrainingModule(@Param('id') id: string) {
    return this.portal.deleteTrainingModule(id);
  }

  @Get('analytics/finance')
  financeAnalytics(@Query('period') period = 'month') {
    return this.portal.financeAnalytics(period);
  }

  @Get('analytics/operations')
  operationsAnalytics(@Query('period') period = 'month') {
    return this.portal.operationsAnalytics(period);
  }

  @Get('analytics/timeseries')
  analyticsTimeseries(@Query('period') period = 'month') {
    return this.portal.analyticsTimeseries(period);
  }

  @Get('promos')
  promos() {
    return this.portal.listPromos();
  }

  @Post('promos')
  createPromo(@Body() input: JsonRecord) {
    return this.portal.createPromo(input);
  }

  @Patch('promos/:id')
  patchPromo(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchPromo(id, input);
  }

  @Get('rider-services')
  riderServices(
    @Query('serviceType') serviceType?: string,
    @Query('status') status?: string,
    @Query('riderId') riderId?: string,
  ) {
    return this.portal.listRiderServices({ serviceType, status, riderId });
  }

  @Get('rider-services/:id')
  riderService(@Param('id') id: string) {
    return this.portal.getRiderService(id);
  }

  @Get('system/audit-log')
  auditLog() {
    return this.portal.listAuditEvents();
  }

  @Get('system/overview')
  overview() {
    return this.portal.systemOverview();
  }

  @Get('companies')
  companies() {
    return this.portal.listCompanies();
  }

  @Get('companies/:id')
  company(@Param('id') id: string) {
    return this.portal.getCompany(id);
  }

  @Patch('companies/:id')
  patchCompany(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchCompany(id, input);
  }

  @Get('companies/:id/payout-settings')
  companyPayoutSettings(@Param('id') id: string) {
    return this.portal.getCompanyPayoutSettings(id);
  }

  @Patch('companies/:id/payout-settings')
  patchCompanyPayoutSettings(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchCompanyPayoutSettings(id, input);
  }

  @Get('companies/:id/payouts')
  companyPayouts(@Param('id') id: string) {
    return this.portal.listCompanyPayouts(id);
  }

  @Get('pricing/vehicle-categories')
  vehicleCategories(@Query('type') type?: string) {
    return this.portal.listVehicleCategories(type);
  }

  @Post('pricing/vehicle-categories')
  createVehicleCategory(@Body() input: JsonRecord) {
    return this.portal.createVehicleCategory(input);
  }

  @Patch('pricing/vehicle-categories/:id')
  patchVehicleCategory(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchVehicleCategory(id, input);
  }

  @Delete('pricing/vehicle-categories/:id')
  deleteVehicleCategory(@Param('id') id: string) {
    return this.portal.deleteVehicleCategory(id);
  }

  @Get('pricing/rides')
  ridePricing() {
    return this.portal.listPricing('ride');
  }

  @Post('pricing/rides')
  createRidePricing(@Body() input: JsonRecord) {
    return this.portal.createPricing('ride', input);
  }

  @Patch('pricing/rides/:id')
  patchRidePricing(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchPricing('ride', id, input);
  }

  @Delete('pricing/rides/:id')
  deleteRidePricing(@Param('id') id: string) {
    return this.portal.deletePricing('ride', id);
  }

  @Get('pricing/deliveries')
  deliveryPricing() {
    return this.portal.listPricing('delivery');
  }

  @Post('pricing/deliveries')
  createDeliveryPricing(@Body() input: JsonRecord) {
    return this.portal.createPricing('delivery', input);
  }

  @Patch('pricing/deliveries/:id')
  patchDeliveryPricing(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchPricing('delivery', id, input);
  }

  @Delete('pricing/deliveries/:id')
  deleteDeliveryPricing(@Param('id') id: string) {
    return this.portal.deletePricing('delivery', id);
  }

  @Get('pricing/rentals')
  rentalPricing() {
    return this.portal.listPricing('rental');
  }

  @Post('pricing/rentals')
  createRentalPricing(@Body() input: JsonRecord) {
    return this.portal.createPricing('rental', input);
  }

  @Patch('pricing/rentals/:id')
  patchRentalPricing(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchPricing('rental', id, input);
  }

  @Delete('pricing/rentals/:id')
  deleteRentalPricing(@Param('id') id: string) {
    return this.portal.deletePricing('rental', id);
  }

  @Get('pricing/ambulances')
  ambulancePricing() {
    return this.portal.listPricing('ambulance');
  }

  @Post('pricing/ambulances')
  createAmbulancePricing(@Body() input: JsonRecord) {
    return this.portal.createPricing('ambulance', input);
  }

  @Patch('pricing/ambulances/:id')
  patchAmbulancePricing(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchPricing('ambulance', id, input);
  }

  @Delete('pricing/ambulances/:id')
  deleteAmbulancePricing(@Param('id') id: string) {
    return this.portal.deletePricing('ambulance', id);
  }

  @Post('pricing/preview/:serviceType')
  previewFare(@Param('serviceType') serviceType: string, @Body() input: JsonRecord) {
    return this.portal.previewFare(serviceType, input);
  }

  @Get('experiments')
  experiments() {
    return this.portal.listExperiments();
  }

  @Post('experiments')
  createExperiment(@Body() input: JsonRecord) {
    return this.portal.createExperiment(input);
  }

  @Patch('experiments/:id')
  patchExperiment(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchExperiment(id, input);
  }

  @Get('content/:kind')
  content(@Param('kind') kind: string) {
    return this.portal.listContent(kind);
  }

  @Post('content/:kind')
  createContent(@Param('kind') kind: string, @Body() input: JsonRecord) {
    return this.portal.createContent(kind, input);
  }

  @Patch('content/:kind/:id')
  patchContent(@Param('id') id: string, @Body() input: JsonRecord) {
    return this.portal.patchContent(id, input);
  }
}

@ApiTags('Admin Portal Profile')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admins/me')
export class AdminSelfController {
  constructor(private readonly portal: AdminPortalService) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.portal.getMyProfile(user.id);
  }

  @Patch('profile')
  patchProfile(@CurrentUser() user: AuthUser, @Body() input: JsonRecord) {
    return this.portal.patchMyProfile(user.id, input);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.portal.getMySettings(user.id);
  }

  @Patch('settings')
  patchSettings(@CurrentUser() user: AuthUser, @Body() input: JsonRecord) {
    return this.portal.patchMySettings(user.id, input);
  }

  @Patch('profile-regions')
  patchRegions(@CurrentUser() user: AuthUser, @Body() input: JsonRecord) {
    return this.portal.patchMyRegions(user.id, input);
  }
}
