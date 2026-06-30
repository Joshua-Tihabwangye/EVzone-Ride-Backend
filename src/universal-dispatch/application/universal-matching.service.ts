import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  UniversalDispatchDecisionTrace,
  UniversalDispatchExclusion,
  UniversalDispatchOffer,
  UniversalDispatchUnit,
  UniversalServiceRequest,
} from '../domain/universal-dispatch.entities';
import {
  DecisionOutcome,
  UniversalOfferStatus,
  UniversalRequestStatus,
} from '../domain/universal-dispatch.enums';
import { DispatchPolicyService } from './dispatch-policy.service';
import { UniversalDispatchStateMachineService } from './universal-dispatch-state-machine.service';
import { EligibilityEngineService } from './eligibility-engine.service';
import { RankingEngineService } from './ranking-engine.service';
import { DispatchGeoIndexService } from '../infrastructure/dispatch-geo-index.service';
import { DispatchLiveStateService } from '../infrastructure/dispatch-live-state.service';
import { RouteMatrixService } from '../infrastructure/route-matrix.service';
import { UniversalOutboxService } from '../infrastructure/universal-outbox.service';
import { DispatchRealtimeService } from '../infrastructure/dispatch-realtime.service';
import { DispatchUnitSnapshot, MatchResult, RouteMatrixResult } from '../domain/universal-dispatch.types';

@Injectable()
export class UniversalMatchingService {
  private readonly logger = new Logger(UniversalMatchingService.name);

  constructor(
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    @InjectRepository(UniversalDispatchUnit)
    private readonly units: Repository<UniversalDispatchUnit>,
    @InjectRepository(UniversalDispatchOffer)
    private readonly offers: Repository<UniversalDispatchOffer>,
    @InjectRepository(UniversalDispatchDecisionTrace)
    private readonly traces: Repository<UniversalDispatchDecisionTrace>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly policyService: DispatchPolicyService,
    private readonly eligibility: EligibilityEngineService,
    private readonly ranking: RankingEngineService,
    private readonly geoIndex: DispatchGeoIndexService,
    private readonly liveState: DispatchLiveStateService,
    private readonly routeMatrix: RouteMatrixService,
    private readonly outbox: UniversalOutboxService,
    private readonly realtime: DispatchRealtimeService,
    private readonly stateMachine: UniversalDispatchStateMachineService,
  ) {}

  async matchRequest(requestId: string, shadowMode = false): Promise<MatchResult> {
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request) throw new Error('Request not found');
    if (![UniversalRequestStatus.SEARCHING, UniversalRequestStatus.OFFERING].includes(request.status)) {
      return {
        request,
        traceId: '',
        offersCreated: 0,
        eligibleCandidates: 0,
        candidateCount: 0,
        selectedDispatchUnitIds: [],
        status: request.status,
        shadowMode,
      };
    }

    const { config: policy } = await this.policyService.resolve(request.serviceType, request.marketId);
    const trace = this.traces.create({
      traceId: `dtr_${request.id}_${Date.now()}`,
      requestId: request.id,
      policyVersion: request.policyVersion ?? `${policy.schemaVersion}`,
      outcome: DecisionOutcome.SHADOW,
      candidateCount: 0,
      eligibleCount: 0,
      searchRadiiKm: policy.searchRadiiKm,
      decisionSummary: {},
      shadow: shadowMode,
    });

    const exclusionRows = await this.dataSource
      .getRepository(UniversalDispatchExclusion)
      .find({ where: { requesterUserId: request.requesterUserId, active: true } });
    const excludedDriverIds = new Set(exclusionRows.map((row) => (row as { driverId: string }).driverId));

    let allCandidates: UniversalDispatchUnit[] = [];
    let candidateSource = 'NONE';

    for (const radiusKm of policy.searchRadiiKm) {
      const geoCandidates = await this.geoIndex.findNearby(
        request.marketId,
        request.serviceType,
        request.pickupLatitude,
        request.pickupLongitude,
        radiusKm,
        policy.candidateLimit,
      );
      if (geoCandidates.length) {
        candidateSource = geoCandidates[0].source;
        const unitIds = [...new Set(geoCandidates.map((candidate) => candidate.dispatchUnitId))];
        allCandidates = await this.units.findBy({ id: In(unitIds) });
        break;
      }
    }

    const now = new Date();
    const eligibleResults: Array<{
      unit: UniversalDispatchUnit;
      snapshot: DispatchUnitSnapshot;
      route: RouteMatrixResult;
    }> = [];
    const exclusionCounts: Record<string, number> = {};

    for (const unit of allCandidates) {
      const snapshot = unit.eligibilitySnapshot as unknown as DispatchUnitSnapshot | undefined;
      if (!snapshot) continue;
      const result = await this.eligibility.evaluate(request, unit, policy, now, excludedDriverIds);
      for (const code of result.reasonCodes) {
        exclusionCounts[code] = (exclusionCounts[code] ?? 0) + 1;
      }
      if (result.eligible) {
        eligibleResults.push({
          unit,
          snapshot,
          route: {
            dispatchUnitId: unit.id,
            distanceMeters: 0,
            etaSeconds: 0,
            source: 'FALLBACK',
            uncertaintyPenalty: policy.routeFallbackPenalty,
            mode: this.routeMatrix.travelModeForService(request.serviceType),
          },
        });
      }
    }

    let routeResults: RouteMatrixResult[] = [];
    if (eligibleResults.length) {
      const routeCandidates = eligibleResults.slice(0, policy.routeMatrixLimit);
      routeResults = await this.routeMatrix.computePickupEtas(
        {
          origins: routeCandidates.map((candidate) => ({
            latitude: candidate.unit.latitude ?? request.pickupLatitude,
            longitude: candidate.unit.longitude ?? request.pickupLongitude,
            dispatchUnitId: candidate.unit.id,
          })),
          destination: { latitude: request.pickupLatitude, longitude: request.pickupLongitude },
          travelMode: this.routeMatrix.travelModeForService(request.serviceType),
        },
        policy,
      );
      for (const candidate of eligibleResults) {
        const route = routeResults.find((result) => result.dispatchUnitId === candidate.unit.id);
        if (route) candidate.route = route;
      }
    }

    const feasible = eligibleResults.filter(
      (candidate) => candidate.route.etaSeconds <= policy.maximumPickupEtaSeconds,
    );

    const ranked = this.ranking.rank(
      feasible.map((candidate) => ({
        unit: candidate.unit,
        route: candidate.route,
      })),
      policy,
      request.id,
    );

    trace.candidateCount = allCandidates.length;
    trace.eligibleCount = feasible.length;
    trace.outcome = ranked.length ? DecisionOutcome.RANKED : DecisionOutcome.NO_QUALIFIED_DRIVER;
    trace.selectedDispatchUnitId = ranked[0]?.unit.id;
    trace.decisionSummary = {
      candidateSource,
      exclusionCounts,
      topCandidates: ranked.slice(0, 5).map((candidate) => ({
        dispatchUnitId: candidate.unit.id,
        score: candidate.score,
        etaSeconds: candidate.route.etaSeconds,
      })),
    };
    await this.traces.save(trace);

    if (!ranked.length) {
      if (!shadowMode) {
        request.completedAt = new Date();
        await this.dataSource.transaction(async (manager) =>
          this.stateMachine.transitionRequest(manager, request, UniversalRequestStatus.NO_QUALIFIED_DRIVER, {
            reasonCode: 'NO_QUALIFIED_DRIVER',
          }),
        );
      }
      return {
        request,
        traceId: trace.id,
        offersCreated: 0,
        eligibleCandidates: feasible.length,
        candidateCount: allCandidates.length,
        selectedDispatchUnitIds: [],
        status: request.status,
        shadowMode,
      };
    }

    if (shadowMode) {
      return {
        request,
        traceId: trace.id,
        offersCreated: 0,
        eligibleCandidates: feasible.length,
        candidateCount: allCandidates.length,
        selectedDispatchUnitIds: ranked.slice(0, 3).map((candidate) => candidate.unit.id),
        status: request.status,
        shadowMode,
      };
    }

    const wave = policy.offerWaves[request.currentWave] ?? policy.offerWaves[policy.offerWaves.length - 1];
    const waveCandidates = ranked.slice(0, wave?.size ?? 1);
    const offeredAt = new Date();
    const expiresAt = new Date(offeredAt.getTime() + (wave?.timeoutSeconds ?? 10) * 1000);

    const offers = await this.offers.save(
      waveCandidates.map((candidate) =>
        this.offers.create({
          requestId: request.id,
          dispatchUnitId: candidate.unit.id,
          waveNumber: request.currentWave + 1,
          status: UniversalOfferStatus.PENDING,
          score: candidate.score,
          pickupEtaSeconds: candidate.route.etaSeconds,
          pickupDistanceMeters: candidate.route.distanceMeters,
          scoreComponents: candidate.scoreComponents,
          policyVersion: request.policyVersion ?? `${policy.schemaVersion}`,
          offeredAt,
          expiresAt,
          payload: { route: candidate.route },
        }),
      ),
    );

    request.currentWave += 1;
    request.nextMatchAt = expiresAt;
    await this.dataSource.transaction(async (manager) =>
      this.stateMachine.transitionRequest(manager, request, UniversalRequestStatus.OFFERING, {
        reasonCode: 'OFFER_WAVE_CREATED',
      }),
    );

    for (const offer of offers) {
      await this.realtime.publishDispatchUnitUpdate(offer.dispatchUnitId, 'offer.created', {
        offerId: offer.id,
        requestId: request.id,
        serviceType: request.serviceType,
        expiresAt: offer.expiresAt.toISOString(),
        pickupEtaSeconds: offer.pickupEtaSeconds,
      });
    }

    await this.realtime.publishRequestUpdate(request.id, 'request.offer_wave_changed', {
      requestId: request.id,
      waveNumber: request.currentWave,
      offerCount: offers.length,
    });

    return {
      request,
      traceId: trace.id,
      offersCreated: offers.length,
      eligibleCandidates: feasible.length,
      candidateCount: allCandidates.length,
      selectedDispatchUnitIds: waveCandidates.map((candidate) => candidate.unit.id),
      status: request.status,
      shadowMode,
    };
  }
}
