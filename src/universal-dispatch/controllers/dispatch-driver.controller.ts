import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { AuthUser } from '../../common/interfaces';
import { DispatchUnitService } from '../application/dispatch-unit.service';
import { UniversalOfferService } from '../application/universal-offer.service';
import { UniversalTripService } from '../application/universal-trip.service';
import {
  AcceptUniversalOfferDto,
  ArrivalDto,
  DeclineUniversalOfferDto,
  DispatchLocationUpdateDto,
  GoOfflineDto,
  GoOnlineDto,
  SetActiveDispatchVehicleDto,
  TransitionUniversalTripDto,
  VerifyUniversalTripCodeDto,
} from '../universal-dispatch.dto';

@ApiTags('Universal Dispatch - Driver')
@ApiBearerAuth()
@Controller('universal-dispatch/drivers')
export class DispatchDriverController {
  constructor(
    private readonly dispatchUnitService: DispatchUnitService,
    private readonly offerService: UniversalOfferService,
    private readonly tripService: UniversalTripService,
  ) {}

  private getIdempotencyKey(headers: Record<string, string>): string | undefined {
    return headers['idempotency-key'];
  }

  @Put('me/active-vehicle')
  @Roles(UserRole.DRIVER)
  async setActiveVehicle(@CurrentUser() user: AuthUser, @Body() dto: SetActiveDispatchVehicleDto) {
    return this.dispatchUnitService.setActiveVehicle(user.id, dto);
  }

  @Post('me/online')
  @Roles(UserRole.DRIVER)
  async goOnline(@CurrentUser() user: AuthUser, @Body() dto: GoOnlineDto) {
    return this.dispatchUnitService.goOnline(user.id, dto);
  }

  @Post('me/offline')
  @Roles(UserRole.DRIVER)
  async goOffline(@CurrentUser() user: AuthUser, @Body() dto: GoOfflineDto) {
    return this.dispatchUnitService.goOffline(user.id, dto);
  }

  @Post('me/location')
  @Roles(UserRole.DRIVER)
  async updateLocation(@CurrentUser() user: AuthUser, @Body() dto: DispatchLocationUpdateDto) {
    return this.dispatchUnitService.updateLocation(user.id, dto);
  }

  @Get('me/offers/active')
  @Roles(UserRole.DRIVER)
  async activeOffers() {
    return [];
  }

  @Post('offers/:offerId/accept')
  @Roles(UserRole.DRIVER)
  async acceptOffer(
    @CurrentUser() user: AuthUser,
    @Param('offerId') offerId: string,
    @Body() dto: AcceptUniversalOfferDto,
  ) {
    return this.offerService.accept(user.id, offerId, dto);
  }

  @Post('offers/:offerId/decline')
  @Roles(UserRole.DRIVER)
  async declineOffer(
    @CurrentUser() user: AuthUser,
    @Param('offerId') offerId: string,
    @Body() dto: DeclineUniversalOfferDto,
  ) {
    return this.offerService.decline(user.id, offerId, dto);
  }

  @Post('trips/:tripId/arrive-pickup')
  @Roles(UserRole.DRIVER)
  async arrivePickup(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: ArrivalDto,
  ) {
    return this.tripService.arrivePickup(user.id, tripId, dto);
  }

  @Post('trips/:tripId/verify-rider')
  @Roles(UserRole.DRIVER)
  async verifyRider(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: VerifyUniversalTripCodeDto,
  ) {
    return this.tripService.verifyRider(user.id, tripId, dto);
  }

  @Post('trips/:tripId/start')
  @Roles(UserRole.DRIVER)
  async startTrip(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: TransitionUniversalTripDto,
  ) {
    return this.tripService.transition(user.id, tripId, {
      ...dto,
      targetStatus: dto.targetStatus,
    });
  }

  @Post('trips/:tripId/arrive-stop')
  @Roles(UserRole.DRIVER)
  async arriveStop(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: TransitionUniversalTripDto,
  ) {
    return this.tripService.transition(user.id, tripId, dto);
  }

  @Post('trips/:tripId/complete-stop')
  @Roles(UserRole.DRIVER)
  async completeStop(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: TransitionUniversalTripDto,
  ) {
    return this.tripService.transition(user.id, tripId, dto);
  }

  @Post('trips/:tripId/complete')
  @Roles(UserRole.DRIVER)
  async completeTrip(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: TransitionUniversalTripDto,
  ) {
    return this.tripService.transition(user.id, tripId, dto);
  }

  @Post('trips/:tripId/cancel')
  @Roles(UserRole.DRIVER)
  async cancelTrip(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: TransitionUniversalTripDto,
  ) {
    return this.tripService.transition(user.id, tripId, dto);
  }

  @Post('deliveries/:deliveryId/verify-pickup-qr')
  @Roles(UserRole.DRIVER)
  async verifyPickupQr(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId') deliveryId: string,
    @Body() dto: VerifyUniversalTripCodeDto,
  ) {
    return this.tripService.verifyQr(user.id, deliveryId, dto);
  }

  @Post('deliveries/:deliveryId/confirm-pickup')
  @Roles(UserRole.DRIVER)
  async confirmPickup(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId') deliveryId: string,
    @Body() dto: TransitionUniversalTripDto,
  ) {
    return this.tripService.transition(user.id, deliveryId, dto);
  }

  @Post('deliveries/:deliveryId/verify-delivery-qr')
  @Roles(UserRole.DRIVER)
  async verifyDeliveryQr(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId') deliveryId: string,
    @Body() dto: VerifyUniversalTripCodeDto,
  ) {
    return this.tripService.verifyQr(user.id, deliveryId, dto);
  }

  @Post('deliveries/:deliveryId/confirm-delivery')
  @Roles(UserRole.DRIVER)
  async confirmDelivery(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId') deliveryId: string,
    @Body() dto: TransitionUniversalTripDto,
  ) {
    return this.tripService.transition(user.id, deliveryId, dto);
  }
}
