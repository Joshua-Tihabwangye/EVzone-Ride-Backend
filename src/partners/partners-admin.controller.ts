import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { Permission, RequirePermission } from '../permissions';
import { PartnerService } from './partner.service';
import {
  CreatePartnerDto,
  CreatePartnerApiKeyDto,
  PartnerListQueryDto,
  PartnerQuotaQueryDto,
  SetPartnerQuotaDto,
  UpdatePartnerDto,
} from './partners.dto';

@ApiTags('Admin Partners')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/partners')
export class PartnersAdminController {
  constructor(private readonly partnerService: PartnerService) {}

  @Get()
  @RequirePermission(Permission.PARTNER_ADMIN_READ)
  list(@Query() query: PartnerListQueryDto) {
    return this.partnerService.listPartners(query);
  }

  @Post()
  @RequirePermission(Permission.PARTNER_ADMIN_WRITE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePartnerDto) {
    return this.partnerService.createPartner(dto, user.id);
  }

  @Get(':id')
  @RequirePermission(Permission.PARTNER_ADMIN_READ)
  get(@Param('id') id: string) {
    return this.partnerService.getPartner(id);
  }

  @Patch(':id')
  @RequirePermission(Permission.PARTNER_ADMIN_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnerService.updatePartner(id, dto);
  }

  @Post(':id/rotate-key')
  @RequirePermission(Permission.PARTNER_ADMIN_WRITE)
  rotateKey(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreatePartnerApiKeyDto) {
    return this.partnerService.rotateApiKey(id, dto, user.id);
  }

  @Post(':id/revoke-key/:keyId')
  @RequirePermission(Permission.PARTNER_ADMIN_WRITE)
  revokeKey(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('keyId') keyId: string) {
    return this.partnerService.revokeApiKey(id, keyId, user.id);
  }

  @Get(':id/usage')
  @RequirePermission(Permission.PARTNER_ADMIN_READ)
  usage(@Param('id') id: string, @Query() query: PartnerQuotaQueryDto) {
    return this.partnerService.getUsage(id, query);
  }

  @Post(':id/quota')
  @RequirePermission(Permission.PARTNER_ADMIN_WRITE)
  setQuota(@Param('id') id: string, @Body() dto: SetPartnerQuotaDto) {
    return this.partnerService.setQuota(id, dto);
  }
}
