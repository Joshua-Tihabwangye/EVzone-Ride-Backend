import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { DriverProfile, RideFeedback } from '../../database/entities';
import {
  UniversalDispatchAssignment,
  UniversalDispatchOffer,
  UniversalDispatchUnit,
  UniversalServiceRequest,
} from '../domain/universal-dispatch.entities';
import { UniversalOfferStatus, UniversalAssignmentStatus } from '../domain/universal-dispatch.enums';
import { haversineDistanceKm } from '../domain/universal-dispatch.utils';

export interface RankingSignals {
  reliability: number;
  quality: number;
  acceptanceRate: number;
  cancellationRate: number;
  routeFit: number;
  energyMargin: number;
  preference: number;
  fairness: number;
}

@Injectable()
export class RankingDataService {
  constructor(
    @InjectRepository(DriverProfile)
    private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(RideFeedback)
    private readonly feedback: Repository<RideFeedback>,
    @InjectRepository(UniversalDispatchOffer)
    private readonly offers: Repository<UniversalDispatchOffer>,
    @InjectRepository(UniversalDispatchAssignment)
    private readonly assignments: Repository<UniversalDispatchAssignment>,
    private readonly config: ConfigService,
  ) {}

  async forUnit(unit: UniversalDispatchUnit, request: UniversalServiceRequest): Promise<RankingSignals> {
    const driver = await this.drivers.findOne({ where: { id: unit.driverId } });
    const [acceptanceRate, cancellationRate] = await Promise.all([
      this.computeAcceptanceRate(unit.id),
      this.computeCancellationRate(unit.id),
    ]);

    const rating = Number(driver?.rating ?? 4.5);
    const reliability = this.normalizeReliability(rating, acceptanceRate, cancellationRate);
    const quality = await this.computeQuality(unit.driverId, rating);
    const routeFit = this.computeRouteFit(unit, request);
    const energyMargin = this.computeEnergyMargin(unit, request);
    const preference = this.computePreferenceMatch(unit, request);
    const fairness = this.computeFairness(unit);

    return {
      reliability,
      quality,
      acceptanceRate,
      cancellationRate,
      routeFit,
      energyMargin,
      preference,
      fairness,
    };
  }

  private normalizeReliability(rating: number, acceptanceRate: number, cancellationRate: number): number {
    const ratingScore = Math.min(1, Math.max(0, rating / 5));
    const acceptScore = Math.min(1, Math.max(0, acceptanceRate));
    const cancelPenalty = Math.min(1, Math.max(0, cancellationRate));
    return Math.min(1, Math.max(0, ratingScore * acceptScore * (1 - cancelPenalty)));
  }

  private async computeQuality(driverId: string, fallbackRating: number): Promise<number> {
    const hours = Number(this.config.get<string>('RANKING_OFFER_HISTORY_HOURS') ?? 24);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await this.feedback.find({
      where: { driverId, createdAt: MoreThan(since) },
      select: ['rating'],
    });
    if (!rows.length) {
      return Math.min(1, Math.max(0, fallbackRating / 5));
    }
    const average = rows.reduce((sum, row) => sum + row.rating, 0) / rows.length;
    return Math.min(1, Math.max(0, average / 5));
  }

  private async computeAcceptanceRate(dispatchUnitId: string): Promise<number> {
    const hours = Number(this.config.get<string>('RANKING_OFFER_HISTORY_HOURS') ?? 24);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [total, accepted] = await Promise.all([
      this.offers.count({
        where: { dispatchUnitId, createdAt: MoreThan(since) },
      }),
      this.offers.count({
        where: {
          dispatchUnitId,
          createdAt: MoreThan(since),
          status: UniversalOfferStatus.ACCEPTED,
        },
      }),
    ]);
    if (!total) return 0.8;
    return accepted / total;
  }

  private async computeCancellationRate(dispatchUnitId: string): Promise<number> {
    const days = Number(this.config.get<string>('RANKING_ASSIGNMENT_HISTORY_DAYS') ?? 7);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [total, cancelled] = await Promise.all([
      this.assignments.count({
        where: { dispatchUnitId, createdAt: MoreThan(since) },
      }),
      this.assignments.count({
        where: {
          dispatchUnitId,
          createdAt: MoreThan(since),
          status: UniversalAssignmentStatus.CANCELLED,
        },
      }),
    ]);
    if (!total) return 0.02;
    return cancelled / total;
  }

  private computeRouteFit(unit: UniversalDispatchUnit, request: UniversalServiceRequest): number {
    if (
      unit.latitude == null ||
      unit.longitude == null ||
      request.pickupLatitude == null ||
      request.pickupLongitude == null ||
      request.dropoffLatitude == null ||
      request.dropoffLongitude == null
    ) {
      return 0.5;
    }

    const v1 = {
      x: request.pickupLongitude - unit.longitude,
      y: request.pickupLatitude - unit.latitude,
    };
    const v2 = {
      x: request.dropoffLongitude - request.pickupLongitude,
      y: request.dropoffLatitude - request.pickupLatitude,
    };

    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 === 0 || mag2 === 0) return 0.5;

    const cosTheta = (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2);
    return (1 + Math.min(1, Math.max(-1, cosTheta))) / 2;
  }

  private computeEnergyMargin(unit: UniversalDispatchUnit, request: UniversalServiceRequest): number {
    const energyType = this.energyTypeFromUnit(unit);
    const usableRangeKm = Number(unit.usableRangeKm ?? 0);
    if (!usableRangeKm || energyType === 'PETROL' || energyType === 'DIESEL') {
      return 1;
    }

    const tripKm = haversineDistanceKm(
      { latitude: request.pickupLatitude, longitude: request.pickupLongitude },
      { latitude: request.dropoffLatitude, longitude: request.dropoffLongitude },
    );
    const reservePercent = Number(this.config.get<string>('EV_RESERVE_PERCENT') ?? 15) / 100;
    const fixedReserveKm = Number(this.config.get<string>('EV_FIXED_RESERVE_KM') ?? 15);
    const reserveKm = Math.max(fixedReserveKm, usableRangeKm * reservePercent);
    const margin = (usableRangeKm - tripKm - reserveKm) / usableRangeKm;
    return Math.min(1, Math.max(0, margin));
  }

  private energyTypeFromUnit(unit: UniversalDispatchUnit): string {
    const snapshot = unit.eligibilitySnapshot as { vehicle?: { energyType?: string } } | undefined;
    return snapshot?.vehicle?.energyType ?? 'PETROL';
  }

  private computePreferenceMatch(unit: UniversalDispatchUnit, request: UniversalServiceRequest): number {
    const preferences = request.preferences ?? {};
    const keys = Object.keys(preferences);
    if (!keys.length) return 0.5;

    const snapshot = unit.eligibilitySnapshot as
      | {
          vehicle?: { vehicleType?: string; capabilities?: Record<string, unknown> };
          driver?: { languages?: string[]; certifications?: string[] };
        }
      | undefined;

    let matches = 0;
    for (const key of keys) {
      const requested = preferences[key];
      if (key === 'vehicleType' && snapshot?.vehicle?.vehicleType === requested) {
        matches += 1;
      } else if (key === 'energyType' && this.energyTypeFromUnit(unit) === requested) {
        matches += 1;
      } else if (key === 'language' && snapshot?.driver?.languages?.includes(String(requested))) {
        matches += 1;
      } else if (key === 'certification' && snapshot?.driver?.certifications?.includes(String(requested))) {
        matches += 1;
      } else if (key === 'fleetOnly' && unit.fleetId) {
        matches += 1;
      } else if (snapshot?.vehicle?.capabilities?.[key] === requested) {
        matches += 1;
      }
    }
    return matches / keys.length;
  }

  private computeFairness(unit: UniversalDispatchUnit): number {
    const thresholdMinutes = Number(
      this.config.get<string>('RANKING_FAIRNESS_BOOST_THRESHOLD_MINUTES') ?? 10,
    );
    if (!unit.lastAssignedAt) return 1;
    const minutesSince = (Date.now() - unit.lastAssignedAt.getTime()) / 60_000;
    if (minutesSince >= thresholdMinutes) return 1;
    return Math.min(1, Math.max(0, minutesSince / thresholdMinutes));
  }
}
