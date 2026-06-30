import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import {
  CommissionPreviewDto,
  CommissionRulesQueryDto,
  CreateCommissionRuleDto,
  UpdateCommissionRuleDto,
} from './commissioning.dto';
import { CommissioningService } from './commissioning.service';

@ApiTags('Admin Commission Rules')
@ApiBearerAuth()
@Controller('admin/commission-rules')
export class CommissioningController {
  constructor(private readonly service: CommissioningService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateCommissionRuleDto) {
    return this.service.createRule({
      ...dto,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
    });
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  list(@Query() query: CommissionRulesQueryDto) {
    return this.service.listRules(query.serviceType, query.active);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  get(@Param('id') id: string) {
    return this.service.getRule(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateCommissionRuleDto) {
    return this.service.updateRule(id, {
      ...dto,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
    });
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN)
  activate(@Param('id') id: string) {
    return this.service.setActive(id, true);
  }

  @Post(':id/deactivate')
  @Roles(UserRole.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.service.setActive(id, false);
  }

  @Post('preview')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  preview(@Body() dto: CommissionPreviewDto) {
    return this.service.computeCommission({
      serviceType: dto.serviceType,
      amount: dto.amount,
      currency: dto.currency,
      marketId: dto.marketId,
      organizationId: dto.organizationId,
      fleetId: dto.fleetId,
      vehicleType: dto.vehicleType,
      effectiveDate: new Date(),
    });
  }
}
