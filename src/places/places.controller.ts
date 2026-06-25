import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { PinPlaceDto, RecordPlaceDto, UpdatePlaceDto } from './places.dto';
import { PlacesService } from './places.service';

@ApiTags('Rider Places')
@ApiBearerAuth()
@Roles(UserRole.RIDER, UserRole.CUSTOMER)
@Controller(['users/me/places', 'riders/me/places'])
export class PlacesController {
  constructor(private readonly service: PlacesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope = 'all',
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    return this.service.list(user.id, scope, Number(page), Math.min(Math.max(Number(limit), 1), 100));
  }

  @Post()
  record(@CurrentUser() user: AuthUser, @Body() dto: RecordPlaceDto) {
    return this.service.record(user.id, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePlaceDto) {
    return this.service.update(user.id, id, dto);
  }

  @Post(':id/use')
  use(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markUsed(user.id, id);
  }

  @Post(':id/pin')
  pin(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PinPlaceDto) {
    return this.service.pin(user.id, id, dto);
  }

  @Delete(':id/pin')
  unpin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.unpin(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
