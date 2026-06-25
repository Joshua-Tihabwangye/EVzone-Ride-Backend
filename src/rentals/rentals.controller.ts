import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  CreateRentalBookingDto,
  ExtendRentalDto,
  RentalActionDto,
  RentalInspectionDto,
  RentalQuoteDto,
  RentalSearchDto,
} from './rentals.dto';
import { RentalsService } from './rentals.service';

@ApiTags('Car Rental')
@ApiBearerAuth()
@Controller('rentals')
export class RentalsController {
  constructor(private readonly service: RentalsService) {}

  @Public()
  @Post('search')
  search(@Body() dto: RentalSearchDto) {
    return this.service.search(dto);
  }

  @Public()
  @Post('quote')
  quote(@Body() dto: RentalQuoteDto) {
    return this.service.quote(dto);
  }

  @Post('bookings')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRentalBookingDto) {
    return this.service.create(user.id, dto);
  }

  @Get('bookings')
  list(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.list(user, Number(page), Math.min(Number(limit), 100));
  }

  @Get('bookings/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  @Post('bookings/:id/confirm')
  @Roles(UserRole.RENTAL_PARTNER, UserRole.ADMIN)
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.ownerAction(user, id, true);
  }

  @Post('bookings/:id/reject')
  @Roles(UserRole.RENTAL_PARTNER, UserRole.ADMIN)
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RentalActionDto) {
    return this.service.ownerAction(user, id, false, dto);
  }

  @Post('bookings/:id/inspections')
  inspect(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RentalInspectionDto) {
    return this.service.inspect(user, id, dto);
  }

  @Post('bookings/:id/extend')
  extend(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExtendRentalDto) {
    return this.service.extend(user.id, id, dto);
  }

  @Post('bookings/:id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RentalActionDto) {
    return this.service.complete(user, id, dto);
  }

  @Post('bookings/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RentalActionDto) {
    return this.service.cancel(user, id, dto);
  }
}
