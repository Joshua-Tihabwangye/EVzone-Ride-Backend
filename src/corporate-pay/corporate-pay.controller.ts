import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ReconciliationStatus, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  CorporatePayRefundDto,
  CorporatePayWebhookDto,
  InitiateCorporatePayDto,
  LinkCorporatePayAccountDto,
  ReconcileCorporatePayDto,
  ResolveReconciliationDto,
  UpdateCorporatePayAccountDto,
  UpdateCorporatePayTransactionDto,
} from './corporate-pay.dto';
import { CorporatePayService } from './corporate-pay.service';

@ApiTags('CorporatePay Integration')
@ApiBearerAuth()
@Controller('corporate-pay')
export class CorporatePayController {
  constructor(private readonly service: CorporatePayService) {}

  @Public()
  @Post('webhooks')
  webhook(
    @Headers('x-corporatepay-signature') signature: string | undefined,
    @Body() dto: CorporatePayWebhookDto,
  ) {
    return this.service.webhook(JSON.stringify(dto), signature, dto);
  }

  @Post('accounts')
  linkAccount(@CurrentUser() user: AuthUser, @Body() dto: LinkCorporatePayAccountDto) {
    return this.service.linkAccount(user, dto);
  }

  @Get('accounts')
  accounts(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.service.listAccounts(user, organizationId);
  }

  @Patch('accounts/:id')
  updateAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCorporatePayAccountDto,
  ) {
    return this.service.updateAccount(user, id, dto);
  }

  @Post('transactions')
  initiate(@CurrentUser() user: AuthUser, @Body() dto: InitiateCorporatePayDto) {
    return this.service.initiate(user, dto);
  }

  @Get('transactions')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.list(user, organizationId, Number(page), Math.min(Number(limit), 100));
  }

  @Get('transactions/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  @Post('transactions/:id/refund')
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CorporatePayRefundDto) {
    return this.service.refund(user, id, dto);
  }

  @Post('sandbox/:id/approve')
  sandboxApprove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.sandboxApprove(user, id);
  }

  @Post('sandbox/:id/decline')
  sandboxDecline(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.sandboxDecline(user, id, body.reason);
  }

  @Patch('admin/transactions/:id')
  @Roles(UserRole.ADMIN)
  adminUpdate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCorporatePayTransactionDto,
  ) {
    return this.service.adminUpdate(user, id, dto);
  }

  @Post('reconciliations')
  reconcile(@CurrentUser() user: AuthUser, @Body() dto: ReconcileCorporatePayDto) {
    return this.service.reconcile(user, dto);
  }

  @Get('reconciliations')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  reconciliations(@CurrentUser() user: AuthUser, @Query('status') status?: ReconciliationStatus) {
    return this.service.listReconciliations(user, status);
  }

  @Patch('reconciliations/:id')
  @Roles(UserRole.ADMIN)
  resolveReconciliation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveReconciliationDto,
  ) {
    return this.service.resolveReconciliation(user, id, dto);
  }

  @Get('dashboard/summary')
  dashboard(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.service.dashboard(user, organizationId);
  }
}
