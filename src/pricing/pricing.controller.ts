import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CreatePricingRuleDto, CreatePromoCodeDto, CreateSurgeZoneDto, QuoteDto } from './pricing.dto';
import { PricingService } from './pricing.service';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly service: PricingService) {}

  @Public()
  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.service.quote(dto);
  }

  @ApiBearerAuth()
  @Get('rules')
  @Roles(UserRole.ADMIN)
  rules() {
    return this.service.listRules();
  }

  @ApiBearerAuth()
  @Post('rules')
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreatePricingRuleDto) {
    return this.service.createRule(dto);
  }

  @ApiBearerAuth()
  @Patch('rules/:id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: Partial<CreatePricingRuleDto>) {
    return this.service.updateRule(id, dto);
  }

  @ApiBearerAuth()
  @Delete('rules/:id')
  @Roles(UserRole.ADMIN)
  delete(@Param('id') id: string) {
    return this.service.deleteRule(id);
  }
  @ApiBearerAuth()
  @Get('surges')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER)
  surges() {
    return this.service.listSurges();
  }

  @ApiBearerAuth()
  @Post('surges')
  @Roles(UserRole.ADMIN)
  createSurge(@Body() dto: CreateSurgeZoneDto) {
    return this.service.createSurge(dto);
  }

  @ApiBearerAuth()
  @Patch('surges/:id')
  @Roles(UserRole.ADMIN)
  updateSurge(@Param('id') id: string, @Body() dto: Partial<CreateSurgeZoneDto>) {
    return this.service.updateSurge(id, dto);
  }

  @ApiBearerAuth()
  @Delete('surges/:id')
  @Roles(UserRole.ADMIN)
  deleteSurge(@Param('id') id: string) {
    return this.service.deleteSurge(id);
  }

  @ApiBearerAuth()
  @Get('promos')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  promos() {
    return this.service.listPromos();
  }

  @ApiBearerAuth()
  @Post('promos')
  @Roles(UserRole.ADMIN)
  createPromo(@Body() dto: CreatePromoCodeDto) {
    return this.service.createPromo(dto);
  }

  @ApiBearerAuth()
  @Patch('promos/:id')
  @Roles(UserRole.ADMIN)
  updatePromo(@Param('id') id: string, @Body() dto: Partial<CreatePromoCodeDto>) {
    return this.service.updatePromo(id, dto);
  }

  @ApiBearerAuth()
  @Delete('promos/:id')
  @Roles(UserRole.ADMIN)
  deletePromo(@Param('id') id: string) {
    return this.service.deletePromo(id);
  }
}
