import { Injectable } from '@nestjs/common';
import { RouteOptimizationResult } from '../domain/universal-dispatch.types';

interface StopInput {
  sequence: number;
  latitude: number;
  longitude: number;
  type: string;
}

@Injectable()
export class RouteOptimizerService {
  optimize(
    origin: { latitude: number; longitude: number },
    stops: StopInput[],
    destination?: { latitude: number; longitude: number },
    constraints?: Record<string, unknown>,
  ): RouteOptimizationResult {
    const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
    const points = [
      origin,
      ...ordered.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude })),
    ];
    if (destination) points.push(destination);

    let totalDistanceKm = 0;
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const current = points[index];
      const deltaLat = current.latitude - previous.latitude;
      const deltaLon = current.longitude - previous.longitude;
      totalDistanceKm += Math.sqrt(deltaLat * deltaLat + deltaLon * deltaLon) * 111;
    }

    return {
      feasible: true,
      source: 'HEURISTIC',
      orderedStops: ordered.map((stop, index) => ({
        originalSequence: stop.sequence,
        sequence: index + 1,
        latitude: stop.latitude,
        longitude: stop.longitude,
        type: stop.type,
      })),
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      totalDurationMinutes: Math.round((totalDistanceKm / 20) * 60),
      violations: [],
      timedOut: false,
      metadata: { constraints },
    };
  }
}
