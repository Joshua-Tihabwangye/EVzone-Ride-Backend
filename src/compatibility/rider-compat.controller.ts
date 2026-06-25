import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { FinancialOperationsService } from '../financial-operations/financial-operations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePaymentDto } from '../payments/payments.dto';
import { PaymentsService } from '../payments/payments.service';
import { CancelRideDto, CreateRideDto, EstimateRideDto } from '../rides/rides.dto';
import { RidesService } from '../rides/rides.service';
import { CreateEmergencyDto } from '../safety/safety.dto';
import { SafetyService } from '../safety/safety.service';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';

@ApiTags('Rider Compatibility API')
@ApiBearerAuth()
@Controller('riders/me')
@Roles(UserRole.RIDER, UserRole.CUSTOMER, UserRole.ADMIN)
export class RiderCompatibilityController {
  constructor(
    private readonly users: UsersService,
    private readonly rides: RidesService,
    private readonly notifications: NotificationsService,
    private readonly wallets: WalletsService,
    private readonly payments: PaymentsService,
    private readonly financial: FinancialOperationsService,
    private readonly safety: SafetyService,
  ) {}

  @Get('bootstrap')
  async bootstrap(@CurrentUser() user: AuthUser) {
    const [profile, activeTrips, wallet, notifications, paymentMethods] = await Promise.all([
      this.users.profile(user.id),
      this.rides.list(user, 'active', 1, 20),
      this.wallets.get(user.id),
      this.notifications.list(user.id, 1, 20),
      this.financial.listMethods(user.id),
    ]);
    return {
      profile,
      activeTrips,
      wallet,
      notifications,
      paymentMethods,
      legacyHydration: {
        evzone_app_data_v1: {
          user: profile,
          activeTrips,
          wallet,
          notifications,
          paymentMethods,
          hydratedAt: new Date().toISOString(),
        },
      },
    };
  }

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.users.profile(user.id);
  }

  @Get('trips/active')
  active(@CurrentUser() user: AuthUser) {
    return this.rides.list(user, 'active', 1, 20);
  }

  @Get('trips/history')
  history(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope = 'past',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.rides.list(user, scope, Number(page), Math.min(Number(limit), 100));
  }

  @Post('trips/request')
  request(@CurrentUser() user: AuthUser, @Body() dto: CreateRideDto) {
    return this.rides.create(user.id, dto);
  }

  @Post('trips/:tripId/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string, @Body() dto: CancelRideDto) {
    return this.rides.cancel(user, tripId, dto);
  }

  @Post('fare-estimate')
  estimate(@CurrentUser() user: AuthUser, @Body() dto: EstimateRideDto) {
    return this.rides.estimate(user.id, dto);
  }

  @Get('notifications')
  notificationList(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.notifications.list(user.id, Number(page), Math.min(Number(limit), 100));
  }

  @Get('wallet')
  wallet(@CurrentUser() user: AuthUser) {
    return this.wallets.get(user.id);
  }

  @Get('wallet/transactions')
  walletTransactions(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.wallets.listTransactions(user.id, Number(page), Math.min(Number(limit), 100));
  }

  @Get('payment-methods')
  paymentMethods(@CurrentUser() user: AuthUser) {
    return this.financial.listMethods(user.id);
  }

  @Post('payment-intents')
  paymentIntent(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.payments.createIntent(user.id, dto);
  }

  @Post('sos')
  sos(@CurrentUser() user: AuthUser, @Body() dto: CreateEmergencyDto) {
    return this.safety.createEmergency(user, dto, true);
  }
}
