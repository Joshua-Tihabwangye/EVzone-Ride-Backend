import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numberTransformer } from '../../common/utils/money';
import {
  DecisionOutcome,
  DispatchCancellationParty,
  DispatchExclusionType,
  DispatchOwnerType,
  DispatchPolicyStatus,
  DispatchQualificationStatus,
  DispatchShiftStatus,
  DispatchUnitStatus,
  UniversalAssignmentStatus,
  UniversalOfferStatus,
  UniversalOutboxStatus,
  UniversalRequestStatus,
  UniversalScheduleType,
  UniversalServiceFamily,
  UniversalServiceType,
  UniversalStopStatus,
  UniversalTripStatus,
  UniversalTripStopType,
} from './universal-dispatch.enums';

export abstract class UniversalDispatchBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}

@Index('IDX_ud_driver_certification_unique', ['driverId', 'code'], { unique: true })
@Entity('dispatch_driver_certifications')
export class DispatchDriverCertification extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Column()
  code!: string;

  @Column({
    type: 'simple-enum',
    enum: DispatchQualificationStatus,
    default: DispatchQualificationStatus.ACTIVE,
  })
  status!: DispatchQualificationStatus;

  @Column({ nullable: true })
  issuer?: string;

  @Column({ nullable: true })
  validFrom?: Date;

  @Column({ nullable: true })
  validUntil?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_driver_entitlement_unique', ['driverId', 'serviceType', 'marketId'], { unique: true })
@Entity('dispatch_driver_entitlements')
export class DispatchDriverEntitlement extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Index()
  @Column({ type: 'simple-enum', enum: UniversalServiceType })
  serviceType!: UniversalServiceType;

  @Index()
  @Column({ default: 'default' })
  marketId!: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ nullable: true })
  validUntil?: Date;

  @Column({ type: 'simple-json', nullable: true })
  constraints?: Record<string, unknown>;
}

@Index('IDX_ud_vehicle_capability_unique', ['vehicleId', 'code'], { unique: true })
@Entity('dispatch_vehicle_capabilities')
export class DispatchVehicleCapability extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  vehicleId!: string;

  @Column()
  code!: string;

  @Column({ default: true })
  verified!: boolean;

  @Column({ nullable: true })
  booleanValue?: boolean;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 3,
    nullable: true,
    transformer: numberTransformer,
  })
  numericValue?: number;

  @Column({ nullable: true })
  textValue?: string;

  @Column({ nullable: true })
  validUntil?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_fleet_rule_unique', ['fleetId', 'serviceType', 'marketId'], { unique: true })
@Entity('dispatch_fleet_rules')
export class DispatchFleetRule extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Column({ nullable: true })
  organizationId?: string;

  @Column({ type: 'simple-enum', enum: UniversalServiceType })
  serviceType!: UniversalServiceType;

  @Column({ default: 'default' })
  marketId!: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'simple-json' })
  rules!: Record<string, unknown>;

  @Column({ nullable: true })
  validFrom?: Date;

  @Column({ nullable: true })
  validUntil?: Date;
}

@Index('IDX_ud_driver_vehicle_assignment_unique', ['driverId', 'vehicleId', 'assignedFrom'], {
  unique: true,
})
@Entity('dispatch_driver_vehicle_assignments')
export class DispatchDriverVehicleAssignment extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Index()
  @Column()
  vehicleId!: string;

  @Column({ nullable: true })
  fleetId?: string;

  @Column({ default: true })
  active!: boolean;

  @Column()
  assignedFrom!: Date;

  @Column({ nullable: true })
  assignedUntil?: Date;

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Check('CHK_ud_shift_time', '"endsAt" > "startsAt"')
@Entity('dispatch_driver_shifts')
export class DispatchDriverShift extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Column()
  vehicleId!: string;

  @Column({ nullable: true })
  fleetId?: string;

  @Index()
  @Column({ default: 'default' })
  marketId!: string;

  @Column()
  startsAt!: Date;

  @Column()
  endsAt!: Date;

  @Column({
    type: 'simple-enum',
    enum: DispatchShiftStatus,
    default: DispatchShiftStatus.SCHEDULED,
  })
  status!: DispatchShiftStatus;

  @Column({ default: 720 })
  maximumDrivingMinutes!: number;

  @Column({ default: 0 })
  drivenMinutes!: number;

  @Column({ type: 'simple-json', nullable: true })
  breaks?: Record<string, unknown>[];

  @Column({ type: 'simple-json', nullable: true })
  recurrence?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Check('CHK_ud_schedule_time', '"endsAt" > "startsAt"')
@Entity('dispatch_driver_schedules')
export class DispatchDriverSchedule extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Column({ nullable: true })
  vehicleId?: string;

  @Index()
  @Column({ type: 'simple-enum', enum: UniversalServiceType })
  serviceType!: UniversalServiceType;

  @Column()
  startsAt!: Date;

  @Column()
  endsAt!: Date;

  @Column({ type: 'simple-json', nullable: true })
  recurrenceRule?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  reservedCapacity?: Record<string, unknown>;

  @Column({ default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_dispatch_unit_driver', ['driverId'], { unique: true })
@Index('IDX_ud_dispatch_unit_market_status', ['marketId', 'status', 'locationRecordedAt'])
@Entity('universal_dispatch_units')
export class UniversalDispatchUnit extends UniversalDispatchBaseEntity {
  @Column()
  driverId!: string;

  @Index()
  @Column()
  activeVehicleId!: string;

  @Column({ nullable: true })
  fleetId?: string;

  @Column({ nullable: true })
  shiftId?: string;

  @Column({ type: 'simple-enum', enum: DispatchOwnerType, default: DispatchOwnerType.INDIVIDUAL })
  ownerType!: DispatchOwnerType;

  @Column({ default: 'default' })
  marketId!: string;

  @Column({ type: 'simple-enum', enum: DispatchUnitStatus, default: DispatchUnitStatus.OFFLINE })
  status!: DispatchUnitStatus;

  @Column({ type: 'simple-enum', enum: DispatchUnitStatus, nullable: true })
  previousStatus?: DispatchUnitStatus;

  /** Nullable unique key populated only while the unit is active. */
  @Index({ unique: true })
  @Column({ nullable: true })
  activeDriverKey?: string;

  @Column({ type: 'simple-json', nullable: true })
  enabledServices?: UniversalServiceType[];

  @Column({ type: 'simple-json', nullable: true })
  driverCertifications?: string[];

  @Column({ type: 'simple-json', nullable: true })
  vehicleCapabilities?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  compliance?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  liveState?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  eligibilitySnapshot?: Record<string, unknown>;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: numberTransformer,
  })
  latitude?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: numberTransformer,
  })
  longitude?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  accuracyMeters?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  speedKph?: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  heading?: number;

  @Column({ nullable: true })
  locationRecordedAt?: Date;

  @Column({ type: 'bigint', default: 0 })
  locationSequence!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  batterySoc?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  usableRangeKm?: number;

  @Column({ nullable: true })
  chargingState?: string;

  @Column({ nullable: true })
  remainingShiftMinutes?: number;

  @Column({ type: 'bigint', default: 1 })
  snapshotVersion!: number;

  @Column({ default: 1 })
  version!: number;

  @Column({ nullable: true })
  activeRequestId?: string;

  @Column({ nullable: true })
  activeOfferId?: string;

  @Column({ nullable: true })
  onlineAt?: Date;

  @Column({ nullable: true })
  offlineAt?: Date;

  @Column({ nullable: true })
  availableSince?: Date;

  @Column({ nullable: true })
  snapshotRefreshedAt?: Date;

  @Column({ nullable: true })
  eligibilitySnapshotRefreshedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  riskSignals?: Record<string, unknown>[];

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_location_unit_recorded', ['dispatchUnitId', 'recordedAt'])
@Entity('universal_dispatch_locations')
export class UniversalDispatchLocation extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  dispatchUnitId!: string;

  @Column({ type: 'bigint' })
  sequence!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  accuracyMeters?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  speedKph?: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  heading?: number;

  @Column()
  recordedAt!: Date;

  @Column({ default: false })
  suspicious!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  riskSignals?: string[];
}

@Index('IDX_ud_request_client_unique', ['requesterUserId', 'clientRequestId'], { unique: true })
@Index('IDX_ud_request_search', ['marketId', 'serviceType', 'status', 'scheduledAt'])
@Entity('universal_service_requests')
export class UniversalServiceRequest extends UniversalDispatchBaseEntity {
  @Column()
  clientRequestId!: string;

  @Index()
  @Column()
  requesterUserId!: string;

  @Column({ nullable: true })
  beneficiaryUserId?: string;

  @Column({ nullable: true })
  organizationId?: string;

  @Column({ type: 'simple-enum', enum: UniversalServiceFamily })
  serviceFamily!: UniversalServiceFamily;

  @Column({ type: 'simple-enum', enum: UniversalServiceType })
  serviceType!: UniversalServiceType;

  @Column({ type: 'simple-enum', enum: UniversalScheduleType })
  scheduleType!: UniversalScheduleType;

  @Column({ nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  recurrenceRule?: Record<string, unknown>;

  @Column({ nullable: true })
  parentRequestId?: string;

  @Column({ default: 'default' })
  marketId!: string;

  @Column({
    type: 'simple-enum',
    enum: UniversalRequestStatus,
    default: UniversalRequestStatus.CREATED,
  })
  status!: UniversalRequestStatus;

  @Column({ type: 'simple-enum', enum: UniversalRequestStatus, nullable: true })
  previousStatus?: UniversalRequestStatus;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLatitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLongitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  dropoffLatitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  dropoffLongitude!: number;

  @Column({ nullable: true })
  pickupAddress?: string;

  @Column({ nullable: true })
  dropoffAddress?: string;

  @Column({ nullable: true })
  passengerCount?: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  cargoWeightKg?: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: numberTransformer,
  })
  cargoVolumeM3?: number;

  @Column({ type: 'simple-json', nullable: true })
  requirements?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  preferences?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  payment?: Record<string, unknown>;

  @Column({ nullable: true })
  fareQuoteId?: string;

  @Column({ nullable: true })
  paymentAuthorizationId?: string;

  @Column({ default: false })
  sharingAllowed!: boolean;

  @Column({ default: 'ONE_WAY' })
  tripType!: string;

  @Column({ nullable: true })
  policyId?: string;

  @Column({ nullable: true })
  policyVersion?: string;

  @Column({ nullable: true })
  assignedDispatchUnitId?: string;

  @Column({ nullable: true })
  assignedAt?: Date;

  @Column({ nullable: true })
  searchStartedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  cancellationCode?: string;

  @Column({ default: 0 })
  currentWave!: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 3,
    transformer: numberTransformer,
  })
  currentRadiusKm!: number;

  @Column({ nullable: true })
  nextMatchAt?: Date;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Column({ default: 1 })
  version!: number;

  @Column({ nullable: true })
  sourceType?: string;

  @Column({ nullable: true })
  sourceId?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_request_stop_unique', ['requestId', 'sequence'], { unique: true })
@Entity('universal_request_stops')
export class UniversalRequestStop extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  requestId!: string;

  @Column()
  sequence!: number;

  @Column({ type: 'simple-enum', enum: UniversalTripStopType })
  type!: UniversalTripStopType;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  earliestAt?: Date;

  @Column({ nullable: true })
  latestAt?: Date;

  @Column({ default: 0 })
  serviceDurationSeconds!: number;

  @Column({
    type: 'simple-enum',
    enum: UniversalStopStatus,
    default: UniversalStopStatus.PENDING,
  })
  status!: UniversalStopStatus;

  @Column({ type: 'simple-json', nullable: true })
  requirements?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_request_requirement_unique', ['requestId', 'code'], { unique: true })
@Entity('universal_request_requirements')
export class UniversalRequestRequirement extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  requestId!: string;

  @Column()
  code!: string;

  @Column()
  category!: string;

  @Column({ default: true })
  mandatory!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  value?: unknown;
}

@Index('IDX_ud_offer_unique', ['requestId', 'dispatchUnitId', 'waveNumber'], { unique: true })
@Index('IDX_ud_offer_pending_expiry', ['status', 'expiresAt'])
@Entity('universal_dispatch_offers')
export class UniversalDispatchOffer extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  requestId!: string;

  @Index()
  @Column()
  dispatchUnitId!: string;

  @Column()
  waveNumber!: number;

  @Column({ type: 'simple-enum', enum: UniversalOfferStatus, default: UniversalOfferStatus.PENDING })
  status!: UniversalOfferStatus;

  @Column({ type: 'simple-enum', enum: UniversalOfferStatus, nullable: true })
  previousStatus?: UniversalOfferStatus;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 8,
    nullable: true,
    transformer: numberTransformer,
  })
  score?: number;

  @Column({ nullable: true })
  pickupEtaSeconds?: number;

  @Column({ nullable: true })
  pickupDistanceMeters?: number;

  @Column({ type: 'simple-json', nullable: true })
  scoreComponents?: Record<string, number>;

  @Column()
  policyVersion!: string;

  @Column()
  offeredAt!: Date;

  @Column()
  expiresAt!: Date;

  @Column({ nullable: true })
  respondedAt?: Date;

  @Column({ nullable: true })
  responseReason?: string;

  @Column({ nullable: true })
  leaseKey?: string;

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'simple-json', nullable: true })
  payload?: Record<string, unknown>;
}

@Index('IDX_ud_assignment_request_unique', ['requestId'], { unique: true })
@Entity('universal_dispatch_assignments')
export class UniversalDispatchAssignment extends UniversalDispatchBaseEntity {
  @Column()
  requestId!: string;

  @Index()
  @Column()
  dispatchUnitId!: string;

  @Column({ nullable: true })
  offerId?: string;

  @Column({
    type: 'simple-enum',
    enum: UniversalAssignmentStatus,
    default: UniversalAssignmentStatus.ACTIVE,
  })
  status!: UniversalAssignmentStatus;

  @Column({ type: 'simple-enum', enum: UniversalAssignmentStatus, nullable: true })
  previousStatus?: UniversalAssignmentStatus;

  /** Nullable unique key populated while assignment status is ACTIVE. */
  @Index({ unique: true })
  @Column({ nullable: true })
  activeDispatchUnitKey?: string;

  @Column()
  assignedAt!: Date;

  @Column({ nullable: true })
  endedAt?: Date;

  @Column()
  policyVersion!: string;

  @Column({ nullable: true })
  decisionTraceId?: string;

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('universal_trip_sessions')
export class UniversalTripSession extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  dispatchUnitId!: string;

  @Index()
  @Column()
  primaryRequestId!: string;

  @Column({ type: 'simple-enum', enum: UniversalServiceType })
  serviceType!: UniversalServiceType;

  @Column({ type: 'simple-enum', enum: UniversalTripStatus, default: UniversalTripStatus.ASSIGNED })
  status!: UniversalTripStatus;

  @Column({ type: 'simple-enum', enum: UniversalTripStatus, nullable: true })
  previousStatus?: UniversalTripStatus;

  @Column({ default: 1 })
  routeVersion!: number;

  @Column({ nullable: true, select: false })
  riderOtpHash?: string;

  @Column({ default: 0 })
  riderOtpAttempts!: number;

  @Column({ nullable: true })
  riderOtpExpiresAt?: Date;

  @Column({ nullable: true })
  riderOtpVerifiedAt?: Date;

  @Column({ nullable: true, select: false })
  packageQrHash?: string;

  @Column({ default: 0 })
  packageQrAttempts!: number;

  @Column({ nullable: true })
  packageQrExpiresAt?: Date;

  @Column({ nullable: true })
  packageQrVerifiedAt?: Date;

  @Column({ nullable: true, select: false })
  recipientCodeHash?: string;

  @Column({ default: 0 })
  recipientCodeAttempts!: number;

  @Column({ nullable: true })
  recipientVerifiedAt?: Date;

  @Column({ nullable: true })
  waitingStartedAt?: Date;

  @Column({ nullable: true })
  startedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'simple-json', nullable: true })
  routeMetrics?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_trip_booking_request_unique', ['requestId'], { unique: true })
@Entity('universal_trip_bookings')
export class UniversalTripBooking extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  tripSessionId!: string;

  @Column()
  requestId!: string;

  @Column()
  requesterUserId!: string;

  @Column({ nullable: true })
  beneficiaryUserId?: string;

  @Column({ nullable: true })
  seatCount?: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numberTransformer,
  })
  cargoWeightKg?: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: numberTransformer,
  })
  cargoVolumeM3?: number;

  @Column({ default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'simple-json', nullable: true })
  fareAllocation?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_trip_stop_unique', ['tripSessionId', 'sequence'], { unique: true })
@Entity('universal_trip_stops')
export class UniversalTripStop extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  tripSessionId!: string;

  @Column({ nullable: true })
  bookingId?: string;

  @Column()
  sequence!: number;

  @Column({ type: 'simple-enum', enum: UniversalTripStopType })
  type!: UniversalTripStopType;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  plannedAt?: Date;

  @Column({ nullable: true })
  arrivedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({
    type: 'simple-enum',
    enum: UniversalStopStatus,
    default: UniversalStopStatus.PENDING,
  })
  status!: UniversalStopStatus;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_policy_unique', ['policyKey', 'version'], { unique: true })
@Entity('universal_dispatch_policies')
export class UniversalDispatchPolicy extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  policyKey!: string;

  @Column()
  version!: string;

  @Index()
  @Column({ type: 'simple-enum', enum: UniversalServiceType })
  serviceType!: UniversalServiceType;

  @Index()
  @Column({ nullable: true })
  marketId?: string;

  @Column({ type: 'simple-enum', enum: DispatchPolicyStatus, default: DispatchPolicyStatus.DRAFT })
  status!: DispatchPolicyStatus;

  @Column({ type: 'simple-json' })
  config!: Record<string, unknown>;

  @Column()
  checksum!: string;

  @Column({ type: 'simple-json', nullable: true })
  validationErrors?: string[];

  @Column({ nullable: true })
  createdByUserId?: string;

  @Column({ nullable: true })
  effectiveFrom?: Date;

  @Column({ nullable: true })
  effectiveUntil?: Date;

  @Column({ nullable: true })
  activatedAt?: Date;

  @Column({ nullable: true })
  retiredAt?: Date;
}

@Index('IDX_ud_trace_request', ['requestId', 'createdAt'])
@Entity('universal_dispatch_decision_traces')
export class UniversalDispatchDecisionTrace extends UniversalDispatchBaseEntity {
  @Index({ unique: true })
  @Column()
  traceId!: string;

  @Column()
  requestId!: string;

  @Column()
  policyVersion!: string;

  @Column({ default: 0 })
  candidateCount!: number;

  @Column({ default: 0 })
  eligibleCount!: number;

  @Column({ nullable: true })
  selectedDispatchUnitId?: string;

  @Column({ type: 'simple-enum', enum: DecisionOutcome })
  outcome!: DecisionOutcome;

  @Column({ type: 'simple-json', nullable: true })
  searchRadiiKm?: number[];

  @Column({ type: 'simple-json', nullable: true })
  exclusionReasonCounts?: Record<string, number>;

  @Column({ type: 'simple-json', nullable: true })
  decisionSummary?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  candidateDetails?: Record<string, unknown>[];

  @Column({ type: 'simple-json', nullable: true })
  offerWaves?: Record<string, unknown>[];

  @Column({ default: false })
  shadow!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_idempotency_unique', ['scope', 'keyHash'], { unique: true })
@Entity('universal_dispatch_idempotency')
export class UniversalDispatchIdempotency extends UniversalDispatchBaseEntity {
  @Column()
  scope!: string;

  @Column()
  keyHash!: string;

  @Column()
  requestHash!: string;

  @Column({ default: 'PROCESSING' })
  status!: string;

  @Column({ nullable: true })
  resourceId?: string;

  @Column({ nullable: true })
  responseStatus?: number;

  @Column({ type: 'simple-json', nullable: true })
  responseBody?: unknown;

  @Column()
  expiresAt!: Date;

  @Column({ nullable: true })
  completedAt?: Date;
}

@Index('IDX_ud_outbox_status_available', ['status', 'availableAt'])
@Entity('universal_dispatch_outbox')
export class UniversalDispatchOutboxEvent extends UniversalDispatchBaseEntity {
  @Index({ unique: true })
  @Column()
  eventId!: string;

  @Column()
  aggregateType!: string;

  @Index()
  @Column()
  aggregateId!: string;

  @Column()
  eventType!: string;

  @Column({ default: 1 })
  eventVersion!: number;

  @Column({ type: 'simple-json' })
  payload!: Record<string, unknown>;

  @Column({ nullable: true })
  traceId?: string;

  @Column({
    type: 'simple-enum',
    enum: UniversalOutboxStatus,
    default: UniversalOutboxStatus.PENDING,
  })
  status!: UniversalOutboxStatus;

  @Column({ default: 0 })
  attempts!: number;

  @Column()
  availableAt!: Date;

  @Column({ nullable: true })
  processingStartedAt?: Date;

  @Column({ nullable: true })
  publishedAt?: Date;

  @Column({ type: 'text', nullable: true })
  lastError?: string;
}

@Entity('universal_dispatch_cancellations')
export class UniversalDispatchCancellation extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  requestId!: string;

  @Column({ nullable: true })
  tripSessionId?: string;

  @Column({ nullable: true })
  actorUserId?: string;

  @Column({ type: 'simple-enum', enum: DispatchCancellationParty })
  actorParty!: DispatchCancellationParty;

  @Column()
  code!: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: numberTransformer,
  })
  latitude?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: numberTransformer,
  })
  longitude?: number;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_ud_exclusion_unique', ['requesterUserId', 'driverId', 'type'], { unique: true })
@Entity('universal_dispatch_exclusions')
export class UniversalDispatchExclusion extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  requesterUserId!: string;

  @Index()
  @Column()
  driverId!: string;

  @Column({ type: 'simple-enum', enum: DispatchExclusionType })
  type!: DispatchExclusionType;

  @Column({ nullable: true })
  requestId?: string;

  @Column({ nullable: true })
  reason?: string;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Column({ default: true })
  active!: boolean;
}

@Index('IDX_state_transition_log_entity', ['entityType', 'entityId', 'createdAt'])
@Entity('state_transition_logs')
export class StateTransitionLog extends UniversalDispatchBaseEntity {
  @Index()
  @Column()
  entityType!: string;

  @Index()
  @Column()
  entityId!: string;

  @Column({ nullable: true })
  fromStatus?: string;

  @Column()
  toStatus!: string;

  @Column({ nullable: true })
  actorType?: string;

  @Column({ nullable: true })
  actorId?: string;

  @Column({ nullable: true })
  reasonCode?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

export const UNIVERSAL_DISPATCH_ENTITIES = [
  DispatchDriverCertification,
  DispatchDriverEntitlement,
  DispatchVehicleCapability,
  DispatchFleetRule,
  DispatchDriverVehicleAssignment,
  DispatchDriverShift,
  DispatchDriverSchedule,
  UniversalDispatchUnit,
  UniversalDispatchLocation,
  UniversalServiceRequest,
  UniversalRequestStop,
  UniversalRequestRequirement,
  UniversalDispatchOffer,
  UniversalDispatchAssignment,
  UniversalTripSession,
  UniversalTripBooking,
  UniversalTripStop,
  UniversalDispatchPolicy,
  UniversalDispatchDecisionTrace,
  UniversalDispatchIdempotency,
  UniversalDispatchOutboxEvent,
  UniversalDispatchCancellation,
  UniversalDispatchExclusion,
  StateTransitionLog,
] as const;
