import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ServiceType, VehicleType } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { CreateVehicleDto, SetAccessoriesDto, UpdateVehicleDto, VehicleDocumentDto } from './vehicles.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  @Public()
  @Get('available')
  available(
    @Query('serviceType') serviceType?: ServiceType,
    @Query('vehicleType') vehicleType?: VehicleType,
  ) {
    return this.service.publicAvailable(serviceType, vehicleType);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.listMine(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.service.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<UpdateVehicleDto>) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }

  @Post(':id/activate')
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.activate(user.id, id);
  }

  @Post(':id/documents')
  document(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VehicleDocumentDto) {
    return this.service.addDocument(user.id, id, dto);
  }

  @Put(':id/accessories')
  accessories(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetAccessoriesDto) {
    return this.service.setAccessories(user.id, id, dto);
  }
}
