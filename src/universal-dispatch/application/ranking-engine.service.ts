import { Injectable } from '@nestjs/common';
import {
  DispatchPolicyConfig,
  DispatchPolicyWeights,
  DispatchUnitSnapshot,
  RankedDispatchCandidate,
  RouteMatrixResult,
} from '../domain/universal-dispatch.types';
import { UniversalDispatchUnit } from '../domain/universal-dispatch.entities';
import { clamp, dispatchHash, rounded } from '../domain/universal-dispatch.utils';

interface CandidateInput {
  unit: UniversalDispatchUnit;
  route: RouteMatrixResult;
  reliability?: number;
  fairness?: number;
  quality?: number;
  routeFit?: number;
  energyMargin?: number;
  preference?: number;
}

@Injectable()
export class RankingEngineService {
  rank(
    candidates: CandidateInput[],
    policy: DispatchPolicyConfig,
    requestId: string,
  ): RankedDispatchCandidate[] {
    const weights = policy.weights;
    const etaScale = Math.max(60, policy.maximumPickupEtaSeconds / 3);
    const bestEta = Math.min(...candidates.map((candidate) => candidate.route.etaSeconds));

    const scored = candidates.map((candidate) => {
      const components = this.computeScoreComponents(candidate, weights, bestEta, etaScale);
      const baseScore = Object.entries(components).reduce(
        (sum, [key, value]) => sum + (weights[key as keyof DispatchPolicyWeights] ?? 0) * value,
        0,
      );
      const uncertaintyPenalty = candidate.route.source === 'FALLBACK' ? policy.routeFallbackPenalty : 0;
      const score = clamp(baseScore - uncertaintyPenalty);
      return {
        unit: candidate.unit,
        snapshot: candidate.unit.eligibilitySnapshot as unknown as DispatchUnitSnapshot,
        eligibility: { eligible: true, reasonCodes: [], facts: {} },
        route: candidate.route,
        score: rounded(score, 8),
        scoreComponents: components,
        rank: 0,
      };
    });

    const sorted = scored
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.route.etaSeconds !== b.route.etaSeconds) return a.route.etaSeconds - b.route.etaSeconds;
        const availableA = Number(a.snapshot?.liveState?.availableSince ?? 0);
        const availableB = Number(b.snapshot?.liveState?.availableSince ?? 0);
        if (availableA !== availableB) return availableA - availableB;
        const tieBreaker = dispatchHash(`${requestId}:${a.unit.id}`).localeCompare(
          dispatchHash(`${requestId}:${b.unit.id}`),
        );
        return tieBreaker;
      });

    sorted.forEach((candidate, index) => {
      candidate.rank = index + 1;
    });

    return sorted;
  }

  private computeScoreComponents(
    candidate: CandidateInput,
    weights: DispatchPolicyWeights,
    bestEta: number,
    etaScale: number,
  ): Record<string, number> {
    const etaScore = clamp(Math.exp(-candidate.route.etaSeconds / etaScale));
    const etaRelativeScore = clamp(1 - (candidate.route.etaSeconds - bestEta) / Math.max(1, etaScale));
    const reliabilityScore = clamp(candidate.reliability ?? 0.7);
    const fairnessScore = clamp(candidate.fairness ?? 0.5);
    const qualityScore = clamp(candidate.quality ?? 0.6);
    const routeFitScore = clamp(candidate.routeFit ?? 0.8);
    const energyMarginScore = clamp(candidate.energyMargin ?? 1);
    const preferenceScore = clamp(candidate.preference ?? 0.5);

    return {
      pickupEta: rounded(0.6 * etaScore + 0.4 * etaRelativeScore, 6),
      reliability: rounded(reliabilityScore, 6),
      fairness: rounded(fairnessScore, 6),
      serviceQuality: rounded(qualityScore, 6),
      routeFit: rounded(routeFitScore, 6),
      energyMargin: rounded(energyMarginScore, 6),
      preference: rounded(preferenceScore, 6),
    };
  }
}
