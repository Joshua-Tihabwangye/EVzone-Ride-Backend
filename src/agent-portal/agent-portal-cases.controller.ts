import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  AgentIncidentActionDto,
  AgentIncidentDto,
  AgentOnboardingActionDto,
  AgentPortalListQueryDto,
  AgentSupportTicketDto,
  AgentTicketActionDto,
  AgentTicketMessageDto,
} from './agent-portal.dto';
import { AgentPortalService } from './agent-portal.service';

const AGENT_PORTAL_ROLES = [UserRole.AGENT, UserRole.DISPATCHER, UserRole.SUPPORT, UserRole.ADMIN];

@ApiTags('Agent Portal v7 - Onboarding, Support & Safety')
@ApiBearerAuth()
@Roles(...AGENT_PORTAL_ROLES)
@Controller('agent')
export class AgentPortalCasesController {
  constructor(private readonly service: AgentPortalService) {}

  @Get('onboarding')
  onboardingQueue(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listOnboardingCases(user, query, organizationId);
  }

  @Get('onboarding/drivers')
  onboardingDrivers(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listOnboardingCases(user, query, organizationId);
  }

  @Get('onboarding/cases/:caseId')
  onboardingCase(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.onboardingCase(user, caseId, organizationId);
  }

  @Post('onboarding/cases/:caseId/actions')
  onboardingAction(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: AgentOnboardingActionDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.onboardingAction(user, caseId, dto, organizationId);
  }

  @Post('onboarding/cases/:caseId/approve')
  approveOnboarding(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() body: { note?: string },
    @Headers('x-organization-id') organizationId?: string,
  ) {
    const dto = new AgentOnboardingActionDto();
    dto.action = 'APPROVE';
    dto.note = body.note;
    return this.service.onboardingAction(user, caseId, dto, organizationId);
  }

  @Post('onboarding/cases/:caseId/reject')
  rejectOnboarding(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() body: { note?: string },
    @Headers('x-organization-id') organizationId?: string,
  ) {
    const dto = new AgentOnboardingActionDto();
    dto.action = 'REJECT';
    dto.note = body.note;
    return this.service.onboardingAction(user, caseId, dto, organizationId);
  }

  @Get('support/tickets')
  tickets(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listSupportTickets(user, query, organizationId);
  }

  @Post('support/tickets')
  @ApiOperation({ summary: 'Create a support case on behalf of a rider, driver, fleet or company' })
  createTicket(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentSupportTicketDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createSupportTicket(user, dto, organizationId);
  }

  @Get('support/tickets/:ticketId')
  ticket(
    @CurrentUser() user: AuthUser,
    @Param('ticketId') ticketId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.supportTicket(user, ticketId, organizationId);
  }

  @Post('support/tickets/:ticketId/messages')
  addTicketMessage(
    @CurrentUser() user: AuthUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: AgentTicketMessageDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.addTicketMessage(user, ticketId, dto, organizationId);
  }

  @Patch('support/tickets/:ticketId')
  updateTicket(
    @CurrentUser() user: AuthUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: AgentTicketActionDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.ticketAction(user, ticketId, dto, organizationId);
  }

  @Post('support/tickets/:ticketId/actions')
  ticketAction(
    @CurrentUser() user: AuthUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: AgentTicketActionDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.ticketAction(user, ticketId, dto, organizationId);
  }

  @Get('safety/incidents')
  incidents(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.listSafetyIncidents(user, query, organizationId);
  }

  @Get('safety/sos')
  sosQueue(
    @CurrentUser() user: AuthUser,
    @Query() query: AgentPortalListQueryDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    query.category = 'SOS';
    return this.service.listSafetyIncidents(user, query, organizationId);
  }

  @Post('safety/incidents')
  createIncident(
    @CurrentUser() user: AuthUser,
    @Body() dto: AgentIncidentDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.createIncident(user, dto, organizationId);
  }

  @Get('safety/incidents/:incidentId')
  incident(
    @CurrentUser() user: AuthUser,
    @Param('incidentId') incidentId: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.safetyIncident(user, incidentId, organizationId);
  }

  @Post('safety/incidents/:incidentId/actions')
  incidentAction(
    @CurrentUser() user: AuthUser,
    @Param('incidentId') incidentId: string,
    @Body() dto: AgentIncidentActionDto,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.incidentAction(user, incidentId, dto, organizationId);
  }

  @Get('search')
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') query: string,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    return this.service.globalSearch(user, query, organizationId);
  }
}
