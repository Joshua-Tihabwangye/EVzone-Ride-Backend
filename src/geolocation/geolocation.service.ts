import { Injectable, Logger } from '@nestjs/common';
import { bearingDegrees, haversineKm } from '../common/utils/geo';
import { CoordinateDto, PlaceSearchDto, RouteEstimateDto } from './geolocation.dto';

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  category?: string;
  type?: string;
  address?: Record<string, string>;
  boundingBox?: { south: number; north: number; west: number; east: number };
}

export interface RouteEstimate {
  provider: 'OSRM' | 'FALLBACK';
  distanceKm: number;
  durationMinutes: number;
  path: CoordinateDto[];
  alternatives: CoordinateDto[][];
}

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);
  private readonly geocoderUrl =
    process.env.GEO_LOOKUP_BASE_URL?.trim() || 'https://nominatim.openstreetmap.org';
  private readonly routingUrl =
    process.env.ROUTE_LOOKUP_BASE_URL?.trim() || 'https://router.project-osrm.org';
  private readonly userAgent = process.env.GEO_LOOKUP_USER_AGENT?.trim() || 'EVzoneRideBackend/3.0';

  async searchPlaces(input: PlaceSearchDto): Promise<PlaceSuggestion[]> {
    const url = new URL('/search', this.geocoderUrl);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(input.limit ?? 5));
    url.searchParams.set('q', input.query.trim());
    if (input.countryCode) url.searchParams.set('countrycodes', input.countryCode.toLowerCase());

    const payload = await this.fetchJson<Array<Record<string, unknown>>>(url);
    return payload.map((item) => this.mapPlace(item));
  }

  async reverseGeocode(point: CoordinateDto): Promise<PlaceSuggestion | null> {
    const url = new URL('/reverse', this.geocoderUrl);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('lat', String(point.latitude));
    url.searchParams.set('lon', String(point.longitude));
    try {
      const payload = await this.fetchJson<Record<string, unknown>>(url);
      return this.mapPlace(payload);
    } catch (error) {
      this.logger.warn(`Reverse geocoding unavailable: ${this.errorMessage(error)}`);
      return null;
    }
  }

  async estimateRoute(input: RouteEstimateDto): Promise<RouteEstimate> {
    const coordinates = input.points.map((point) => `${point.longitude},${point.latitude}`).join(';');
    const url = new URL(`/route/v1/driving/${coordinates}`, this.routingUrl);
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('alternatives', input.alternatives ? 'true' : 'false');
    url.searchParams.set('steps', 'false');

    try {
      const payload = await this.fetchJson<{
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: { coordinates?: number[][] };
        }>;
      }>(url);
      const routes = payload.routes ?? [];
      if (routes.length === 0) return this.fallbackRoute(input.points);
      const primary = routes[0];
      return {
        provider: 'OSRM',
        distanceKm: this.round(Number(primary.distance ?? 0) / 1000, 3),
        durationMinutes: this.round(Number(primary.duration ?? 0) / 60, 1),
        path: this.mapPath(primary.geometry?.coordinates ?? [], input.points),
        alternatives: routes
          .slice(1)
          .map((route) => this.mapPath(route.geometry?.coordinates ?? [], input.points)),
      };
    } catch (error) {
      this.logger.warn(
        `Route provider unavailable; using deterministic fallback: ${this.errorMessage(error)}`,
      );
      return this.fallbackRoute(input.points);
    }
  }

  distance(origin: CoordinateDto, destination: CoordinateDto) {
    const distanceKm = haversineKm(origin, destination);
    return {
      distanceKm: this.round(distanceKm, 3),
      bearingDegrees: this.round(bearingDegrees(origin, destination), 1),
    };
  }

  pointInPolygon(point: CoordinateDto, polygon: CoordinateDto[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude;
      const yi = polygon[i].latitude;
      const xj = polygon[j].longitude;
      const yj = polygon[j].latitude;
      const intersects =
        yi > point.latitude !== yj > point.latitude &&
        point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi || Number.EPSILON) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  private fallbackRoute(points: CoordinateDto[]): RouteEstimate {
    let directKm = 0;
    for (let index = 1; index < points.length; index += 1) {
      directKm += haversineKm(points[index - 1], points[index]);
    }
    const roadFactor = Number(process.env.ROUTE_FALLBACK_DISTANCE_FACTOR ?? 1.25);
    const averageSpeedKph = Number(process.env.ROUTE_FALLBACK_SPEED_KPH ?? 35);
    const distanceKm = directKm * roadFactor;
    return {
      provider: 'FALLBACK',
      distanceKm: this.round(distanceKm, 3),
      durationMinutes: this.round((distanceKm / averageSpeedKph) * 60, 1),
      path: points,
      alternatives: [],
    };
  }

  private mapPath(raw: number[][], fallback: CoordinateDto[]): CoordinateDto[] {
    if (!raw.length) return fallback;
    return raw.map(([longitude, latitude]) => ({ latitude, longitude }));
  }

  private mapPlace(item: Record<string, unknown>): PlaceSuggestion {
    const box = Array.isArray(item.boundingbox) ? item.boundingbox.map(Number) : [];
    return {
      placeId: this.scalarText(item.place_id) || this.scalarText(item.osm_id),
      name: this.scalarText(item.name) || this.scalarText(item.display_name),
      displayName: this.scalarText(item.display_name) || this.scalarText(item.name),
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      category: typeof item.category === 'string' ? item.category : undefined,
      type: typeof item.type === 'string' ? item.type : undefined,
      address:
        item.address && typeof item.address === 'object'
          ? (item.address as Record<string, string>)
          : undefined,
      boundingBox:
        box.length === 4 ? { south: box[0], north: box[1], west: box[2], east: box[3] } : undefined,
    };
  }

  private scalarText(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.GEO_REQUEST_TIMEOUT_MS ?? 5000));
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': this.userAgent },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
