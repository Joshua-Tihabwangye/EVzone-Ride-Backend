import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces';
import { TopUpDto, TransferDto, WithdrawDto } from './wallets.dto';
import { WalletsService } from './wallets.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletsController {
  constructor(private readonly service: WalletsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.get(user.id);
  }

  @Get('transactions')
  transactions(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.listTransactions(user.id, Number(page), Math.min(Number(limit), 100));
  }

  @Post('top-up')
  topUp(@CurrentUser() user: AuthUser, @Body() dto: TopUpDto) {
    return this.service.topUp(user.id, dto.amount, dto.providerToken);
  }

  @Post('transfer')
  transfer(@CurrentUser() user: AuthUser, @Body() dto: TransferDto) {
    return this.service.transfer(user.id, dto.recipient, dto.amount, dto.note);
  }

  @Post('withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto) {
    return this.service.withdraw(user.id, dto.amount, dto.destination);
  }
}
