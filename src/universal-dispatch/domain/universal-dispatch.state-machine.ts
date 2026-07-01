import { defineMachine, StateMachine } from '../../state-machine';
import {
  DispatchUnitStatus,
  UniversalAssignmentStatus,
  UniversalOfferStatus,
  UniversalRequestStatus,
  UniversalTripStatus,
  TERMINAL_REQUEST_STATUSES,
} from './universal-dispatch.enums';

const REQUEST_TRANSITIONS = {
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
} as const;

const OFFER_TRANSITIONS = {
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
} as const;

const UNIT_TRANSITIONS = {
  [DispatchUnitStatus.OFFLINE]: [
    DispatchUnitStatus.AVAILABLE,
    DispatchUnitStatus.DOCUMENT_BLOCKED,
    DispatchUnitStatus.SUSPENDED,
    DispatchUnitStatus.CHARGING,
  ],
  [DispatchUnitStatus.AVAILABLE]: [
    DispatchUnitStatus.OFFERED,
    DispatchUnitStatus.RESERVED,
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
} as const;

const ASSIGNMENT_TRANSITIONS = {
  [UniversalAssignmentStatus.ACTIVE]: [
    UniversalAssignmentStatus.RELEASED,
    UniversalAssignmentStatus.COMPLETED,
    UniversalAssignmentStatus.CANCELLED,
    UniversalAssignmentStatus.FAILED,
  ],
  [UniversalAssignmentStatus.RELEASED]: [
    UniversalAssignmentStatus.ACTIVE,
    UniversalAssignmentStatus.CANCELLED,
  ],
  [UniversalAssignmentStatus.COMPLETED]: [],
  [UniversalAssignmentStatus.CANCELLED]: [],
  [UniversalAssignmentStatus.FAILED]: [],
} as const;

const TRIP_TRANSITIONS = {
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
} as const;

export const universalRequestMachine: StateMachine<UniversalRequestStatus> = defineMachine({
  id: 'service_request',
  terminal: [...TERMINAL_REQUEST_STATUSES],
  transitions: REQUEST_TRANSITIONS as unknown as Record<
    UniversalRequestStatus,
    readonly UniversalRequestStatus[]
  >,
});

export const universalOfferMachine: StateMachine<UniversalOfferStatus> = defineMachine({
  id: 'dispatch_offer',
  transitions: OFFER_TRANSITIONS as unknown as Record<UniversalOfferStatus, readonly UniversalOfferStatus[]>,
});

export const dispatchUnitMachine: StateMachine<DispatchUnitStatus> = defineMachine({
  id: 'dispatch_unit',
  transitions: UNIT_TRANSITIONS as unknown as Record<DispatchUnitStatus, readonly DispatchUnitStatus[]>,
});

export const dispatchAssignmentMachine: StateMachine<UniversalAssignmentStatus> = defineMachine({
  id: 'dispatch_assignment',
  transitions: ASSIGNMENT_TRANSITIONS as unknown as Record<
    UniversalAssignmentStatus,
    readonly UniversalAssignmentStatus[]
  >,
});

export const universalTripMachine: StateMachine<UniversalTripStatus> = defineMachine({
  id: 'trip_session',
  transitions: TRIP_TRANSITIONS as unknown as Record<UniversalTripStatus, readonly UniversalTripStatus[]>,
});
