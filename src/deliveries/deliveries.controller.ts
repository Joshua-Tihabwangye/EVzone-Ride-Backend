import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';
import {
  CreateDeliveryDto,
  CreateTrackingInvitationDto,
  DeliveryActionDto,
  DeliveryFeedbackDto,
  EstimateDeliveryDto,
  VerifyDeliveryDropoffDto,
  VerifyDeliveryQrDto,
} from './deliveries.dto';
import { DeliveriesService } from './deliveries.service';

@ApiTags('Deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly service: DeliveriesService) {}

  @Post('estimate')
  estimate(@CurrentUser() user: AuthUser, @Body() dto: EstimateDeliveryDto) {
    return this.service.estimate(user.id, dto);
  }

  @Post()
  @RequireIdempotency()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeliveryDto) {
    return this.service.create(user.id, dto, user.activeOrganizationId);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope = 'delivering',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.list(user, scope, Number(page), Math.min(Number(limit), 100));
  }

  @Public()
  @Get('track/:trackingCode')
  track(@Param('trackingCode') trackingCode: string) {
    return this.service.track(trackingCode);
  }

  @Get('driver/requests')
  @Roles(UserRole.DRIVER)
  driverRequests(@CurrentUser() user: AuthUser) {
    return this.service.driverRequests(user.id);
  }

  @Post('driver/:id/accept')
  @Roles(UserRole.DRIVER)
  driverAccept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.driverAccept(user.id, id);
  }

  @Post('driver/:id/reject')
  @Roles(UserRole.DRIVER)
  driverReject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeliveryActionDto) {
    return this.service.driverReject(user.id, id, dto.reason);
  }

  @Post('driver/:id/arrive-pickup')
  @Roles(UserRole.DRIVER)
  arrivePickup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.arrivePickup(user.id, id);
  }

  @Post('driver/:id/verify-pickup')
  @Roles(UserRole.DRIVER)
  verifyPickup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VerifyDeliveryQrDto) {
    return this.service.verifyPickup(user.id, id, dto.token);
  }

  @Post('driver/:id/start-transit')
  @Roles(UserRole.DRIVER)
  startTransit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.startTransit(user.id, id);
  }

  @Post('driver/:id/arrive-dropoff')
  @Roles(UserRole.DRIVER)
  arriveDropoff(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.arriveDropoff(user.id, id);
  }

  @Post('driver/:id/verify-dropoff')
  @Roles(UserRole.DRIVER)
  verifyDropoff(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VerifyDeliveryDropoffDto,
  ) {
    return this.service.verifyDropoff(user.id, id, dto.code);
  }

  @Post('driver/:id/delivered')
  @Roles(UserRole.DRIVER)
  delivered(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeliveryActionDto) {
    return this.service.markDelivered(user.id, id, dto);
  }

  @Get('invitations')
  invitations(@CurrentUser() user: AuthUser, @Query('direction') direction = 'received') {
    return this.service.listInvitations(user, direction);
  }

  @Post('invitations/:id/accept')
  acceptInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.respondInvitation(user, id, true);
  }

  @Post('invitations/:id/reject')
  rejectInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.respondInvitation(user, id, false);
  }

  @Post('invitations/:id/withdraw')
  withdrawInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.withdrawInvitation(user.id, id);
  }

  @Get(':id/dropoff-code')
  dropoffCode(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.dropoffCode(user, id);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detailForUser(user, id);
  }

  @Post(':id/recipient/accept')
  recipientAccept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.recipientAction(user, id, true);
  }

  @Post(':id/recipient/reject')
  recipientReject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeliveryActionDto) {
    return this.service.recipientAction(user, id, false, dto.reason);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.complete(user.id, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeliveryActionDto) {
    return this.service.cancel(user, id, dto);
  }

  @Post(':id/invitations')
  invite(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateTrackingInvitationDto) {
    return this.service.createInvitation(user.id, id, dto);
  }

  @Post(':id/share')
  share(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { recipients?: Record<string, unknown>[] },
  ) {
    return this.service.createShare(user.id, id, body.recipients);
  }

  @Post(':id/feedback')
  feedback(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeliveryFeedbackDto) {
    return this.service.submitFeedback(user.id, id, dto);
  }
}
