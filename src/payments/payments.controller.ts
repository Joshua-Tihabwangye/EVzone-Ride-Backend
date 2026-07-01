import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { Permission, RequirePermission } from '../permissions';
import { AuthUser } from '../common/interfaces';
import { ConfirmPaymentDto, CreatePaymentDto, RefundPaymentDto } from './payments.dto';
import { PaymentProviderFactory } from './providers/payment-provider.factory';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly providers: PaymentProviderFactory,
  ) {}

  @Get('providers/status')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  providerStatus() {
    return this.providers.status();
  }

  @Post('intents')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.service.createIntent(user.id, dto);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ConfirmPaymentDto) {
    return this.service.confirm(user.id, id, dto.providerToken);
  }

  @Post(':id/refund')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @RequirePermission(Permission.FINANCE_REFUND_CREATE)
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RefundPaymentDto) {
    return this.service.refund(user.id, id, dto.amount, dto.reason);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.list(user.id, Number(page), Math.min(Number(limit), 100));
  }
}
