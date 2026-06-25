import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AgentChatMessageDto,
  AgentDraftCreateDto,
  AgentDraftUpdateDto,
  AgentPortalListQueryDto,
  AgentProfileUpdateDto,
  AgentTaskCreateDto,
  AgentTaskUpdateDto,
} from './agent-portal.dto';
import { AgentPortalService } from './agent-portal.service';

const AGENT_PORTAL_ROLES = [UserRole.AGENT, UserRole.DISPATCHER, UserRole.SUPPORT, UserRole.ADMIN];

@ApiTags('Agent Portal v7 - Workspace')
@ApiBearerAuth()
@Roles(...AGENT_PORTAL_ROLES)
@Controller('agent')
export class AgentPortalWorkspaceController {
  constructor(private readonly service: AgentPortalService) {}

  @Get('bootstrap')
  @ApiOperation({ summary: 'Hydrate the Agent Portal shell, permissions, counters and realtime contract' })
  bootstrap(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.bootstrap(user, organizationId);
  }

  @Get('dashboard')
  dashboard(
    @CurrentUser() user: AuthUser,
    @Query('period') period = '7d',
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.dashboard(user, period, organizationId);
  }

  @Get('analytics')
  analytics(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.analytics(user, query, organizationId);
  }

  @Get('supervisor')
  supervisor(
    @CurrentUser() user: AuthUser,
    @Query('period') period = '30d',
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.supervisorDashboard(user, period, organizationId);
  }

  @Get('profile')
  profile(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.profile(user, organizationId);
  }

  @Get('me/profile')
  myProfile(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.profile(user, organizationId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentProfileUpdateDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateProfile(user, dto, organizationId);
  }

  @Patch('me/profile')
  updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentProfileUpdateDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateProfile(user, dto, organizationId);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.profile(user, organizationId);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentProfileUpdateDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateProfile(user, dto, organizationId);
  }

  @Get('tasks')
  tasks(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listTasks(user, query, organizationId);
  }

  @Post('tasks')
  createTask(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentTaskCreateDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createTask(user, dto, organizationId);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: AgentTaskUpdateDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateTask(user, taskId, dto, organizationId);
  }

  @Post('tasks/:taskId/complete')
  completeTask(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    const dto = new AgentTaskUpdateDto();
    dto.status = 'COMPLETED';
    return this.service.updateTask(user, taskId, dto, organizationId);
  }

  @Delete('tasks/:taskId')
  deleteTask(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.deleteTask(user, taskId, organizationId);
  }

  @Get('drafts')
  drafts(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listDrafts(user, query, organizationId);
  }

  @Post('drafts')
  createDraft(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentDraftCreateDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createDraft(user, dto, organizationId);
  }

  @Patch('drafts/:draftId')
  updateDraft(
    @CurrentUser() user: AuthUser,
    @Param('draftId') draftId: string,
    @Body() dto: AgentDraftUpdateDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.updateDraft(user, draftId, dto, organizationId);
  }

  @Delete('drafts/:draftId')
  deleteDraft(
    @CurrentUser() user: AuthUser,
    @Param('draftId') draftId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.deleteDraft(user, draftId, organizationId);
  }

  @Get('agents')
  agents(@CurrentUser() user: AuthUser, @Headers('x-organization-id') organizationId?: string) {
    return this.service.agents(user, organizationId);
  }

  @Get('chats/:userId')
  chat(
    @CurrentUser() user: AuthUser,
    @Param('userId') otherUserId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.chatWithAgent(user, otherUserId, organizationId);
  }

  @Post('chats/:userId/messages')
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('userId') otherUserId: string,
    @Body() dto: AgentChatMessageDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.sendAgentChat(user, otherUserId, dto.message, dto.attachments, organizationId);
  }
}
