import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infrastructure/redis.service';
import { DispatchPolicyConfig, RouteMatrixResult } from '../domain/universal-dispatch.types';
import { haversineDistanceKm } from '../domain/universal-dispatch.utils';

interface MatrixInput {
  origins: Array<{ latitude: number; longitude: number; dispatchUnitId: string }>;
  destination: { latitude: number; longitude: number };
  travelMode: 'driving' | 'motorcycle' | 'cycling' | 'truck';
}

@Injectable()
export class RouteMatrixService {
  private readonly logger = new Logger(RouteMatrixService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async computePickupEtas(input: MatrixInput, policy: DispatchPolicyConfig): Promise<RouteMatrixResult[]> {
    const timeoutMs = policy.routeProviderTimeoutMs;
    const provider = this.config.get<string>('DISPATCH_ROUTE_PROVIDER') ?? 'fallback';

    try {
      if (provider && provider !== 'fallback') {
        const results = await this.callProvider(input, policy, timeoutMs);
        if (results.length) return results;
      }
    } catch (error) {
      this.logger.warn(
        `Route matrix provider failed (${provider}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.fallbackEtas(input, policy);
  }

  private async callProvider(
    input: MatrixInput,
    policy: DispatchPolicyConfig,
    timeoutMs: number,
  ): Promise<RouteMatrixResult[]> {
    const baseUrl = this.config.get<string>('ROUTE_LOOKUP_BASE_URL');
    if (!baseUrl) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/route-matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origins: input.origins.map((origin) => ({
            lat: origin.latitude,
            lon: origin.longitude,
          })),
          destination: { lat: input.destination.latitude, lon: input.destination.longitude },
          mode: input.travelMode,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const data = (await response.json()) as Array<{
        distance_meters: number;
        duration_seconds: number;
      }>;
      return data.map((item, index) => ({
        dispatchUnitId: input.origins[index].dispatchUnitId,
        distanceMeters: item.distance_meters,
        etaSeconds: item.duration_seconds,
        source: 'ROUTE_PROVIDER',
        uncertaintyPenalty: 0,
        mode: input.travelMode,
      }));
    } finally {
      clearTimeout(timer);
    }
  }

  private async fallbackEtas(input: MatrixInput, policy: DispatchPolicyConfig): Promise<RouteMatrixResult[]> {
    const speedKph: Record<string, number> = {
      driving: 20,
      motorcycle: 25,
      cycling: 15,
      truck: 18,
    };
    const speed = speedKph[input.travelMode] ?? 20;
    const penalty = policy.routeFallbackPenalty ?? 0.18;

    return input.origins.map((origin) => {
      const distanceKm = haversineDistanceKm(
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: input.destination.latitude, longitude: input.destination.longitude },
      );
      const etaSeconds = Math.round((distanceKm / speed) * 3600 * (1 + penalty));
      return {
        dispatchUnitId: origin.dispatchUnitId,
        distanceMeters: Math.round(distanceKm * 1000),
        etaSeconds,
        source: 'FALLBACK',
        uncertaintyPenalty: penalty,
        mode: input.travelMode,
      };
    });
  }

  travelModeForService(serviceType: string): 'driving' | 'motorcycle' | 'cycling' | 'truck' {
    switch (serviceType) {
      case 'EV_SCOOTER_RIDE':
      case 'EV_MOTORCYCLE_RIDE':
        return 'motorcycle';
      case 'BICYCLE_RIDE':
      case 'PARCEL_BIKE':
        return 'cycling';
      case 'CARGO_TRUCK':
      case 'MULTI_STOP_ROUTE':
        return 'truck';
      default:
        return 'driving';
    }
  }
}
