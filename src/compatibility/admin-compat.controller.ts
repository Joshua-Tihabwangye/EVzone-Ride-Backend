import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminPortalService } from '../admin/admin-portal.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';

@ApiTags('Admin Compatibility API')
@ApiBearerAuth()
@Controller('admin')
@Roles(UserRole.ADMIN, UserRole.SUPPORT)
export class AdminCompatibilityController {
  constructor(private readonly portal: AdminPortalService) {}

  @Get('system/flags')
  flags(@Query('scope') scope?: string) {
    return this.portal.listFlags(scope);
  }

  @Patch('system/flags/:flagKey')
  @Roles(UserRole.ADMIN)
  patchFlag(
    @CurrentUser() user: AuthUser,
    @Param('flagKey') key: string,
    @Body() input: Record<string, unknown>,
  ) {
    return this.portal.patchFlag(key, input, user.id);
  }

  @Get('risk/cases')
  riskCases(@Query('status') status?: string, @Query('severity') severity?: string) {
    return this.portal.listRiskCases(status, severity);
  }

  @Get('risk/cases/:caseId')
  riskCase(@Param('caseId') id: string) {
    return this.portal.getRiskCase(id);
  }

  @Patch('risk/cases/:caseId')
  updateRisk(
    @CurrentUser() user: AuthUser,
    @Param('caseId') id: string,
    @Body() input: Record<string, unknown>,
  ) {
    return this.portal.patchRiskCase(id, input, user.id);
  }

  @Get('approvals')
  approvals(@Query('status') status?: string, @Query('entityType') entityType?: string) {
    return this.portal.listApprovals(status, entityType);
  }

  @Get('approvals/:approvalId')
  approvalDetail(@Param('approvalId') id: string) {
    return this.portal.getApproval(id);
  }

  @Patch('approvals/:approvalId')
  @Roles(UserRole.ADMIN)
  approval(
    @CurrentUser() user: AuthUser,
    @Param('approvalId') id: string,
    @Body() input: Record<string, unknown>,
  ) {
    return this.portal.patchApproval(id, input, user.id);
  }
}
