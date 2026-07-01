import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CashoutRequestStatus, UserRole } from '../common/enums';
import { Permission, RequirePermission } from '../permissions';
import { AuthUser } from '../common/interfaces';
import { CreateCashoutRequestDto, ReviewCashoutRequestDto } from './financial-operations.dto';
import { FinancialOperationsService } from './financial-operations.service';

@ApiTags('Cashouts')
@ApiBearerAuth()
@Controller('cashouts')
export class CashoutsController {
  constructor(private readonly service: FinancialOperationsService) {}

  @Post()
  request(@CurrentUser() user: AuthUser, @Body() dto: CreateCashoutRequestDto) {
    return this.service.requestCashout(user.id, dto, user.activeOrganizationId);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.listMyCashouts(user.id);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelCashout(user.id, id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @RequirePermission(Permission.FINANCE_CASHOUT_READ)
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.listCashouts(
      status as CashoutRequestStatus,
      user.isPlatformAdmin ? undefined : user.activeOrganizationId,
    );
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN)
  @RequirePermission(Permission.FINANCE_CASHOUT_REVIEW)
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReviewCashoutRequestDto) {
    return this.service.reviewCashout(id, user.id, dto);
  }
}
