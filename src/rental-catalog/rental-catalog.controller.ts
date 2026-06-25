import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  CreateCustomRentalRequestDto,
  CreateRentalBranchDto,
  CreateRentalVehicleClassDto,
  QuoteCustomRentalRequestDto,
  RejectCustomRentalRequestDto,
  UpdateRentalBranchDto,
  UpdateRentalVehicleClassDto,
} from './rental-catalog.dto';
import { RentalCatalogService } from './rental-catalog.service';

@ApiTags('Car Rental Catalog & Custom Requests')
@ApiBearerAuth()
@Controller('rentals')
export class RentalCatalogController {
  constructor(private readonly service: RentalCatalogService) {}

  @Public()
  @Get('branches')
  branches(@Query('city') city?: string) {
    return this.service.listBranches(city);
  }

  @Public()
  @Get('branches/:id')
  branch(@Param('id') id: string) {
    return this.service.branch(id);
  }

  @Post('branches')
  @Roles(UserRole.RENTAL_PARTNER, UserRole.FLEET_PARTNER, UserRole.ADMIN)
  createBranch(@CurrentUser() user: AuthUser, @Body() dto: CreateRentalBranchDto) {
    return this.service.createBranch(user, dto);
  }

  @Patch('branches/:id')
  @Roles(UserRole.RENTAL_PARTNER, UserRole.FLEET_PARTNER, UserRole.ADMIN)
  updateBranch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRentalBranchDto) {
    return this.service.updateBranch(user, id, dto);
  }

  @Public()
  @Get('vehicle-classes')
  classes(@Query('branchId') branchId?: string, @Query('vehicleType') vehicleType?: string) {
    return this.service.listClasses(branchId, vehicleType);
  }

  @Public()
  @Get('vehicle-classes/:id')
  vehicleClass(@Param('id') id: string) {
    return this.service.vehicleClass(id);
  }

  @Post('vehicle-classes')
  @Roles(UserRole.RENTAL_PARTNER, UserRole.FLEET_PARTNER, UserRole.ADMIN)
  createClass(@CurrentUser() user: AuthUser, @Body() dto: CreateRentalVehicleClassDto) {
    return this.service.createClass(user, dto);
  }

  @Patch('vehicle-classes/:id')
  @Roles(UserRole.RENTAL_PARTNER, UserRole.FLEET_PARTNER, UserRole.ADMIN)
  updateClass(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRentalVehicleClassDto,
  ) {
    return this.service.updateClass(user, id, dto);
  }

  @Post('custom-requests')
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomRentalRequestDto) {
    return this.service.createRequest(user.id, dto);
  }

  @Get('custom-requests')
  listRequests(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.listRequests(user, status, Number(page), Math.min(Number(limit), 100));
  }

  @Get('custom-requests/:id')
  request(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.requestDetail(user, id);
  }

  @Post('custom-requests/:id/quote')
  @Roles(
    UserRole.RENTAL_PARTNER,
    UserRole.FLEET_PARTNER,
    UserRole.FLEET_MANAGER,
    UserRole.ADMIN,
    UserRole.SUPPORT,
  )
  quote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: QuoteCustomRentalRequestDto) {
    return this.service.quote(user, id, dto);
  }

  @Post('custom-requests/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.accept(user.id, id);
  }

  @Post('custom-requests/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectCustomRentalRequestDto) {
    return this.service.reject(user, id, dto);
  }
}
