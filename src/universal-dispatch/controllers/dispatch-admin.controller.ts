import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { AuthUser } from '../../common/interfaces';
import { DispatchPolicyService } from '../application/dispatch-policy.service';
import { UniversalMatchingService } from '../application/universal-matching.service';
import { DispatchUnitService } from '../application/dispatch-unit.service';
import { UniversalRequestService } from '../application/universal-request.service';
import { UniversalOfferService } from '../application/universal-offer.service';
import { UniversalTripService } from '../application/universal-trip.service';
import { RouteOptimizerService } from '../infrastructure/route-optimizer.service';
import {
  ChangeDriverDto,
  CreateDispatchPolicyDto,
  DispatchUnitAdminStateDto,
  InsertSharedBookingDto,
  MatchUniversalRequestDto,
  OptimizeUniversalRouteDto,
  ReleaseUniversalAssignmentDto,
  ValidateDispatchPolicyDto,
} from '../universal-dispatch.dto';

@ApiTags('Universal Dispatch - Admin')
@ApiBearerAuth()
@Controller('universal-dispatch/admin')
@Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.SUPPORT)
export class DispatchAdminController {
  constructor(
    private readonly policyService: DispatchPolicyService,
    private readonly matchingService: UniversalMatchingService,
    private readonly dispatchUnitService: DispatchUnitService,
    private readonly requestService: UniversalRequestService,
    private readonly offerService: UniversalOfferService,
    private readonly tripService: UniversalTripService,
    private readonly optimizer: RouteOptimizerService,
  ) {}

  @Post('dispatch-policies/validate')
  async validatePolicy(@Body() dto: ValidateDispatchPolicyDto) {
    return this.policyService.validate(dto);
  }

  @Post('dispatch-policies')
  async createPolicy(@CurrentUser() user: AuthUser, @Body() dto: CreateDispatchPolicyDto) {
    return this.policyService.create(dto, user.id);
  }

  @Get('dispatch-policies')
  async listPolicies(
    @Query('serviceType') serviceType?: string,
    @Query('status') status?: string,
    @Query('marketId') marketId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.policyService.list({
      serviceType: serviceType as never,
      status: status as never,
      marketId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('dispatch-policies/:id/activate')
  async activatePolicy(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.policyService.activate(id, user.id);
  }

  @Post('dispatch-policies/:id/retire')
  async retirePolicy(@Param('id') id: string) {
    return this.policyService.retire(id);
  }

  @Post('service-requests/:requestId/match')
  async matchRequest(@Param('requestId') requestId: string, @Body() dto: MatchUniversalRequestDto) {
    return this.matchingService.matchRequest(requestId, dto.shadowMode);
  }

  @Post('service-requests/:requestId/release-assignment')
  async releaseAssignment(@Param('requestId') requestId: string, @Body() dto: ReleaseUniversalAssignmentDto) {
    return { requestId, dto };
  }

  @Post('service-requests/:requestId/change-driver')
  async changeDriver(@Param('requestId') requestId: string, @Body() dto: ChangeDriverDto) {
    return { requestId, dto };
  }

  @Post('trip-sessions/:tripSessionId/shared-bookings')
  async insertSharedBooking(
    @Param('tripSessionId') tripSessionId: string,
    @Body() dto: InsertSharedBookingDto,
  ) {
    return { tripSessionId, dto };
  }

  @Post('routes/optimize')
  async optimizeRoute(@Body() dto: OptimizeUniversalRouteDto) {
    return this.optimizer.optimize(
      { latitude: dto.origin.latitude, longitude: dto.origin.longitude },
      dto.stops.map((stop) => ({
        sequence: stop.sequence,
        latitude: stop.location.latitude,
        longitude: stop.location.longitude,
        type: stop.type,
      })),
      dto.destination
        ? { latitude: dto.destination.latitude, longitude: dto.destination.longitude }
        : undefined,
      dto.constraints,
    );
  }

  @Get('dispatch-decisions/:requestId')
  async getDecisionTrace(@Param('requestId') requestId: string) {
    return { requestId };
  }

  @Put('dispatch-units/:unitId/state')
  async setUnitState(@Param('unitId') unitId: string, @Body() dto: DispatchUnitAdminStateDto) {
    return { unitId, dto };
  }
}
