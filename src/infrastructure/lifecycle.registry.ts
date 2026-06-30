import {
  BookingStatus,
  CorporatePayRequestStatus,
  DeliveryStatus,
  DocumentStatus,
  EmergencyStatus,
  PaymentStatus,
  RentalStatus,
  SupportTicketStatus,
} from '../common/enums';

export interface LifecycleDefinition {
  name: string;
  sourceOfTruth: string;
  states: string[];
  terminalStates: string[];
}

export const LIFECYCLE_REGISTRY: LifecycleDefinition[] = [
  {
    name: 'ride',
    sourceOfTruth: 'Ride',
    states: Object.values(BookingStatus),
    terminalStates: [
      BookingStatus.COMPLETED,
      BookingStatus.CANCELLED,
      BookingStatus.REJECTED,
      BookingStatus.EXPIRED,
      BookingStatus.NO_SHOW,
    ],
  },
  {
    name: 'delivery',
    sourceOfTruth: 'DeliveryOrder',
    states: Object.values(DeliveryStatus),
    terminalStates: [DeliveryStatus.COMPLETED, DeliveryStatus.CANCELLED, DeliveryStatus.REJECTED],
  },
  {
    name: 'rental',
    sourceOfTruth: 'RentalBooking',
    states: Object.values(RentalStatus),
    terminalStates: [RentalStatus.COMPLETED, RentalStatus.CANCELLED, RentalStatus.REJECTED],
  },
  {
    name: 'ambulance',
    sourceOfTruth: 'AmbulanceRequest',
    states: Object.values(EmergencyStatus),
    terminalStates: [EmergencyStatus.RESOLVED, EmergencyStatus.CANCELLED],
  },
  {
    name: 'tourist',
    sourceOfTruth: 'TouristBooking',
    states: Object.values(BookingStatus),
    terminalStates: [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.REJECTED],
  },
  {
    name: 'shuttle',
    sourceOfTruth: 'CorporatePay/School integration reference',
    states: Object.values(CorporatePayRequestStatus),
    terminalStates: [
      CorporatePayRequestStatus.COMPLETED,
      CorporatePayRequestStatus.CANCELLED,
      CorporatePayRequestStatus.DECLINED,
      CorporatePayRequestStatus.FAILED,
      CorporatePayRequestStatus.EXPIRED,
    ],
  },
  {
    name: 'payment',
    sourceOfTruth: 'Payment',
    states: Object.values(PaymentStatus),
    terminalStates: [
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
      PaymentStatus.REFUNDED,
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.CANCELLED,
    ],
  },
  {
    name: 'cashout',
    sourceOfTruth: 'CashoutRequest',
    states: ['REQUESTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'],
    terminalStates: ['REJECTED', 'PAID', 'FAILED', 'CANCELLED'],
  },
  {
    name: 'document',
    sourceOfTruth: 'UserDocument/DriverDocument/VehicleDocument',
    states: Object.values(DocumentStatus),
    terminalStates: [DocumentStatus.VERIFIED, DocumentStatus.REJECTED, DocumentStatus.EXPIRED],
  },
  {
    name: 'support-ticket',
    sourceOfTruth: 'SupportTicket',
    states: Object.values(SupportTicketStatus),
    terminalStates: [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED],
  },
];
