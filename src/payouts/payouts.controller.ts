import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payout } from '../database/entities';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { PayoutStatus, UserRole } from '../common/enums';
import { PayoutOrchestratorService } from './payout-orchestrator.service';
import { PayoutStatusService } from './payout-status.service';
import { PayoutProviderFactory } from './providers/payout-provider.factory';

@ApiTags('Admin Payouts')
@ApiBearerAuth()
@Controller('admin/payouts')
export class PayoutsController {
  constructor(
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    private readonly orchestrator: PayoutOrchestratorService,
    private readonly statusService: PayoutStatusService,
    private readonly providerFactory: PayoutProviderFactory,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  async list(
    @Query('status') status?: PayoutStatus,
    @Query('provider') provider?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (provider) where.provider = provider;
    if (from || to) {
      where.createdAt = {} as Record<string, Date>;
      if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
    }
    const [items, total] = await this.payouts.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    return {
      items,
      meta: { page: Number(page), limit: Number(limit), total, pageCount: Math.ceil(total / Number(limit)) },
    };
  }

  @Get('status')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  status() {
    return this.providerFactory.status();
  }

  @Post(':id/verify')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  verify(@Param('id') id: string) {
    return this.statusService.verifyPayout(id);
  }

  @Post(':id/retry')
  @Roles(UserRole.ADMIN)
  retry(@Param('id') id: string) {
    return this.orchestrator.retryPayout(id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN)
  cancel(@Param('id') id: string) {
    return this.orchestrator.cancelPayout(id);
  }
}
