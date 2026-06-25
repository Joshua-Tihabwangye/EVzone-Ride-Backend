import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DeliveryRouteStatus, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AddDeliveryRouteOrdersDto,
  CompleteDeliveryRouteDto,
  CreateDeliveryRouteDto,
  DispatchDeliveryRouteDto,
  UpdateDeliveryRouteStopDto,
} from './delivery-routes.dto';
import { DeliveryRoutesService } from './delivery-routes.service';

@ApiTags('Delivery Routes')
@ApiBearerAuth()
@Controller('delivery-routes')
export class DeliveryRoutesController {
  constructor(private readonly service: DeliveryRoutesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.AGENT, UserRole.FLEET_PARTNER, UserRole.FLEET_MANAGER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeliveryRouteDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPPORT,
    UserRole.DISPATCHER,
    UserRole.AGENT,
    UserRole.FLEET_PARTNER,
    UserRole.FLEET_MANAGER,
    UserRole.DRIVER,
  )
  list(
    @Query('status') status?: DeliveryRouteStatus,
    @Query('driverId') driverId?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.service.list({ status, driverId, organizationId });
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPPORT,
    UserRole.DISPATCHER,
    UserRole.AGENT,
    UserRole.FLEET_PARTNER,
    UserRole.FLEET_MANAGER,
    UserRole.DRIVER,
  )
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post(':id/orders')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.FLEET_PARTNER, UserRole.FLEET_MANAGER)
  addOrders(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddDeliveryRouteOrdersDto) {
    return this.service.addOrders(id, dto, user.id);
  }

  @Post(':id/optimize')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.FLEET_PARTNER, UserRole.FLEET_MANAGER)
  optimize(@Param('id') id: string) {
    return this.service.optimize(id);
  }

  @Post(':id/dispatch')
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.FLEET_PARTNER, UserRole.FLEET_MANAGER)
  dispatch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DispatchDeliveryRouteDto) {
    return this.service.dispatch(id, dto, user.id);
  }

  @Post(':id/start')
  @Roles(UserRole.DRIVER)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.start(id, user.id);
  }

  @Patch(':id/stops/:stopId')
  @Roles(UserRole.DRIVER, UserRole.ADMIN, UserRole.DISPATCHER)
  updateStop(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @Body() dto: UpdateDeliveryRouteStopDto,
  ) {
    return this.service.updateStop(id, stopId, dto, user.id);
  }

  @Post(':id/complete')
  @Roles(UserRole.DRIVER, UserRole.ADMIN, UserRole.DISPATCHER)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteDeliveryRouteDto) {
    return this.service.complete(id, dto, user.id);
  }
}
