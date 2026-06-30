import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { UniversalMatchingService } from './application/universal-matching.service';
import { UniversalOfferService } from './application/universal-offer.service';
import { UniversalTripService } from './application/universal-trip.service';
import { DispatchGeoIndexService } from './infrastructure/dispatch-geo-index.service';
import { DispatchLiveStateService } from './infrastructure/dispatch-live-state.service';
import { RouteMatrixService } from './infrastructure/route-matrix.service';
import { RouteOptimizerService } from './infrastructure/route-optimizer.service';
import { UniversalOutboxService } from './infrastructure/universal-outbox.service';
import { DispatchRealtimeService } from './infrastructure/dispatch-realtime.service';
import { MatchingWorker } from './workers/matching.worker';
import { OfferExpiryWorker } from './workers/offer-expiry.worker';
import { OutboxWorker } from './workers/outbox.worker';
import { StaleCleanupWorker } from './workers/stale-cleanup.worker';
import { ScheduledDispatchWorker } from './workers/scheduled-dispatch.worker';
import { DispatchDriverController } from './controllers/dispatch-driver.controller';
import { DispatchRiderController } from './controllers/dispatch-rider.controller';
import { DispatchAdminController } from './controllers/dispatch-admin.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DriversModule } from '../drivers/drivers.module';
import { VehiclesModule } from '../vehicles/vehicles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([...UNIVERSAL_DISPATCH_ENTITIES]),
    DatabaseModule,
    StateMachineModule,
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
    UniversalMatchingService,
    UniversalOfferService,
    UniversalTripService,
    DispatchGeoIndexService,
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
  ],
  controllers: [DispatchDriverController, DispatchRiderController, DispatchAdminController],
  exports: [
    DispatchPolicyService,
    DispatchUnitService,
    UniversalRequestService,
    UniversalMatchingService,
    UniversalOfferService,
    UniversalTripService,
    DispatchGeoIndexService,
    DispatchLiveStateService,
    RouteMatrixService,
    RouteOptimizerService,
    UniversalOutboxService,
    DispatchRealtimeService,
  ],
})
export class UniversalDispatchModule {}
