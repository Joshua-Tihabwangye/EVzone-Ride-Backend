import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { Permission, RequirePermission } from '../permissions';
import { AdminFinanceService } from './admin-finance.service';
import {
  AdminFinanceListQueryDto,
  CreateSettlementBatchDto,
  CreateWalletReconciliationDto,
  RefundPaymentAdminDto,
  ReviewCashoutAdminDto,
} from './admin-finance.dto';

@ApiTags('Admin Finance')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPPORT)
@Controller('admin-finance')
export class AdminFinanceController {
  constructor(private readonly service: AdminFinanceService) {}

  @Get('cashouts')
  @RequirePermission(Permission.FINANCE_CASHOUT_READ)
  listCashouts(@Query() query: AdminFinanceListQueryDto) {
    return this.service.listCashouts(query);
  }

  @Get('cashouts/:id')
  @RequirePermission(Permission.FINANCE_CASHOUT_READ)
  getCashout(@Param('id') id: string) {
    return this.service.getCashout(id);
  }

  @Patch('cashouts/:id/review')
  @RequirePermission(Permission.FINANCE_CASHOUT_REVIEW)
  reviewCashout(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewCashoutAdminDto) {
    return this.service.reviewCashout(id, user.id, dto);
  }

  @Get('payouts')
  @RequirePermission(Permission.FINANCE_PAYOUT_READ)
  listPayouts(@Query() query: AdminFinanceListQueryDto) {
    return this.service.listPayouts(query);
  }

  @Get('payouts/:id')
  @RequirePermission(Permission.FINANCE_PAYOUT_READ)
  getPayout(@Param('id') id: string) {
    return this.service.getPayout(id);
  }

  @Post('payouts/:id/retry')
  @RequirePermission(Permission.FINANCE_PAYOUT_RETRY)
  retryPayout(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.retryPayout(id, user.id);
  }

  @Get('payments')
  @RequirePermission(Permission.FINANCE_CASHOUT_READ)
  listPayments(@Query() query: AdminFinanceListQueryDto) {
    return this.service.listPayments(query);
  }

  @Post('payments/:id/refund')
  @RequirePermission(Permission.FINANCE_REFUND_CREATE)
  refundPayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RefundPaymentAdminDto) {
    return this.service.refundPayment(id, user.id, dto);
  }

  @Get('revenue')
  @RequirePermission(Permission.FINANCE_REVENUE_READ)
  revenue(@Query() query: AdminFinanceListQueryDto) {
    return this.service.revenueSummary(query);
  }

  @Get('revenue/summary')
  @RequirePermission(Permission.FINANCE_REVENUE_READ)
  revenueSummary(@Query() query: AdminFinanceListQueryDto) {
    return this.service.revenueSummary(query);
  }

  @Get('settlements')
  @RequirePermission(Permission.FINANCE_REVENUE_READ)
  listSettlements(@Query() query: AdminFinanceListQueryDto) {
    return this.service.listSettlements(query);
  }

  @Post('settlements')
  @RequirePermission(Permission.FINANCE_SETTLEMENT_WRITE)
  createSettlement(@CurrentUser() user: AuthUser, @Body() dto: CreateSettlementBatchDto) {
    return this.service.createSettlementBatch(user.id, dto);
  }

  @Get('settlements/:id')
  @RequirePermission(Permission.FINANCE_REVENUE_READ)
  getSettlement(@Param('id') id: string) {
    return this.service.getSettlement(id);
  }

  @Patch('settlements/:id/post')
  @RequirePermission(Permission.FINANCE_SETTLEMENT_WRITE)
  postSettlement(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.postSettlementBatch(id, user.id);
  }

  @Patch('settlements/:id/cancel')
  @RequirePermission(Permission.FINANCE_SETTLEMENT_WRITE)
  cancelSettlement(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelSettlementBatch(id, user.id);
  }

  @Get('wallet-reconciliation')
  @RequirePermission(Permission.FINANCE_REVENUE_READ)
  listWalletReconciliations(@Query() query: AdminFinanceListQueryDto) {
    return this.service.listWalletReconciliations(query);
  }

  @Post('wallet-reconciliation')
  @RequirePermission(Permission.FINANCE_SETTLEMENT_WRITE)
  createWalletReconciliation(@CurrentUser() user: AuthUser, @Body() dto: CreateWalletReconciliationDto) {
    return this.service.createWalletReconciliation(user.id, dto);
  }

  @Get('wallet-reconciliation/:id')
  @RequirePermission(Permission.FINANCE_REVENUE_READ)
  getWalletReconciliation(@Param('id') id: string) {
    return this.service.getWalletReconciliation(id);
  }
}
