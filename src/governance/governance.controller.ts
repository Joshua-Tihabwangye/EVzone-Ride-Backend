import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  CreateApprovalDto,
  CreateRiskCaseDto,
  DecideApprovalDto,
  ResolveOperationalAlertDto,
  UpdateRiskCaseDto,
  UpsertFeatureFlagDto,
  UpsertServiceConfigurationDto,
} from './governance.dto';
import { GovernanceService } from './governance.service';

@ApiTags('Governance & Risk')
@ApiBearerAuth()
@Controller('governance')
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}

  @Get('feature-flags')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  flags(@Query('scope') scope?: string) {
    return this.service.listFlags(scope);
  }

  @Get('feature-flags/:key/evaluate')
  evaluate(@Param('key') key: string, @Query('scope') scope?: string) {
    return this.service.evaluateFlag(key, scope);
  }

  @Post('feature-flags')
  @Roles(UserRole.ADMIN)
  upsertFlag(@CurrentUser() user: AuthUser, @Body() dto: UpsertFeatureFlagDto) {
    return this.service.upsertFlag(user.id, dto);
  }

  @Post('approvals')
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPPORT,
    UserRole.FLEET_PARTNER,
    UserRole.FLEET_MANAGER,
    UserRole.AGENT,
    UserRole.DISPATCHER,
  )
  requestApproval(@CurrentUser() user: AuthUser, @Body() dto: CreateApprovalDto) {
    return this.service.createApproval(user.id, dto);
  }

  @Get('approvals')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  approvals(@Query('status') status?: string, @Query('entityType') entityType?: string) {
    return this.service.listApprovals(status, entityType);
  }

  @Patch('approvals/:id/decision')
  @Roles(UserRole.ADMIN)
  decide(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: DecideApprovalDto) {
    return this.service.decideApproval(id, user.id, dto);
  }

  @Post('risk-cases')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  createRisk(@Body() dto: CreateRiskCaseDto) {
    return this.service.createRiskCase(dto);
  }

  @Get('risk-cases')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  riskCases(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.service.listRiskCases(status, severity, subjectId);
  }

  @Patch('risk-cases/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  updateRisk(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateRiskCaseDto) {
    return this.service.updateRiskCase(id, user.id, dto);
  }

  @Get('service-configurations')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  configurations() {
    return this.service.listServiceConfigurations();
  }

  @Post('service-configurations')
  @Roles(UserRole.ADMIN)
  upsertConfiguration(@CurrentUser() user: AuthUser, @Body() dto: UpsertServiceConfigurationDto) {
    return this.service.upsertServiceConfiguration(user.id, dto);
  }

  @Get('operational-alerts')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER)
  alerts(@Query('status') status?: string, @Query('severity') severity?: string) {
    return this.service.listAlerts(status, severity);
  }

  @Patch('operational-alerts/:id/acknowledge')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER)
  acknowledge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.acknowledgeAlert(id, user.id);
  }

  @Patch('operational-alerts/:id/resolve')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  resolve(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ResolveOperationalAlertDto) {
    return this.service.resolveAlert(id, user.id, dto.notes);
  }
}
