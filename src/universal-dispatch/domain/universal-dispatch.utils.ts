import { createHash, timingSafeEqual } from 'node:crypto';
import {
  DispatchUnitStatus,
  UniversalOfferStatus,
  UniversalRequestStatus,
  UniversalTripStatus,
} from './universal-dispatch.enums';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export function dispatchHash(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : stableStringify(value))
    .digest('hex');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
}

export function safeHashEquals(raw: string, expectedHash: string): boolean {
  const actual = Buffer.from(dispatchHash(raw));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function haversineDistanceKm(origin: GeoPoint, destination: GeoPoint): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(destination.latitude - origin.latitude);
  const deltaLongitude = radians(destination.longitude - origin.longitude);
  const value =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(destination.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function rounded(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function assertDispatchUnitTransition(from: DispatchUnitStatus, to: DispatchUnitStatus): void {
  const allowed: Record<DispatchUnitStatus, DispatchUnitStatus[]> = {
    [DispatchUnitStatus.OFFLINE]: [
      DispatchUnitStatus.AVAILABLE,
      DispatchUnitStatus.DOCUMENT_BLOCKED,
      DispatchUnitStatus.SUSPENDED,
      DispatchUnitStatus.CHARGING,
    ],
    [DispatchUnitStatus.AVAILABLE]: [
      DispatchUnitStatus.OFFERED,
      DispatchUnitStatus.OFFLINE,
      DispatchUnitStatus.CHARGING,
      DispatchUnitStatus.BREAK_REQUIRED,
      DispatchUnitStatus.DOCUMENT_BLOCKED,
      DispatchUnitStatus.SUSPENDED,
    ],
    [DispatchUnitStatus.OFFERED]: [
      DispatchUnitStatus.AVAILABLE,
      DispatchUnitStatus.RESERVED,
      DispatchUnitStatus.OFFLINE,
      DispatchUnitStatus.SUSPENDED,
    ],
    [DispatchUnitStatus.RESERVED]: [
      DispatchUnitStatus.EN_ROUTE_PICKUP,
      DispatchUnitStatus.AVAILABLE,
      DispatchUnitStatus.OFFLINE,
      DispatchUnitStatus.SUSPENDED,
    ],
    [DispatchUnitStatus.EN_ROUTE_PICKUP]: [
      DispatchUnitStatus.WAITING,
      DispatchUnitStatus.AVAILABLE,
      DispatchUnitStatus.SUSPENDED,
    ],
    [DispatchUnitStatus.WAITING]: [
      DispatchUnitStatus.ON_TRIP,
      DispatchUnitStatus.ON_DELIVERY_ROUTE,
      DispatchUnitStatus.AVAILABLE,
      DispatchUnitStatus.SUSPENDED,
    ],
    [DispatchUnitStatus.ON_TRIP]: [
      DispatchUnitStatus.AVAILABLE,
      DispatchUnitStatus.OFFLINE,
      DispatchUnitStatus.BREAK_REQUIRED,
      DispatchUnitStatus.SUSPENDED,
    ],
    [DispatchUnitStatus.ON_DELIVERY_ROUTE]: [
      DispatchUnitStatus.AVAILABLE,
      DispatchUnitStatus.OFFLINE,
      DispatchUnitStatus.BREAK_REQUIRED,
      DispatchUnitStatus.SUSPENDED,
    ],
    [DispatchUnitStatus.CHARGING]: [
      DispatchUnitStatus.AVAILABLE,
      DispatchUnitStatus.OFFLINE,
      DispatchUnitStatus.SUSPENDED,
    ],
    [DispatchUnitStatus.BREAK_REQUIRED]: [
      DispatchUnitStatus.AVAILABLE,
      DispatchUnitStatus.OFFLINE,
      DispatchUnitStatus.SUSPENDED,
    ],
    [DispatchUnitStatus.DOCUMENT_BLOCKED]: [DispatchUnitStatus.OFFLINE, DispatchUnitStatus.SUSPENDED],
    [DispatchUnitStatus.SUSPENDED]: [DispatchUnitStatus.OFFLINE],
  };
  if (from === to) return;
  if (!allowed[from]?.includes(to)) throw new Error(`INVALID_DISPATCH_UNIT_TRANSITION:${from}->${to}`);
}

export function assertRequestTransition(from: UniversalRequestStatus, to: UniversalRequestStatus): void {
  const allowed: Record<UniversalRequestStatus, UniversalRequestStatus[]> = {
    [UniversalRequestStatus.CREATED]: [
      UniversalRequestStatus.SCHEDULED,
      UniversalRequestStatus.SEARCHING,
      UniversalRequestStatus.CANCELLED,
      UniversalRequestStatus.EXPIRED,
    ],
    [UniversalRequestStatus.SCHEDULED]: [
      UniversalRequestStatus.SEARCHING,
      UniversalRequestStatus.CANCELLED,
      UniversalRequestStatus.EXPIRED,
    ],
    [UniversalRequestStatus.SEARCHING]: [
      UniversalRequestStatus.OFFERING,
      UniversalRequestStatus.ASSIGNED,
      UniversalRequestStatus.NO_QUALIFIED_DRIVER,
      UniversalRequestStatus.CANCELLED,
      UniversalRequestStatus.EXPIRED,
    ],
    [UniversalRequestStatus.OFFERING]: [
      UniversalRequestStatus.SEARCHING,
      UniversalRequestStatus.ASSIGNED,
      UniversalRequestStatus.NO_QUALIFIED_DRIVER,
      UniversalRequestStatus.CANCELLED,
      UniversalRequestStatus.EXPIRED,
    ],
    [UniversalRequestStatus.ASSIGNED]: [
      UniversalRequestStatus.DRIVER_EN_ROUTE,
      UniversalRequestStatus.SEARCHING,
      UniversalRequestStatus.CANCELLED,
    ],
    [UniversalRequestStatus.DRIVER_EN_ROUTE]: [
      UniversalRequestStatus.ARRIVED,
      UniversalRequestStatus.SEARCHING,
      UniversalRequestStatus.CANCELLED,
    ],
    [UniversalRequestStatus.ARRIVED]: [UniversalRequestStatus.ACTIVE, UniversalRequestStatus.CANCELLED],
    [UniversalRequestStatus.ACTIVE]: [UniversalRequestStatus.COMPLETED, UniversalRequestStatus.CANCELLED],
    [UniversalRequestStatus.COMPLETED]: [],
    [UniversalRequestStatus.CANCELLED]: [],
    [UniversalRequestStatus.NO_QUALIFIED_DRIVER]: [
      UniversalRequestStatus.SEARCHING,
      UniversalRequestStatus.CANCELLED,
      UniversalRequestStatus.EXPIRED,
    ],
    [UniversalRequestStatus.EXPIRED]: [],
  };
  if (from === to) return;
  if (!allowed[from]?.includes(to)) throw new Error(`INVALID_REQUEST_TRANSITION:${from}->${to}`);
}

export function assertOfferTransition(from: UniversalOfferStatus, to: UniversalOfferStatus): void {
  const allowed: Record<UniversalOfferStatus, UniversalOfferStatus[]> = {
    [UniversalOfferStatus.PENDING]: [
      UniversalOfferStatus.ACCEPTED,
      UniversalOfferStatus.DECLINED,
      UniversalOfferStatus.EXPIRED,
      UniversalOfferStatus.CANCELLED,
      UniversalOfferStatus.LOST_RACE,
    ],
    [UniversalOfferStatus.ACCEPTED]: [],
    [UniversalOfferStatus.DECLINED]: [],
    [UniversalOfferStatus.EXPIRED]: [],
    [UniversalOfferStatus.CANCELLED]: [],
    [UniversalOfferStatus.LOST_RACE]: [],
  };
  if (from === to) return;
  if (!allowed[from]?.includes(to)) throw new Error(`INVALID_OFFER_TRANSITION:${from}->${to}`);
}

export function assertTripTransition(from: UniversalTripStatus, to: UniversalTripStatus): void {
  const allowed: Partial<Record<UniversalTripStatus, UniversalTripStatus[]>> = {
    [UniversalTripStatus.ASSIGNED]: [
      UniversalTripStatus.DRIVER_EN_ROUTE_PICKUP,
      UniversalTripStatus.CANCELLED,
      UniversalTripStatus.FAILED,
    ],
    [UniversalTripStatus.DRIVER_EN_ROUTE_PICKUP]: [
      UniversalTripStatus.DRIVER_ARRIVED,
      UniversalTripStatus.CANCELLED,
      UniversalTripStatus.FAILED,
    ],
    [UniversalTripStatus.DRIVER_ARRIVED]: [
      UniversalTripStatus.WAITING_FOR_RIDER,
      UniversalTripStatus.RIDER_VERIFIED,
      UniversalTripStatus.PACKAGE_QR_VERIFIED,
      UniversalTripStatus.NO_SHOW,
      UniversalTripStatus.CANCELLED,
    ],
    [UniversalTripStatus.WAITING_FOR_RIDER]: [
      UniversalTripStatus.RIDER_VERIFIED,
      UniversalTripStatus.PACKAGE_QR_VERIFIED,
      UniversalTripStatus.NO_SHOW,
      UniversalTripStatus.CANCELLED,
    ],
    [UniversalTripStatus.RIDER_VERIFIED]: [UniversalTripStatus.TRIP_STARTED, UniversalTripStatus.CANCELLED],
    [UniversalTripStatus.PACKAGE_QR_VERIFIED]: [
      UniversalTripStatus.PACKAGE_PICKED_UP,
      UniversalTripStatus.CANCELLED,
    ],
    [UniversalTripStatus.PACKAGE_PICKED_UP]: [
      UniversalTripStatus.EN_ROUTE_DELIVERY,
      UniversalTripStatus.CANCELLED,
    ],
    [UniversalTripStatus.EN_ROUTE_DELIVERY]: [
      UniversalTripStatus.DELIVERY_ARRIVED,
      UniversalTripStatus.STOP_ARRIVED,
      UniversalTripStatus.CANCELLED,
    ],
    [UniversalTripStatus.DELIVERY_ARRIVED]: [
      UniversalTripStatus.RECIPIENT_VERIFIED,
      UniversalTripStatus.PACKAGE_DELIVERED,
      UniversalTripStatus.CANCELLED,
    ],
    [UniversalTripStatus.RECIPIENT_VERIFIED]: [
      UniversalTripStatus.PACKAGE_DELIVERED,
      UniversalTripStatus.CANCELLED,
    ],
    [UniversalTripStatus.PACKAGE_DELIVERED]: [
      UniversalTripStatus.COMPLETED,
      UniversalTripStatus.STOP_COMPLETED,
    ],
    [UniversalTripStatus.TRIP_STARTED]: [
      UniversalTripStatus.STOP_ARRIVED,
      UniversalTripStatus.COMPLETED,
      UniversalTripStatus.CANCELLED,
    ],
    [UniversalTripStatus.STOP_ARRIVED]: [UniversalTripStatus.STOP_COMPLETED, UniversalTripStatus.CANCELLED],
    [UniversalTripStatus.STOP_COMPLETED]: [
      UniversalTripStatus.STOP_ARRIVED,
      UniversalTripStatus.TRIP_STARTED,
      UniversalTripStatus.EN_ROUTE_DELIVERY,
      UniversalTripStatus.COMPLETED,
      UniversalTripStatus.CANCELLED,
    ],
    [UniversalTripStatus.COMPLETED]: [],
    [UniversalTripStatus.CANCELLED]: [],
    [UniversalTripStatus.NO_SHOW]: [],
    [UniversalTripStatus.FAILED]: [],
  };
  if (from === to) return;
  if (!allowed[from]?.includes(to)) throw new Error(`INVALID_TRIP_TRANSITION:${from}->${to}`);
}

export function gridCell(point: GeoPoint, precision = 3): string {
  return `${point.latitude.toFixed(precision)}:${point.longitude.toFixed(precision)}`;
}
