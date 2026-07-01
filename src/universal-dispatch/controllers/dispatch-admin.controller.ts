import { Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { Permission, RequirePermission } from '../../permissions';
import { AuthUser } from '../../common/interfaces';
import { DispatchPolicyService } from '../application/dispatch-policy.service';
import { UniversalMatchingService } from '../application/universal-matching.service';
import { DispatchUnitService } from '../application/dispatch-unit.service';
import { UniversalRequestService } from '../application/universal-request.service';
import { UniversalOfferService } from '../application/universal-offer.service';
import { UniversalTripService } from '../application/universal-trip.service';
import { RouteOptimizerService } from '../infrastructure/route-optimizer.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UniversalDispatchDecisionTrace } from '../domain/universal-dispatch.entities';
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
    @InjectRepository(UniversalDispatchDecisionTrace)
    private readonly traces: Repository<UniversalDispatchDecisionTrace>,
  ) {}

  @Post('dispatch-policies/validate')
  async validatePolicy(@Body() dto: ValidateDispatchPolicyDto) {
    return this.policyService.validate(dto);
  }

  @Post('dispatch-policies')
  @RequirePermission(Permission.DISPATCH_POLICY_WRITE)
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
  @RequirePermission(Permission.DISPATCH_POLICY_WRITE)
  async activatePolicy(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.policyService.activate(id, user.id);
  }

  @Post('dispatch-policies/:id/retire')
  @RequirePermission(Permission.DISPATCH_POLICY_WRITE)
  async retirePolicy(@Param('id') id: string) {
    return this.policyService.retire(id);
  }

  @Post('service-requests/:requestId/match')
  @RequirePermission(Permission.DISPATCH_MATCH_RUN)
  async matchRequest(@Param('requestId') requestId: string, @Body() dto: MatchUniversalRequestDto) {
    return this.matchingService.matchRequest(requestId, dto.shadowMode);
  }

  @Post('service-requests/:requestId/release-assignment')
  async releaseAssignment(@Param('requestId') requestId: string, @Body() dto: ReleaseUniversalAssignmentDto) {
    return { requestId, dto };
  }

  @Post('service-requests/:requestId/change-driver')
  @RequirePermission(Permission.DISPATCH_DRIVER_ASSIGN)
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

  @Get('decision-traces/:traceId')
  async getDecisionTrace(@Param('traceId') traceId: string) {
    const trace = await this.traces.findOne({ where: { traceId } });
    if (!trace) throw new NotFoundException('Decision trace not found');
    return {
      traceId: trace.traceId,
      requestId: trace.requestId,
      policyVersion: trace.policyVersion,
      outcome: trace.outcome,
      candidateCount: trace.candidateCount,
      eligibleCount: trace.eligibleCount,
      selectedDispatchUnitId: trace.selectedDispatchUnitId,
      decisionSummary: trace.decisionSummary,
      candidateDetails: trace.candidateDetails,
      createdAt: trace.createdAt,
    };
  }

  @Put('dispatch-units/:unitId/state')
  async setUnitState(@Param('unitId') unitId: string, @Body() dto: DispatchUnitAdminStateDto) {
    return { unitId, dto };
  }
}
