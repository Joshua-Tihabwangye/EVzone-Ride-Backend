import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import {
  CorporatePayAuthorizationDto,
  CorporatePayEventAckDto,
  CorporatePayPartnerCancelDto,
  CorporatePayPartnerListQueryDto,
  CorporatePayPartnerQuoteDto,
  CorporatePayPartnerRefundDto,
  CorporatePayRebookDto,
  CorporatePayReconciliationExportQueryDto,
  CorporatePaySubjectLinkDto,
  CorporatePaySustainabilityQueryDto,
  CreateCorporatePayDisputeDto,
  CreateCorporatePayEvidenceDto,
  CreateCorporatePayPartnerRequestDto,
  UpdateCorporatePayDisputeDto,
} from './corporate-integration.dto';
import { CorporateIntegrationService } from './corporate-integration.service';
import { CorporatePayPartnerGuard } from './corporate-partner.guard';

@ApiTags('CorporatePay Partner API v9')
@ApiHeader({ name: 'x-corporatepay-client-id', required: false })
@ApiHeader({ name: 'x-corporatepay-timestamp', required: false })
@ApiHeader({ name: 'x-corporatepay-nonce', required: false })
@ApiHeader({ name: 'x-corporatepay-signature', required: false })
@ApiHeader({ name: 'x-corporatepay-api-key', required: false, description: 'Sandbox only' })
@Public()
@UseGuards(CorporatePayPartnerGuard)
@Controller('corporate-pay/partner')
export class CorporateIntegrationController {
  constructor(private readonly service: CorporateIntegrationService) {}

  @Get('capabilities')
  capabilities() {
    return this.service.capabilities();
  }

  @Get('catalog')
  catalog() {
    return this.service.catalog();
  }

  @Post('subject-links')
  linkSubject(@Body() dto: CorporatePaySubjectLinkDto) {
    return this.service.linkSubject(dto);
  }

  @Post('quotes')
  quote(@Body() dto: CorporatePayPartnerQuoteDto) {
    return this.service.quote(dto);
  }

  @Post('service-requests')
  createRequest(@Body() dto: CreateCorporatePayPartnerRequestDto) {
    return this.service.createRequest(dto);
  }

  @Get('service-requests')
  listRequests(@Query() query: CorporatePayPartnerListQueryDto) {
    return this.service.listRequests(query);
  }

  @Get('service-requests/:externalRequestId')
  detail(
    @Param('externalRequestId') externalRequestId: string,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.detail(externalRequestId, organizationId, externalOrganizationId);
  }

  @Post('service-requests/:externalRequestId/authorization')
  authorize(
    @Param('externalRequestId') externalRequestId: string,
    @Body() dto: CorporatePayAuthorizationDto,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.authorize(externalRequestId, dto, organizationId, externalOrganizationId);
  }

  @Post('service-requests/:externalRequestId/provision')
  provision(
    @Param('externalRequestId') externalRequestId: string,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.provision(externalRequestId, organizationId, externalOrganizationId);
  }

  @Post('service-requests/:externalRequestId/refresh-quote')
  refreshQuote(
    @Param('externalRequestId') externalRequestId: string,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.refreshQuote(externalRequestId, organizationId, externalOrganizationId);
  }

  @Post('service-requests/:externalRequestId/cancel')
  cancel(
    @Param('externalRequestId') externalRequestId: string,
    @Body() dto: CorporatePayPartnerCancelDto,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.cancel(externalRequestId, dto, organizationId, externalOrganizationId);
  }

  @Post('service-requests/:externalRequestId/sync')
  sync(
    @Param('externalRequestId') externalRequestId: string,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.sync(externalRequestId, organizationId, externalOrganizationId);
  }

  @Post('service-requests/:externalRequestId/rebook')
  rebook(
    @Param('externalRequestId') externalRequestId: string,
    @Body() dto: CorporatePayRebookDto,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.rebook(externalRequestId, dto, organizationId, externalOrganizationId);
  }

  @Post('service-requests/:externalRequestId/refund')
  refund(
    @Param('externalRequestId') externalRequestId: string,
    @Body() dto: CorporatePayPartnerRefundDto,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.refund(externalRequestId, dto, organizationId, externalOrganizationId);
  }

  @Get('service-requests/:externalRequestId/receipt')
  receipt(
    @Param('externalRequestId') externalRequestId: string,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.receipt(externalRequestId, organizationId, externalOrganizationId);
  }

  @Post('service-requests/:externalRequestId/evidence')
  addEvidence(
    @Param('externalRequestId') externalRequestId: string,
    @Body() dto: CreateCorporatePayEvidenceDto,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.addEvidence(externalRequestId, dto, organizationId, externalOrganizationId);
  }

  @Get('service-requests/:externalRequestId/evidence')
  listEvidence(
    @Param('externalRequestId') externalRequestId: string,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.listEvidence(externalRequestId, organizationId, externalOrganizationId);
  }

  @Post('service-requests/:externalRequestId/disputes')
  createDispute(
    @Param('externalRequestId') externalRequestId: string,
    @Body() dto: CreateCorporatePayDisputeDto,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.createDispute(externalRequestId, dto, organizationId, externalOrganizationId);
  }

  @Get('service-requests/:externalRequestId/disputes')
  listDisputes(
    @Param('externalRequestId') externalRequestId: string,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.listDisputes(externalRequestId, organizationId, externalOrganizationId);
  }

  @Patch('service-requests/:externalRequestId/disputes/:disputeId')
  updateDispute(
    @Param('externalRequestId') externalRequestId: string,
    @Param('disputeId') disputeId: string,
    @Body() dto: UpdateCorporatePayDisputeDto,
    @Query('organizationId') organizationId?: string,
    @Query('externalOrganizationId') externalOrganizationId?: string,
  ) {
    return this.service.updateDispute(
      externalRequestId,
      disputeId,
      dto,
      organizationId,
      externalOrganizationId,
    );
  }

  @Get('sustainability')
  sustainability(@Query() query: CorporatePaySustainabilityQueryDto) {
    return this.service.sustainability(query);
  }

  @Get('reconciliation/export')
  reconciliationExport(@Query() query: CorporatePayReconciliationExportQueryDto) {
    return this.service.reconciliationExport(query);
  }

  @Get('events')
  events(@Query('after') after?: string, @Query('limit') limit = '100') {
    return this.service.listEvents(after, Number(limit));
  }

  @Post('events/:id/ack')
  acknowledgeEvent(@Param('id') id: string, @Body() dto: CorporatePayEventAckDto) {
    return this.service.acknowledgeEvent(id, dto);
  }
}
