import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverProfile, RideFeedback } from '../database/entities';
import { WorkersConfigModule } from '../workers/workers-config.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { UNIVERSAL_DISPATCH_ENTITIES } from './domain/universal-dispatch.entities';
import { DatabaseModule } from '../database/database.module';
import { StateMachineModule } from '../state-machine/state-machine.module';
import { DispatchPolicyService } from './application/dispatch-policy.service';
import { DispatchUnitService } from './application/dispatch-unit.service';
import { UniversalRequestService } from './application/universal-request.service';
import { UniversalDispatchStateMachineService } from './application/universal-dispatch-state-machine.service';
import { EligibilityEngineService } from './application/eligibility-engine.service';
import { RankingEngineService } from './application/ranking-engine.service';
import { RankingDataService } from './application/ranking-data.service';
import { UniversalMatchingService } from './application/universal-matching.service';
import { UniversalOfferService } from './application/universal-offer.service';
import { UniversalTripService } from './application/universal-trip.service';
import { LegacyDispatchAdapterService } from './application/legacy-dispatch-adapter.service';
import { DispatchGeoIndexService } from './infrastructure/dispatch-geo-index.service';
import { DispatchLiveStateService } from './infrastructure/dispatch-live-state.service';
import { RouteMatrixService } from './infrastructure/route-matrix.service';
import { RouteOptimizerService } from './infrastructure/route-optimizer.service';
import { UniversalOutboxService } from './infrastructure/universal-outbox.service';
import { DispatchRealtimeService } from './infrastructure/dispatch-realtime.service';
import { DispatchMetricsService } from './infrastructure/dispatch-metrics.service';
import { MatchingWorker } from './workers/matching.worker';
import { OfferExpiryWorker } from './workers/offer-expiry.worker';
import { OutboxWorker } from './workers/outbox.worker';
import { StaleCleanupWorker } from './workers/stale-cleanup.worker';
import { ScheduledDispatchWorker } from './workers/scheduled-dispatch.worker';
import { DispatchMatchProcessor } from './workers/processors/dispatch-match.processor';
import { DispatchExpireOffersProcessor } from './workers/processors/dispatch-expire-offers.processor';
import { DispatchFlushOutboxProcessor } from './workers/processors/dispatch-flush-outbox.processor';
import { DispatchScheduledRequestsProcessor } from './workers/processors/dispatch-scheduled-requests.processor';
import { DispatchStaleCleanupProcessor } from './workers/processors/dispatch-stale-cleanup.processor';
import { DispatchDriverController } from './controllers/dispatch-driver.controller';
import { DispatchRiderController } from './controllers/dispatch-rider.controller';
import { DispatchAdminController } from './controllers/dispatch-admin.controller';
import { HealthModule } from '../health/health.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DriversModule } from '../drivers/drivers.module';
import { VehiclesModule } from '../vehicles/vehicles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([...UNIVERSAL_DISPATCH_ENTITIES, DriverProfile, RideFeedback]),
    DatabaseModule,
    StateMachineModule,
    WorkersConfigModule,
    EventEmitterModule,
    NotificationsModule,
    RealtimeModule,
    DriversModule,
    VehiclesModule,
  ],
  providers: [
    DispatchPolicyService,
    DispatchUnitService,
    UniversalRequestService,
    UniversalDispatchStateMachineService,
    EligibilityEngineService,
    RankingEngineService,
    RankingDataService,
    UniversalMatchingService,
    UniversalOfferService,
    UniversalTripService,
    LegacyDispatchAdapterService,
    DispatchGeoIndexService,
    DispatchMetricsService,
    DispatchLiveStateService,
    RouteMatrixService,
    RouteOptimizerService,
    UniversalOutboxService,
    DispatchRealtimeService,
    MatchingWorker,
    OfferExpiryWorker,
    OutboxWorker,
    StaleCleanupWorker,
    ScheduledDispatchWorker,
    DispatchMatchProcessor,
    DispatchExpireOffersProcessor,
    DispatchFlushOutboxProcessor,
    DispatchScheduledRequestsProcessor,
    DispatchStaleCleanupProcessor,
  ],
  controllers: [DispatchDriverController, DispatchRiderController, DispatchAdminController],
  exports: [
    DispatchPolicyService,
    DispatchUnitService,
    UniversalRequestService,
    UniversalMatchingService,
    UniversalOfferService,
    UniversalTripService,
    LegacyDispatchAdapterService,
    DispatchGeoIndexService,
    DispatchLiveStateService,
    RouteMatrixService,
    RouteOptimizerService,
    UniversalOutboxService,
    DispatchRealtimeService,
  ],
})
export class UniversalDispatchModule {}
