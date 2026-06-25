import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AgentAssessmentSubmissionDto,
  AgentPortalListQueryDto,
  AgentQaReviewDto,
  AgentRoleDto,
  AgentShiftDto,
  AgentTeamDto,
} from './agent-portal.dto';
import { AgentPortalService } from './agent-portal.service';

const AGENT_PORTAL_ROLES = [UserRole.AGENT, UserRole.DISPATCHER, UserRole.SUPPORT, UserRole.ADMIN];

@ApiTags('Agent Portal v7 - Training, QA & Administration')
@ApiBearerAuth()
@Roles(...AGENT_PORTAL_ROLES)
@Controller('agent')
export class AgentPortalSettingsController {
  constructor(private readonly service: AgentPortalService) {}

  @Get('training')
  training(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.trainingCentre(user, organizationId);
  }

  @Get('training/modules')
  trainingModules(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.trainingCentre(user, organizationId);
  }

  @Get('training/modules/:moduleId')
  trainingModule(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.trainingModule(user, moduleId, organizationId);
  }

  @Post('training/modules/:moduleId/start')
  startTrainingModule(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.trainingModule(user, moduleId, organizationId);
  }

  @Post('training/modules/:moduleId/assessment')
  submitAssessment(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Body() dto: AgentAssessmentSubmissionDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.submitAssessment(user, moduleId, dto, organizationId);
  }

  @Get('training/certificates/:moduleId')
  certificate(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.trainingCertificate(user, moduleId, organizationId);
  }

  @Get('qa/reviews')
  qaReviews(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listQaReviews(user, query, organizationId);
  }

  @Post('qa/reviews')
  createQaReview(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentQaReviewDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createQaReview(user, dto, organizationId);
  }

  @Get('qa/reviews/:reviewId')
  qaReview(
    @CurrentUser() user: AuthUser,
    @Param('reviewId') reviewId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.qaReview(user, reviewId, organizationId);
  }

  @Patch('qa/reviews/:reviewId')
  updateQaReview(
    @CurrentUser() user: AuthUser,
    @Param('reviewId') reviewId: string,
    @Body() dto: AgentQaReviewDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateQaReview(user, reviewId, dto, organizationId);
  }

  @Get('settings/teams')
  teams(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.listTeams(user, organizationId);
  }

  @Post('settings/teams')
  createTeam(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentTeamDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createTeam(user, dto, organizationId);
  }

  @Get('settings/teams/:teamId')
  team(
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.teamDetail(user, teamId, organizationId);
  }

  @Patch('settings/teams/:teamId')
  updateTeam(
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: AgentTeamDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateTeam(user, teamId, dto, organizationId);
  }

  @Get('settings/roles')
  roles(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.listRoles(user, organizationId);
  }

  @Post('settings/roles')
  createRole(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentRoleDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createRole(user, dto, organizationId);
  }

  @Patch('settings/roles/:roleId')
  updateRole(
    @CurrentUser() user: AuthUser,
    @Param('roleId') roleId: string,
    @Body() dto: AgentRoleDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateRole(user, roleId, dto, organizationId);
  }

  @Get('settings/shifts')
  shifts(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listShifts(user, query, organizationId);
  }

  @Post('settings/shifts')
  createShift(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentShiftDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createShift(user, dto, organizationId);
  }

  @Post('settings/shifts/:shiftId/check-in')
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param('shiftId') shiftId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.shiftAction(user, shiftId, 'CHECK_IN', organizationId);
  }

  @Post('settings/shifts/:shiftId/check-out')
  checkOut(
    @CurrentUser() user: AuthUser,
    @Param('shiftId') shiftId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.shiftAction(user, shiftId, 'CHECK_OUT', organizationId);
  }

  @Get('settings/agents')
  @ApiOperation({ summary: 'List agents and their portal profiles for team, shift and role administration' })
  agents(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.agents(user, organizationId);
  }
}
