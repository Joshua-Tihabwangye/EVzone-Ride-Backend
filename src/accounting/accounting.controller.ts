import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { AccountingPeriodService } from './accounting-period.service';
import { ClosePeriodDto, PostJournalDto } from './accounting.dto';
import { AccountingService } from './accounting.service';

@ApiTags('Accounting & Double-Entry Ledger')
@ApiBearerAuth()
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly service: AccountingService,
    private readonly periodService: AccountingPeriodService,
  ) {}

  @Get('earnings/me')
  earnings(@CurrentUser() user: AuthUser, @Query('limit') limit = '100') {
    return this.service.earningsForUser(user.id, Number(limit));
  }

  @Get('accounts')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  accounts(@Query('limit') limit = '500') {
    return this.service.listAccounts(Number(limit));
  }

  @Get('journals')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  journals(@Query('limit') limit = '100') {
    return this.service.listJournals(Number(limit));
  }

  @Get('journals/:idOrReference')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  journal(@Param('idOrReference') idOrReference: string) {
    return this.service.detail(idOrReference);
  }

  @Get('trial-balance')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  trialBalance(
    @Query('currency') currency = 'UGX',
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.service.trialBalance(
      currency,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Post('periods/close')
  @Roles(UserRole.ADMIN)
  closePeriod(@CurrentUser() user: AuthUser, @Body() dto: ClosePeriodDto) {
    return this.periodService.closePeriod(dto.year, dto.month, user.id);
  }

  @Post('periods/reopen')
  @Roles(UserRole.ADMIN)
  reopenPeriod(@Body() dto: ClosePeriodDto) {
    return this.periodService.reopenPeriod(dto.year, dto.month);
  }

  @Post('journals')
  @Roles(UserRole.ADMIN)
  postJournal(@Body() dto: PostJournalDto) {
    return this.service.postJournal(dto);
  }

  @Post('journals/:reference/reverse')
  @Roles(UserRole.ADMIN)
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
    @Body() body: { reason: string },
  ) {
    return this.service.reverse(reference, body.reason, user.id);
  }
}
