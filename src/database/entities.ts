import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import {
  AccountStatus,
  BookingStatus,
  DeliveryServiceType,
  DeliveryStatus,
  DocumentStatus,
  DocumentType,
  DriverAvailabilityStatus,
  DriverVerificationStatus,
  EmergencyPriority,
  EmergencyStatus,
  EmergencyType,
  EnergyType,
  InspectionType,
  InvitationStatus,
  NotificationType,
  OfferStatus,
  PackageSize,
  PaymentMethod,
  PaymentStatus,
  PayoutStatus,
  CashoutRequestStatus,
  RentalStatus,
  RideCategory,
  RideMode,
  ServiceType,
  StopStatus,
  StopType,
  SupportPriority,
  SupportTicketStatus,
  TrainingProgressStatus,
  TransactionDirection,
  TripType,
  UserRole,
  VehicleStatus,
  VehicleType,
  WalletTransactionType,
  BookingSource,
  CorporatePayTransactionStatus,
  CorporatePayAuthorizationStatus,
  CorporatePayDisputeStatus,
  CorporatePayEvidenceType,
  CorporatePayRequestKind,
  CorporatePayRequestStatus,
  DispatchAssignmentStatus,
  DispatchPriority,
  FleetAssetStatus,
  FleetAssignmentStatus,
  IntegrationStatus,
  MaintenanceStatus,
  ManualBookingStatus,
  MembershipStatus,
  OrganizationMemberRole,
  OrganizationStatus,
  OrganizationType,
  ReconciliationStatus,
  SyncDirection,
  SyncStatus,
  WebhookEventStatus,
  DeliveryRouteStatus,
  MatchingJobStatus,
  LedgerAccountType,
  JournalStatus,
  DomainEventStatus,
  PushPlatform,
  PushDeliveryStatus,
  TripPauseStatus,
} from '../common/enums';
import { numberTransformer } from '../common/utils/money';
import { CommissionRule } from '../commissioning/commission-rule.entity';
import { ReconciliationRecord } from '../reconciliation/entities/reconciliation-record.entity';
import { ReconciliationRun } from '../reconciliation/entities/reconciliation-run.entity';
import { UNIVERSAL_DISPATCH_ENTITIES } from '../universal-dispatch/domain/universal-dispatch.entities';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date | null;
}

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ nullable: true })
  email?: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  phone?: string;

  @Column({ select: false })
  passwordHash!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ type: 'simple-enum', enum: UserRole, default: UserRole.CUSTOMER })
  role!: UserRole;

  @Column({ type: 'simple-enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status!: AccountStatus;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ default: 'en' })
  locale!: string;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ default: 'UG' })
  countryCode!: string;

  @Column({ default: false })
  isEmailVerified!: boolean;

  @Column({ default: false })
  isPhoneVerified!: boolean;

  @Index({ unique: true })
  @Column({ nullable: true })
  externalSubject?: string;

  @Column({ nullable: true })
  identityProvider?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ nullable: true })
  lastLoginAt?: Date;
}

@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Index({ unique: true })
  @Column({ select: false })
  tokenHash!: string;

  @Column()
  expiresAt!: Date;

  @Column({ nullable: true })
  revokedAt?: Date;

  @Column({ nullable: true })
  userAgent?: string;

  @Column({ nullable: true })
  ipAddress?: string;
}

@Entity('otp_codes')
export class OtpCode extends BaseEntity {
  @Index()
  @Column()
  destination!: string;

  @Column({ type: 'varchar' })
  channel!: 'SMS' | 'EMAIL';

  @Column()
  purpose!: string;

  @Column({ select: false })
  codeHash!: string;

  @Column()
  expiresAt!: Date;

  @Column({ nullable: true })
  consumedAt?: Date;

  @Column({ default: 0 })
  attempts!: number;
}

@Entity('user_addresses')
export class UserAddress extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Column()
  label!: string;

  @Column({ default: 'OTHER' })
  type!: string;

  @Column()
  addressLine!: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ default: false })
  isDefault!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  details?: Record<string, unknown>;
}

@Entity('saved_contacts')
export class SavedContact extends BaseEntity {
  @Index()
  @Column()
  ownerUserId!: string;

  @Column({ nullable: true })
  linkedUserId?: string;

  @Column()
  name!: string;

  @Column()
  phone!: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  relationship?: string;

  @Column({ default: false })
  isEmergencyContact!: boolean;
}

@Entity('user_preferences')
export class UserPreference extends BaseEntity {
  @Index({ unique: true })
  @Column()
  userId!: string;

  @Column({ type: 'simple-json', nullable: true })
  routeTypes?: string[];

  @Column({ type: 'simple-json', nullable: true })
  rideTypes?: string[];

  @Column({ type: 'simple-json', nullable: true })
  vehiclePreferences?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  driverPersonality?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  accessibility?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  notificationPreferences?: Record<string, boolean>;

  @Column({ type: 'simple-json', nullable: true })
  servicePreferences?: Record<string, unknown>;
}

@Entity('notifications')
export class Notification extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Column({ type: 'simple-enum', enum: NotificationType, default: NotificationType.SYSTEM })
  type!: NotificationType;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;

  @Column({ nullable: true })
  readAt?: Date;

  @Column({ nullable: true })
  expiresAt?: Date;
}

@Entity('file_assets')
export class FileAsset extends BaseEntity {
  @Index()
  @Column()
  ownerUserId!: string;

  @Index({ unique: true })
  @Column()
  storageKey!: string;

  @Column()
  originalName!: string;

  @Column()
  mimeType!: string;

  @Column()
  sizeBytes!: number;

  @Column()
  url!: string;

  @Column({ default: 'LOCAL' })
  storageProvider!: string;

  @Column({ nullable: true })
  providerPublicId?: string;

  @Column({ nullable: true })
  checksumSha256?: string;

  @Column({ type: 'varchar', default: 'PRIVATE' })
  visibility!: 'PUBLIC' | 'PRIVATE';

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @Index()
  @Column({ nullable: true })
  actorUserId?: string;

  @Column()
  action!: string;

  @Column()
  entityType!: string;

  @Index()
  @Column({ nullable: true })
  entityId?: string;

  @Column({ nullable: true })
  route?: string;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;
}

@Entity('driver_profiles')
export class DriverProfile extends BaseEntity {
  @Index({ unique: true })
  @Column()
  userId!: string;

  @Column({
    type: 'simple-enum',
    enum: DriverVerificationStatus,
    default: DriverVerificationStatus.NOT_STARTED,
  })
  verificationStatus!: DriverVerificationStatus;

  @Column({ type: 'simple-enum', enum: DriverAvailabilityStatus, default: DriverAvailabilityStatus.OFFLINE })
  availabilityStatus!: DriverAvailabilityStatus;

  @Column({ default: 'BEGINNER' })
  level!: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5, transformer: numberTransformer })
  rating!: number;

  @Column({ default: 0 })
  ratingsCount!: number;

  @Column({ default: 0 })
  completedRides!: number;

  @Column({ default: 0 })
  completedDeliveries!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: numberTransformer })
  experienceYears!: number;

  @Column({ nullable: true })
  currentVehicleId?: string;

  @Column({ type: 'simple-json', nullable: true })
  serviceCapabilities?: ServiceType[];

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: numberTransformer })
  lastLatitude?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: numberTransformer })
  lastLongitude?: number;

  @Column({ nullable: true })
  lastLocationAt?: Date;

  @Column({ default: true })
  surgeEnabled!: boolean;

  @Column({ default: true })
  rideSharingEnabled!: boolean;

  @Column({ default: false })
  trainingCompleted!: boolean;

  @Column({ default: 0 })
  drivingMinutesToday!: number;

  @Column({ default: 0 })
  mandatoryRestMinutesRemaining!: number;

  @Column({ type: 'simple-json', nullable: true })
  preferences?: Record<string, unknown>;
}

@Entity('driver_documents')
export class DriverDocument extends BaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Column({ type: 'simple-enum', enum: DocumentType })
  type!: DocumentType;

  @Column({ type: 'simple-enum', enum: DocumentStatus, default: DocumentStatus.IN_REVIEW })
  status!: DocumentStatus;

  @Column()
  fileUrl!: string;

  @Column({ nullable: true })
  issueDate?: Date;

  @Column({ nullable: true })
  expiryDate?: Date;

  @Column({ nullable: true })
  rejectionReason?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ nullable: true })
  reviewedByUserId?: string;

  @Column({ nullable: true })
  reviewedAt?: Date;
}

@Entity('driver_social_links')
export class DriverSocialLink extends BaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Column()
  platform!: string;

  @Column()
  url!: string;
}

@Entity('vehicles')
export class Vehicle extends BaseEntity {
  @Index()
  @Column()
  ownerUserId!: string;

  @Index()
  @Column({ nullable: true })
  assignedDriverId?: string;

  @Column()
  make!: string;

  @Column()
  model!: string;

  @Column()
  year!: number;

  @Index({ unique: true })
  @Column()
  plateNumber!: string;

  @Column({ type: 'simple-enum', enum: VehicleType })
  vehicleType!: VehicleType;

  @Column({ type: 'simple-enum', enum: EnergyType, default: EnergyType.ELECTRIC })
  energyType!: EnergyType;

  @Column({ type: 'simple-enum', enum: VehicleStatus, default: VehicleStatus.PENDING_VERIFICATION })
  status!: VehicleStatus;

  @Column({ default: 4 })
  seats!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numberTransformer })
  cargoCapacityKg!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: numberTransformer })
  batteryCapacityKwh?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: numberTransformer })
  estimatedRangeKm?: number;

  @Column({ nullable: true })
  color?: string;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ type: 'simple-json', nullable: true })
  serviceCapabilities?: ServiceType[];

  @Column({ type: 'simple-json', nullable: true })
  features?: Record<string, unknown>;

  @Column({ default: false })
  isActive!: boolean;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: numberTransformer })
  dailyRentalRate?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: numberTransformer })
  includedDailyKm?: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: numberTransformer })
  extraKmRate?: number;
}

@Entity('vehicle_documents')
export class VehicleDocument extends BaseEntity {
  @Index()
  @Column()
  vehicleId!: string;

  @Column({ type: 'simple-enum', enum: DocumentType })
  type!: DocumentType;

  @Column({ type: 'simple-enum', enum: DocumentStatus, default: DocumentStatus.IN_REVIEW })
  status!: DocumentStatus;

  @Column()
  fileUrl!: string;

  @Column({ nullable: true })
  issueDate?: Date;

  @Column({ nullable: true })
  expiryDate?: Date;

  @Column({ nullable: true })
  rejectionReason?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('vehicle_accessories')
export class VehicleAccessory extends BaseEntity {
  @Index()
  @Column()
  vehicleId!: string;

  @Column()
  code!: string;

  @Column()
  category!: string;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  details?: Record<string, unknown>;
}

@Entity('driver_sessions')
export class DriverSession extends BaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Column()
  startedAt!: Date;

  @Column({ nullable: true })
  endedAt?: Date;

  @Column({ default: 0 })
  onlineSeconds!: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0, transformer: numberTransformer })
  distanceKm!: number;

  @Column({ default: 'ONLINE' })
  status!: string;
}

@Entity('driver_locations')
export class DriverLocation extends BaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Index()
  @Column({ nullable: true })
  serviceId?: string;

  @Column({ type: 'simple-enum', enum: ServiceType, nullable: true })
  serviceType?: ServiceType;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true, transformer: numberTransformer })
  speedKph?: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true, transformer: numberTransformer })
  heading?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: numberTransformer })
  accuracyMeters?: number;

  @Column()
  recordedAt!: Date;
}

@Entity('driver_earning_goals')
export class DriverEarningGoal extends BaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Column()
  periodStart!: Date;

  @Column()
  periodEnd!: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: numberTransformer })
  goalAmount!: number;

  @Column({ default: 'UGX' })
  currency!: string;
}

@Entity('training_modules')
export class TrainingModule extends BaseEntity {
  @Index({ unique: true })
  @Column()
  code!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ nullable: true })
  mediaUrl?: string;

  @Column({ default: 0 })
  sequence!: number;

  @Column({ type: 'simple-json', nullable: true })
  quiz?: Record<string, unknown>;

  @Column({ default: true })
  active!: boolean;

  @VersionColumn()
  version!: number;
}

@Entity('training_progress')
export class TrainingProgress extends BaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Index()
  @Column()
  moduleId!: string;

  @Column({ type: 'simple-enum', enum: TrainingProgressStatus, default: TrainingProgressStatus.NOT_STARTED })
  status!: TrainingProgressStatus;

  @Column({ default: 0 })
  score!: number;

  @Column({ type: 'simple-json', nullable: true })
  answers?: Record<string, unknown>;

  @Column({ nullable: true })
  completedAt?: Date;
}

@Entity('service_zones')
export class ServiceZone extends BaseEntity {
  @Column()
  name!: string;

  @Column({ default: 'UG' })
  countryCode!: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ default: 'Africa/Kampala' })
  timezone!: string;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-json', nullable: true })
  polygon?: Record<string, unknown>;

  @Column({ default: true })
  active!: boolean;
}

@Entity('pricing_rules')
export class PricingRule extends BaseEntity {
  @Index()
  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Index()
  @Column({ nullable: true })
  zoneId?: string;

  @Column({ type: 'simple-enum', enum: VehicleType, nullable: true })
  vehicleType?: VehicleType;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: numberTransformer })
  baseFare!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: numberTransformer })
  perKm!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: numberTransformer })
  perMinute!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: numberTransformer })
  minimumFare!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: numberTransformer })
  bookingFee!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: numberTransformer })
  cancellationFee!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: numberTransformer })
  waitingPerMinute!: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 1, transformer: numberTransformer })
  defaultMultiplier!: number;

  @Column({ type: 'simple-json', nullable: true })
  extras?: Record<string, number>;

  @Column({ default: true })
  active!: boolean;
}

@Entity('surge_zones')
export class SurgeZone extends BaseEntity {
  @Index()
  @Column({ nullable: true })
  zoneId?: string;

  @Column()
  name!: string;

  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 1, transformer: numberTransformer })
  multiplier!: number;

  @Column({ type: 'simple-json', nullable: true })
  polygon?: Record<string, unknown>;

  @Column({ nullable: true })
  startsAt?: Date;

  @Column({ nullable: true })
  endsAt?: Date;

  @Column({ default: true })
  active!: boolean;
}

@Entity('promo_codes')
export class PromoCode extends BaseEntity {
  @Index({ unique: true })
  @Column()
  code!: string;

  @Column({ type: 'simple-enum', enum: ServiceType, nullable: true })
  serviceType?: ServiceType;

  @Column({ type: 'varchar', default: 'PERCENT' })
  discountType!: 'PERCENT' | 'FIXED';

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: numberTransformer })
  value!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: numberTransformer })
  maximumDiscount?: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: numberTransformer })
  minimumSpend!: number;

  @Column({ nullable: true })
  startsAt?: Date;

  @Column({ nullable: true })
  endsAt?: Date;

  @Column({ default: 0 })
  globalUsageLimit!: number;

  @Column({ default: 1 })
  perUserLimit!: number;

  @Column({ default: true })
  active!: boolean;
}

@Entity('promo_redemptions')
export class PromoRedemption extends BaseEntity {
  @Index()
  @Column()
  promoCodeId!: string;

  @Index()
  @Column()
  userId!: string;

  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Column()
  serviceId!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: numberTransformer })
  discountAmount!: number;
}

@Entity('wallets')
export class Wallet extends BaseEntity {
  @Index({ unique: true })
  @Column()
  userId!: string;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  availableBalance!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  pendingBalance!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  reservedForCashout!: number;

  @Column({ default: true })
  active!: boolean;
}

@Index('IDX_wallet_tx_wallet_ref_direction', ['walletId', 'reference', 'direction'], { unique: true })
@Entity('wallet_transactions')
export class WalletTransaction extends BaseEntity {
  @Index()
  @Column()
  walletId!: string;

  @Column({ type: 'simple-enum', enum: WalletTransactionType })
  type!: WalletTransactionType;

  @Column({ type: 'simple-enum', enum: TransactionDirection })
  direction!: TransactionDirection;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  amount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  balanceAfter!: number;

  @Index()
  @Column()
  reference!: string;

  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PAID })
  status!: PaymentStatus;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('payments')
export class Payment extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Index()
  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Index()
  @Column()
  serviceId!: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  amount!: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-enum', enum: PaymentMethod })
  method!: PaymentMethod;

  @Column({ default: 'EVZONE_LOCAL' })
  provider!: string;

  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @Index({ unique: true })
  @Column()
  reference!: string;

  @Column({ nullable: true })
  providerReference?: string;

  @Column({ nullable: true })
  idempotencyKey?: string;

  @Column({ type: 'simple-json', nullable: true })
  breakdown?: Record<string, unknown>;

  @Column({ nullable: true })
  paidAt?: Date;

  @Column({ nullable: true })
  refundedAt?: Date;
}

@Index('IDX_payouts_cashout_idempotency', ['cashoutRequestId', 'idempotencyKey'], { unique: true })
@Entity('payouts')
export class Payout extends BaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Index({ unique: true })
  @Column()
  reference!: string;

  @Column()
  idempotencyKey!: string;

  @Index()
  @Column({ nullable: true })
  cashoutRequestId?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  amount!: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-enum', enum: PayoutStatus, default: PayoutStatus.PENDING })
  status!: PayoutStatus;

  @Column({ default: 'flutterwave' })
  provider!: string;

  @Column()
  destination!: string;

  @Column({ type: 'simple-json', nullable: true })
  destinationDetails?: Record<string, unknown>;

  @Column({ nullable: true })
  providerReference?: string;

  @Column({ nullable: true })
  providerBatchId?: string;

  @Column({ nullable: true })
  providerTransactionId?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  fee?: number;

  @Column({ nullable: true, type: 'text' })
  failureReason?: string;

  @Column({ nullable: true })
  initiatedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  failedAt?: Date;

  @Column({ nullable: true })
  reversedAt?: Date;

  @Column({ nullable: true })
  verifiedAt?: Date;

  @Column({ nullable: true })
  reconciledAt?: Date;

  @Column({ nullable: true })
  initiatedByUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  providerError?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('rides')
export class Ride extends BaseEntity {
  @Index()
  @Column()
  riderId!: string;

  @Index()
  @Column({ nullable: true })
  driverId?: string;

  @Column({ nullable: true })
  vehicleId?: string;

  @Column({ type: 'simple-enum', enum: BookingStatus, default: BookingStatus.REQUESTED })
  status!: BookingStatus;

  @Column({ type: 'simple-enum', enum: RideMode, default: RideMode.ON_DEMAND })
  mode!: RideMode;

  @Column({ type: 'simple-enum', enum: RideCategory, default: RideCategory.STANDARD })
  category!: RideCategory;

  @Column({ type: 'simple-enum', enum: TripType, default: TripType.ONE_WAY })
  tripType!: TripType;

  @Column({ default: 1 })
  passengerCount!: number;

  @Column({ nullable: true })
  scheduledAt?: Date;

  @Column({ nullable: true })
  returnAt?: Date;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0, transformer: numberTransformer })
  estimatedDistanceKm!: number;

  @Column({ default: 0 })
  estimatedDurationMinutes!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  estimatedFare!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  finalFare?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod!: PaymentMethod;

  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;

  @Column({ nullable: true })
  beneficiaryContactId?: string;

  @Column({ type: 'simple-json', nullable: true })
  beneficiary?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  preferences?: Record<string, unknown>;

  @Column({ nullable: true })
  promoCode?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  discountAmount!: number;

  @Column({ select: false })
  verificationCodeHash!: string;

  @Column({ select: false })
  verificationCode!: string;

  @Column({ default: false })
  verificationPassed!: boolean;

  @Column({ nullable: true })
  acceptedAt?: Date;

  @Column({ nullable: true })
  arrivedAt?: Date;

  @Column({ nullable: true })
  startedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  cancelledAt?: Date;

  @Column({ nullable: true })
  cancelledByUserId?: string;

  @Column({ nullable: true })
  cancellationReason?: string;

  @Column({ default: false })
  sharingEnabled!: boolean;
}

@Entity('ride_stops')
export class RideStop extends BaseEntity {
  @Index()
  @Column()
  rideId!: string;

  @Column()
  sequence!: number;

  @Column({ type: 'simple-enum', enum: StopType })
  type!: StopType;

  @Column()
  address!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ type: 'simple-enum', enum: StopStatus, default: StopStatus.PENDING })
  status!: StopStatus;

  @Column({ nullable: true })
  arrivedAt?: Date;

  @Column({ nullable: true })
  departedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  contact?: Record<string, unknown>;
}

@Entity('ride_offers')
export class RideOffer extends BaseEntity {
  @Index()
  @Column()
  rideId!: string;

  @Index()
  @Column()
  driverId!: string;

  @Column({ type: 'simple-enum', enum: OfferStatus, default: OfferStatus.PENDING })
  status!: OfferStatus;

  @Column()
  offeredAt!: Date;

  @Column()
  expiresAt!: Date;

  @Column({ nullable: true })
  respondedAt?: Date;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true, transformer: numberTransformer })
  distanceToPickupKm?: number;
}

@Entity('ride_passengers')
export class RidePassenger extends BaseEntity {
  @Index()
  @Column()
  rideId!: string;

  @Column({ nullable: true })
  userId?: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'varchar', default: 'SHARED' })
  role!: 'MAIN' | 'SHARED';

  @Column({ nullable: true })
  pickupStopId?: string;

  @Column({ nullable: true })
  dropoffStopId?: string;

  @Column({ default: 1 })
  seatCount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  fareShare!: number;

  @Column({ default: 'CONFIRMED' })
  status!: string;
}

@Entity('ride_events')
export class RideEvent extends BaseEntity {
  @Index()
  @Column()
  rideId!: string;

  @Column()
  eventType!: string;

  @Column({ nullable: true })
  actorUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;
}

@Entity('ride_feedback')
export class RideFeedback extends BaseEntity {
  @Index({ unique: true })
  @Column()
  rideId!: string;

  @Column()
  riderId!: string;

  @Column()
  driverId!: string;

  @Column()
  rating!: number;

  @Column({ type: 'text', nullable: true })
  message?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  tipAmount!: number;
}

@Entity('delivery_orders')
export class DeliveryOrder extends BaseEntity {
  @Index()
  @Column()
  customerId!: string;

  @Index()
  @Column({ nullable: true })
  driverId?: string;

  @Column({ nullable: true })
  vehicleId?: string;

  @Index()
  @Column({ nullable: true })
  routeId?: string;

  @Index({ unique: true })
  @Column()
  trackingCode!: string;

  @Column({ type: 'simple-enum', enum: DeliveryStatus, default: DeliveryStatus.CREATED })
  status!: DeliveryStatus;

  @Column({ type: 'simple-enum', enum: DeliveryServiceType })
  serviceType!: DeliveryServiceType;

  @Column()
  packageName!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'simple-enum', enum: PackageSize, default: PackageSize.SMALL })
  packageSize!: PackageSize;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numberTransformer })
  weightKg!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  declaredValue!: number;

  @Column({ default: false })
  fragile!: boolean;

  @Column({ nullable: true })
  scheduledAt?: Date;

  @Column()
  pickupAddress!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLatitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLongitude!: number;

  @Column()
  destinationAddress!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  destinationLatitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  destinationLongitude!: number;

  @Column({ type: 'simple-json' })
  sender!: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  receiver!: Record<string, unknown>;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0, transformer: numberTransformer })
  estimatedDistanceKm!: number;

  @Column({ default: 0 })
  estimatedDurationMinutes!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  estimatedCost!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  finalCost?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod!: PaymentMethod;

  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;

  @Column({ select: false })
  qrTokenHash!: string;

  @Column({ select: false })
  qrToken!: string;

  @Column({ select: false, nullable: true })
  dropoffCodeHash?: string;

  @Column({ select: false, nullable: true })
  dropoffCode?: string;

  @Column({ default: false })
  dropoffVerified!: boolean;

  @Column({ nullable: true })
  pickedUpAt?: Date;

  @Column({ nullable: true })
  deliveredAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  cancellationReason?: string;
}

@Entity('delivery_items')
export class DeliveryItem extends BaseEntity {
  @Index()
  @Column()
  orderId!: string;

  @Column()
  name!: string;

  @Column({ default: 1 })
  quantity!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numberTransformer })
  unitWeightKg!: number;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ type: 'simple-json', nullable: true })
  dimensions?: Record<string, number>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('delivery_stops')
export class DeliveryStop extends BaseEntity {
  @Index()
  @Column()
  orderId!: string;

  @Index()
  @Column({ nullable: true })
  routeId?: string;

  @Column()
  sequence!: number;

  @Column({ type: 'simple-enum', enum: StopType })
  type!: StopType;

  @Column()
  address!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ type: 'simple-enum', enum: StopStatus, default: StopStatus.PENDING })
  status!: StopStatus;

  @Column({ type: 'simple-json', nullable: true })
  contact?: Record<string, unknown>;

  @Column({ nullable: true })
  completedAt?: Date;
}

@Entity('delivery_events')
export class DeliveryEvent extends BaseEntity {
  @Index()
  @Column()
  orderId!: string;

  @Column()
  eventType!: string;

  @Column({ nullable: true })
  actorUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;
}

@Entity('tracking_invitations')
export class TrackingInvitation extends BaseEntity {
  @Index()
  @Column()
  orderId!: string;

  @Column()
  senderUserId!: string;

  @Column({ nullable: true })
  recipientUserId?: string;

  @Column({ nullable: true })
  recipientName?: string;

  @Column({ nullable: true })
  recipientPhone?: string;

  @Column({ nullable: true })
  recipientEmail?: string;

  @Column({ type: 'simple-enum', enum: InvitationStatus, default: InvitationStatus.PENDING })
  status!: InvitationStatus;

  @Index({ unique: true })
  @Column()
  token!: string;

  @Column()
  expiresAt!: Date;
}

@Entity('delivery_feedback')
export class DeliveryFeedback extends BaseEntity {
  @Index({ unique: true })
  @Column()
  orderId!: string;

  @Column()
  customerId!: string;

  @Column({ nullable: true })
  driverId?: string;

  @Column()
  rating!: number;

  @Column({ type: 'text', nullable: true })
  message?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  tipAmount!: number;
}

@Entity('tour_packages')
export class TourPackage extends BaseEntity {
  @Index()
  @Column()
  operatorUserId!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ default: 'UG' })
  countryCode!: string;

  @Column({ default: 1 })
  durationDays!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  basePrice!: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-json', nullable: true })
  itinerary?: Record<string, unknown>[];

  @Column({ type: 'simple-json', nullable: true })
  includedServices?: string[];

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ default: true })
  active!: boolean;
}

@Entity('tourist_bookings')
export class TouristBooking extends BaseEntity {
  @Index()
  @Column()
  customerId!: string;

  @Column({ nullable: true })
  operatorUserId?: string;

  @Column({ nullable: true })
  driverId?: string;

  @Column({ nullable: true })
  vehicleId?: string;

  @Column({ nullable: true })
  tourPackageId?: string;

  @Column({ type: 'simple-enum', enum: BookingStatus, default: BookingStatus.REQUESTED })
  status!: BookingStatus;

  @Column()
  startAt!: Date;

  @Column()
  endAt!: Date;

  @Column()
  pickupAddress!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLatitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLongitude!: number;

  @Column({ nullable: true })
  dropoffAddress?: string;

  @Column({ default: 1 })
  passengers!: number;

  @Column({ nullable: true })
  guideLanguage?: string;

  @Column({ type: 'simple-json', nullable: true })
  itinerary?: Record<string, unknown>[];

  @Column({ type: 'simple-json', nullable: true })
  preferences?: Record<string, unknown>;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  estimatedAmount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  finalAmount?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod!: PaymentMethod;

  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;

  @Column({ nullable: true })
  cancellationReason?: string;
}

@Entity('medical_facilities')
export class MedicalFacility extends BaseEntity {
  @Column()
  name!: string;

  @Column()
  address!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'simple-json', nullable: true })
  services?: string[];

  @Column({ default: true })
  active!: boolean;
}

@Entity('ambulance_requests')
export class AmbulanceRequest extends BaseEntity {
  @Index()
  @Column()
  requesterId!: string;

  @Column({ nullable: true })
  dispatcherId?: string;

  @Column({ nullable: true })
  driverId?: string;

  @Column({ nullable: true })
  vehicleId?: string;

  @Column({ type: 'simple-enum', enum: BookingStatus, default: BookingStatus.REQUESTED })
  status!: BookingStatus;

  @Column({ type: 'simple-enum', enum: EmergencyPriority, default: EmergencyPriority.HIGH })
  priority!: EmergencyPriority;

  @Column()
  patientName!: string;

  @Column({ nullable: true })
  patientPhone?: string;

  @Column({ nullable: true })
  patientAge?: number;

  @Column({ nullable: true })
  medicalCondition?: string;

  @Column({ type: 'simple-json', nullable: true })
  medicalNeeds?: Record<string, unknown>;

  @Column()
  pickupAddress!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLatitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLongitude!: number;

  @Column({ nullable: true })
  destinationAddress?: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: numberTransformer })
  destinationLatitude?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: numberTransformer })
  destinationLongitude?: number;

  @Column({ nullable: true })
  medicalFacilityId?: string;

  @Column({ nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0, transformer: numberTransformer })
  estimatedDistanceKm!: number;

  @Column({ default: 0 })
  estimatedDurationMinutes!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  estimatedCost!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  finalCost?: number;

  @Column({ type: 'simple-enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod!: PaymentMethod;

  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;

  @Column({ default: true })
  consentToShareMedicalInfo!: boolean;

  @Column({ nullable: true })
  cancellationReason?: string;
}

@Entity('ambulance_events')
export class AmbulanceEvent extends BaseEntity {
  @Index()
  @Column()
  requestId!: string;

  @Column()
  eventType!: string;

  @Column({ nullable: true })
  actorUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;
}

@Entity('rental_bookings')
export class RentalBooking extends BaseEntity {
  @Index()
  @Column()
  renterId!: string;

  @Index()
  @Column()
  vehicleId!: string;

  @Column()
  ownerUserId!: string;

  @Column({ nullable: true })
  driverId?: string;

  @Column({ type: 'simple-enum', enum: RentalStatus, default: RentalStatus.REQUESTED })
  status!: RentalStatus;

  @Column()
  pickupAt!: Date;

  @Column()
  returnAt!: Date;

  @Column()
  pickupLocation!: string;

  @Column()
  returnLocation!: string;

  @Column({ default: false })
  withDriver!: boolean;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  dailyRate!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  depositAmount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  estimatedAmount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  finalAmount?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-enum', enum: PaymentMethod, default: PaymentMethod.CARD })
  paymentMethod!: PaymentMethod;

  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numberTransformer })
  mileageLimitKm!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  extraKmRate!: number;

  @Column({ nullable: true })
  agreementAcceptedAt?: Date;

  @Column({ nullable: true })
  cancellationReason?: string;
}

@Entity('rental_inspections')
export class RentalInspection extends BaseEntity {
  @Index()
  @Column()
  bookingId!: string;

  @Column({ type: 'simple-enum', enum: InspectionType })
  type!: InspectionType;

  @Column()
  inspectorUserId!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numberTransformer })
  odometerKm!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100, transformer: numberTransformer })
  fuelOrChargePercent!: number;

  @Column({ type: 'simple-json', nullable: true })
  photos?: string[];

  @Column({ type: 'simple-json', nullable: true })
  damages?: Record<string, unknown>[];

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ nullable: true })
  signedAt?: Date;
}

@Entity('rental_blocks')
export class RentalBlock extends BaseEntity {
  @Index()
  @Column()
  vehicleId!: string;

  @Column()
  startsAt!: Date;

  @Column()
  endsAt!: Date;

  @Column()
  reason!: string;

  @Column({ nullable: true })
  bookingId?: string;
}

@Entity('chat_threads')
export class ChatThread extends BaseEntity {
  @Index()
  @Column()
  contextType!: string;

  @Index()
  @Column()
  contextId!: string;

  @Column()
  createdByUserId!: string;

  @Column({ nullable: true })
  lastMessageAt?: Date;
}

@Entity('chat_participants')
export class ChatParticipant extends BaseEntity {
  @Index()
  @Column()
  threadId!: string;

  @Index()
  @Column()
  userId!: string;

  @Column({ nullable: true })
  lastReadAt?: Date;

  @Column({ default: false })
  muted!: boolean;
}

@Entity('chat_messages')
export class ChatMessage extends BaseEntity {
  @Index()
  @Column()
  threadId!: string;

  @Index()
  @Column()
  senderUserId!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'simple-json', nullable: true })
  attachments?: string[];

  @Column({ nullable: true })
  editedAt?: Date;
}

@Entity('emergency_incidents')
export class EmergencyIncident extends BaseEntity {
  @Index()
  @Column()
  reporterUserId!: string;

  @Column({ nullable: true })
  driverId?: string;

  @Column({ type: 'simple-enum', enum: ServiceType, nullable: true })
  serviceType?: ServiceType;

  @Column({ nullable: true })
  serviceId?: string;

  @Column({ type: 'simple-enum', enum: EmergencyType })
  type!: EmergencyType;

  @Column({ type: 'simple-enum', enum: EmergencyStatus, default: EmergencyStatus.OPEN })
  status!: EmergencyStatus;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ nullable: true })
  address?: string;

  @Column({ default: false })
  sos!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  notifiedContacts?: Record<string, unknown>[];

  @Column({ nullable: true })
  resolvedAt?: Date;
}

@Entity('trip_shares')
export class TripShare extends BaseEntity {
  @Index()
  @Column()
  ownerUserId!: string;

  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Index()
  @Column()
  serviceId!: string;

  @Index({ unique: true })
  @Column()
  token!: string;

  @Column({ type: 'simple-json', nullable: true })
  recipients?: Record<string, unknown>[];

  @Column()
  expiresAt!: Date;

  @Column({ default: true })
  active!: boolean;
}

@Entity('map_reports')
export class MapReport extends BaseEntity {
  @Index()
  @Column()
  reporterUserId!: string;

  @Column()
  type!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ default: 'OPEN' })
  status!: string;
}

@Entity('support_tickets')
export class SupportTicket extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Column({ type: 'simple-enum', enum: ServiceType, nullable: true })
  serviceType?: ServiceType;

  @Column({ nullable: true })
  serviceId?: string;

  @Column()
  category!: string;

  @Column({ type: 'simple-enum', enum: SupportPriority, default: SupportPriority.NORMAL })
  priority!: SupportPriority;

  @Column({ type: 'simple-enum', enum: SupportTicketStatus, default: SupportTicketStatus.OPEN })
  status!: SupportTicketStatus;

  @Column()
  subject!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ nullable: true })
  assignedToUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  messages?: Record<string, unknown>[];
}

@Entity('organizations')
export class Organization extends BaseEntity {
  @Index()
  @Column()
  name!: string;

  @Column({ nullable: true })
  legalName?: string;

  @Column({ type: 'simple-enum', enum: OrganizationType })
  type!: OrganizationType;

  @Column({ type: 'simple-enum', enum: OrganizationStatus, default: OrganizationStatus.PENDING })
  status!: OrganizationStatus;

  @Index({ unique: true })
  @Column()
  code!: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  externalId?: string;

  @Column({ nullable: true })
  registrationNumber?: string;

  @Column({ nullable: true })
  taxIdentificationNumber?: string;

  @Column({ default: 'UG' })
  countryCode!: string;

  @Column({ default: 'Africa/Kampala' })
  timezone!: string;

  @Column({ default: 'UGX' })
  currency!: string;

  @Index()
  @Column()
  primaryOwnerUserId!: string;

  @Column({ nullable: true })
  contactEmail?: string;

  @Column({ nullable: true })
  contactPhone?: string;

  @Column({ type: 'simple-json', nullable: true })
  address?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  serviceCapabilities?: ServiceType[];

  @Column({ type: 'simple-json', nullable: true })
  settings?: Record<string, unknown>;

  @Column({ nullable: true })
  approvedByUserId?: string;

  @Column({ nullable: true })
  approvedAt?: Date;
}

@Entity('organization_members')
@Index(['organizationId', 'userId'], { unique: true })
export class OrganizationMember extends BaseEntity {
  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column()
  userId!: string;

  @Column({ type: 'simple-enum', enum: OrganizationMemberRole })
  role!: OrganizationMemberRole;

  @Column({ type: 'simple-enum', enum: MembershipStatus, default: MembershipStatus.INVITED })
  status!: MembershipStatus;

  @Column({ nullable: true })
  invitedByUserId?: string;

  @Column({ nullable: true })
  invitedAt?: Date;

  @Column({ nullable: true })
  joinedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  permissions?: string[];
}

@Entity('fleet_profiles')
export class FleetProfile extends BaseEntity {
  @Index({ unique: true })
  @Column()
  organizationId!: string;

  @Index({ unique: true })
  @Column()
  code!: string;

  @Column()
  displayName!: string;

  @Column({ type: 'simple-enum', enum: OrganizationStatus, default: OrganizationStatus.PENDING })
  status!: OrganizationStatus;

  @Column({ type: 'simple-json', nullable: true })
  serviceCapabilities?: ServiceType[];

  @Column({ default: false })
  schoolShuttleEnabled!: boolean;

  @Column({ nullable: true })
  defaultZoneId?: string;

  @Column({ nullable: true })
  operationsEmail?: string;

  @Column({ nullable: true })
  operationsPhone?: string;

  @Column({ type: 'simple-json', nullable: true })
  dispatchRules?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  payoutConfiguration?: Record<string, unknown>;
}

@Entity('fleet_vehicles')
@Index(['fleetId', 'vehicleId'], { unique: true })
export class FleetVehicle extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Index()
  @Column()
  vehicleId!: string;

  @Column({ type: 'simple-enum', enum: FleetAssetStatus, default: FleetAssetStatus.PENDING })
  status!: FleetAssetStatus;

  @Column({ default: 'OWNED' })
  ownershipType!: string;

  @Column({ type: 'simple-json', nullable: true })
  serviceCapabilities?: ServiceType[];

  @Column({ default: false })
  schoolManaged!: boolean;

  @Column({ nullable: true })
  schoolId?: string;

  @Column({ nullable: true })
  externalSource?: string;

  @Column({ nullable: true })
  externalId?: string;

  @Column({ type: 'simple-json', nullable: true })
  routeIds?: string[];

  @Column({ nullable: true })
  activatedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('fleet_drivers')
@Index(['fleetId', 'driverId'], { unique: true })
export class FleetDriver extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Index()
  @Column()
  driverId!: string;

  @Column({ type: 'simple-enum', enum: FleetAssetStatus, default: FleetAssetStatus.PENDING })
  status!: FleetAssetStatus;

  @Column({ default: 'CONTRACTOR' })
  engagementType!: string;

  @Column({ type: 'simple-json', nullable: true })
  serviceCapabilities?: ServiceType[];

  @Column({ default: false })
  schoolManaged!: boolean;

  @Column({ nullable: true })
  schoolId?: string;

  @Column({ nullable: true })
  externalSource?: string;

  @Column({ nullable: true })
  externalId?: string;

  @Column({ nullable: true })
  joinedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('fleet_assignments')
export class FleetAssignment extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Index()
  @Column({ nullable: true })
  serviceId?: string;

  @Index()
  @Column({ nullable: true })
  driverId?: string;

  @Index()
  @Column({ nullable: true })
  vehicleId?: string;

  @Column({ type: 'simple-enum', enum: FleetAssignmentStatus, default: FleetAssignmentStatus.PLANNED })
  status!: FleetAssignmentStatus;

  @Column()
  startsAt!: Date;

  @Column({ nullable: true })
  endsAt?: Date;

  @Column()
  assignedByUserId!: string;

  @Column({ nullable: true })
  routeExternalId?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('fleet_maintenance_records')
export class FleetMaintenanceRecord extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Index()
  @Column()
  vehicleId!: string;

  @Column({ type: 'simple-enum', enum: MaintenanceStatus, default: MaintenanceStatus.SCHEDULED })
  status!: MaintenanceStatus;

  @Column()
  category!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numberTransformer })
  odometerKm?: number;

  @Column()
  scheduledAt!: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  cost?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ nullable: true })
  serviceProvider?: string;

  @Column({ type: 'simple-json', nullable: true })
  attachments?: string[];
}

@Entity('school_fleet_connections')
export class SchoolFleetConnection extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Index()
  @Column()
  schoolId!: string;

  @Column()
  schoolName!: string;

  @Column({ nullable: true })
  externalTenantId?: string;

  @Column({ nullable: true })
  baseUrl?: string;

  @Column({ select: false, nullable: true, type: 'text' })
  credentialsEncrypted?: string;

  @Column({ type: 'simple-enum', enum: IntegrationStatus, default: IntegrationStatus.DISCONNECTED })
  status!: IntegrationStatus;

  @Column({ type: 'simple-enum', enum: SyncDirection, default: SyncDirection.BIDIRECTIONAL })
  syncDirection!: SyncDirection;

  @Column({ nullable: true })
  webhookUrl?: string;

  @Column({ nullable: true })
  lastSyncedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  lastError?: string;

  @Column({ type: 'simple-json', nullable: true })
  config?: Record<string, unknown>;
}

@Entity('school_fleet_resources')
@Index(['connectionId', 'resourceType', 'externalId'], { unique: true })
export class SchoolFleetResource extends BaseEntity {
  @Index()
  @Column()
  connectionId!: string;

  @Index()
  @Column()
  fleetId!: string;

  @Column()
  resourceType!: string;

  @Column()
  externalId!: string;

  @Column({ nullable: true })
  localEntityType?: string;

  @Column({ nullable: true })
  localEntityId?: string;

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'simple-json' })
  payload!: Record<string, unknown>;

  @Column()
  checksum!: string;

  @Column({ default: true })
  active!: boolean;

  @Column()
  lastSyncedAt!: Date;
}

@Entity('school_sync_jobs')
export class SchoolSyncJob extends BaseEntity {
  @Index()
  @Column()
  connectionId!: string;

  @Column({ type: 'simple-enum', enum: SyncDirection })
  direction!: SyncDirection;

  @Column({ type: 'simple-enum', enum: SyncStatus, default: SyncStatus.PENDING })
  status!: SyncStatus;

  @Column({ nullable: true })
  resourceType?: string;

  @Column({ nullable: true })
  requestedByUserId?: string;

  @Index({ unique: true })
  @Column()
  correlationId!: string;

  @Column({ default: 0 })
  processedCount!: number;

  @Column({ default: 0 })
  failedCount!: number;

  @Column({ nullable: true })
  startedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  error?: string;

  @Column({ type: 'simple-json', nullable: true })
  summary?: Record<string, unknown>;
}

@Entity('dispatch_desks')
export class DispatchDesk extends BaseEntity {
  @Index()
  @Column()
  organizationId!: string;

  @Index({ unique: true })
  @Column()
  code!: string;

  @Column()
  name!: string;

  @Column({ default: 'Africa/Kampala' })
  timezone!: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  serviceCapabilities?: ServiceType[];

  @Column({ type: 'simple-json', nullable: true })
  zoneIds?: string[];

  @Column({ type: 'simple-json', nullable: true })
  settings?: Record<string, unknown>;
}

@Entity('agent_profiles')
export class AgentProfile extends BaseEntity {
  @Index({ unique: true })
  @Column()
  userId!: string;

  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column({ nullable: true })
  deskId?: string;

  @Index({ unique: true })
  @Column()
  employeeCode!: string;

  @Column({ type: 'simple-enum', enum: MembershipStatus, default: MembershipStatus.ACTIVE })
  status!: MembershipStatus;

  @Column({ default: true })
  canCreateManualBookings!: boolean;

  @Column({ default: true })
  canAssignDrivers!: boolean;

  @Column({ default: false })
  canOverridePricing!: boolean;

  @Column({ default: false })
  canIssueRefunds!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  serviceCapabilities?: ServiceType[];

  @Column({ default: 'support_t1' })
  portalRole!: string;

  @Column({ nullable: true })
  teamId?: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ default: 'AVAILABLE' })
  availabilityStatus!: string;

  @Column({ default: 'Africa/Kampala' })
  timezone!: string;

  @Column({ default: 'en' })
  language!: string;

  @Column({ type: 'simple-json', nullable: true })
  permissions?: string[];

  @Column({ type: 'simple-json', nullable: true })
  preferences?: Record<string, unknown>;

  @Column({ nullable: true })
  trainingGateCompletedAt?: Date;

  @Column({ nullable: true })
  lastActiveAt?: Date;
}

@Entity('manual_bookings')
export class ManualBooking extends BaseEntity {
  @Index({ unique: true })
  @Column()
  reference!: string;

  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column({ nullable: true })
  deskId?: string;

  @Index()
  @Column()
  agentUserId!: string;

  @Column({ type: 'simple-enum', enum: BookingSource, default: BookingSource.AGENT })
  source!: BookingSource;

  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Column({ type: 'simple-enum', enum: ManualBookingStatus, default: ManualBookingStatus.DRAFT })
  status!: ManualBookingStatus;

  @Column({ type: 'simple-enum', enum: DispatchPriority, default: DispatchPriority.NORMAL })
  priority!: DispatchPriority;

  @Index()
  @Column({ nullable: true })
  customerUserId?: string;

  @Column({ type: 'simple-json' })
  customer!: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  bookingPayload!: Record<string, unknown>;

  @Index()
  @Column({ nullable: true })
  serviceId?: string;

  @Column({ nullable: true })
  scheduledAt?: Date;

  @Column({ nullable: true })
  assignedDriverId?: string;

  @Column({ nullable: true })
  assignedVehicleId?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  quotedAmount?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod!: PaymentMethod;

  @Column({ nullable: true })
  corporatePayTransactionId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  @Column({ nullable: true })
  confirmedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  cancelledAt?: Date;
}

@Entity('dispatch_assignments')
export class DispatchAssignment extends BaseEntity {
  @Index()
  @Column()
  manualBookingId!: string;

  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Column({ nullable: true })
  serviceId?: string;

  @Column()
  dispatcherUserId!: string;

  @Column({ nullable: true })
  fleetId?: string;

  @Column({ nullable: true })
  driverId?: string;

  @Column({ nullable: true })
  vehicleId?: string;

  @Column({ type: 'simple-enum', enum: DispatchAssignmentStatus, default: DispatchAssignmentStatus.PENDING })
  status!: DispatchAssignmentStatus;

  @Column({ nullable: true })
  offeredAt?: Date;

  @Column({ nullable: true })
  respondedAt?: Date;

  @Column({ nullable: true })
  startedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  reason?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('dispatch_events')
export class DispatchEvent extends BaseEntity {
  @Index()
  @Column()
  manualBookingId!: string;

  @Column()
  eventType!: string;

  @Column({ nullable: true })
  actorUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;
}

@Entity('dispatch_shifts')
export class DispatchShift extends BaseEntity {
  @Index()
  @Column()
  deskId!: string;

  @Index()
  @Column()
  userId!: string;

  @Column()
  startsAt!: Date;

  @Column()
  endsAt!: Date;

  @Column({ default: 'SCHEDULED' })
  status!: string;

  @Column({ default: 0 })
  handledBookings!: number;

  @Column({ nullable: true })
  checkedInAt?: Date;

  @Column({ nullable: true })
  checkedOutAt?: Date;
}

@Entity('corporate_pay_accounts')
export class CorporatePayAccount extends BaseEntity {
  @Index({ unique: true })
  @Column()
  externalAccountId!: string;

  @Index()
  @Column({ nullable: true })
  organizationId?: string;

  @Index()
  @Column({ nullable: true })
  userId?: string;

  @Column()
  name!: string;

  @Column({ default: 'ACTIVE' })
  status!: string;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  transactionLimit?: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  monthlyLimit?: number;

  @Column({ type: 'simple-json', nullable: true })
  approvalRules?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('corporate_pay_transactions')
export class CorporatePayTransaction extends BaseEntity {
  @Index({ unique: true })
  @Column()
  reference!: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  idempotencyKey?: string;

  @Index()
  @Column({ nullable: true })
  externalTransactionId?: string;

  @Index()
  @Column({ nullable: true })
  accountId?: string;

  @Index()
  @Column({ nullable: true })
  organizationId?: string;

  @Index()
  @Column()
  userId!: string;

  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Index()
  @Column()
  serviceId!: string;

  @Column({ nullable: true })
  manualBookingId?: string;

  @Index()
  @Column({ nullable: true })
  paymentId?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  amount!: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({
    type: 'simple-enum',
    enum: CorporatePayTransactionStatus,
    default: CorporatePayTransactionStatus.CREATED,
  })
  status!: CorporatePayTransactionStatus;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  checkoutUrl?: string;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload?: Record<string, unknown>;

  @Column({ nullable: true, type: 'text' })
  lastError?: string;

  @Column({ nullable: true })
  approvedAt?: Date;

  @Column({ nullable: true })
  paidAt?: Date;

  @Column({ nullable: true })
  refundedAt?: Date;
}

@Entity('corporate_pay_webhook_events')
export class CorporatePayWebhookEvent extends BaseEntity {
  @Index({ unique: true })
  @Column()
  externalEventId!: string;

  @Column()
  eventType!: string;

  @Column({ type: 'simple-enum', enum: WebhookEventStatus, default: WebhookEventStatus.RECEIVED })
  status!: WebhookEventStatus;

  @Column({ default: false })
  signatureValid!: boolean;

  @Column({ type: 'simple-json' })
  payload!: Record<string, unknown>;

  @Column({ nullable: true })
  processedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  error?: string;
}

@Entity('corporate_pay_reconciliations')
export class CorporatePayReconciliation extends BaseEntity {
  @Index()
  @Column()
  transactionId!: string;

  @Index()
  @Column({ nullable: true })
  externalSettlementId?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  expectedAmount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  settledAmount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0, transformer: numberTransformer })
  variance!: number;

  @Column({ type: 'simple-enum', enum: ReconciliationStatus, default: ReconciliationStatus.OPEN })
  status!: ReconciliationStatus;

  @Column({ nullable: true })
  statementDate?: Date;

  @Column({ nullable: true })
  resolvedByUserId?: string;

  @Column({ nullable: true })
  resolvedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('corporate_pay_subject_links')
@Index(['externalOrganizationId', 'externalMemberId'], { unique: true })
export class CorporatePaySubjectLink extends BaseEntity {
  @Index()
  @Column()
  externalOrganizationId!: string;

  @Index()
  @Column()
  externalMemberId!: string;

  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column()
  userId!: string;

  @Index()
  @Column({ nullable: true })
  accountId?: string;

  @Column({ default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('corporate_pay_partner_requests')
@Index(['organizationId', 'externalRequestId'], { unique: true })
export class CorporatePayPartnerRequest extends BaseEntity {
  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column()
  externalRequestId!: string;

  @Index({ unique: true })
  @Column()
  idempotencyKey!: string;

  @Column({ nullable: true })
  externalOrderId?: string;

  @Column({ nullable: true })
  externalOrganizationId?: string;

  @Column({ nullable: true })
  externalMemberId?: string;

  @Index()
  @Column({ nullable: true })
  accountId?: string;

  @Index()
  @Column({ nullable: true })
  userId?: string;

  @Column({ type: 'simple-enum', enum: CorporatePayRequestKind })
  requestKind!: CorporatePayRequestKind;

  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Index()
  @Column({
    type: 'simple-enum',
    enum: CorporatePayRequestStatus,
    default: CorporatePayRequestStatus.DRAFT,
  })
  status!: CorporatePayRequestStatus;

  @Column({ type: 'simple-enum', enum: DispatchPriority, default: DispatchPriority.NORMAL })
  priority!: DispatchPriority;

  @Column({ type: 'simple-json' })
  customer!: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  servicePayload!: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  corporateContext?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  quote?: Record<string, unknown>;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  amount?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ nullable: true })
  scheduledAt?: Date;

  @Column({ nullable: true })
  dueAt?: Date;

  @Column({ nullable: true })
  quoteExpiresAt?: Date;

  @Column({ nullable: true })
  approvalId?: string;

  @Column({ nullable: true })
  authorizationId?: string;

  @Column({
    type: 'simple-enum',
    enum: CorporatePayAuthorizationStatus,
    default: CorporatePayAuthorizationStatus.PENDING,
  })
  authorizationStatus!: CorporatePayAuthorizationStatus;

  @Column({ nullable: true })
  policyId?: string;

  @Column({ nullable: true })
  budgetId?: string;

  @Column({ nullable: true })
  budgetReservationId?: string;

  @Column({ nullable: true })
  costCenterId?: string;

  @Column({ nullable: true })
  groupId?: string;

  @Column({ nullable: true })
  purchaseOrderId?: string;

  @Index()
  @Column({ nullable: true })
  manualBookingId?: string;

  @Index()
  @Column({ nullable: true })
  serviceId?: string;

  @Index()
  @Column({ nullable: true })
  transactionId?: string;

  @Column({ nullable: true })
  parentRequestId?: string;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ nullable: true })
  confirmedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  cancelledAt?: Date;

  @Column({ nullable: true })
  lastSyncedAt?: Date;
}

@Entity('corporate_pay_authorizations')
export class CorporatePayAuthorization extends BaseEntity {
  @Index({ unique: true })
  @Column()
  externalAuthorizationId!: string;

  @Index()
  @Column()
  requestId!: string;

  @Index()
  @Column({ nullable: true })
  accountId?: string;

  @Column({
    type: 'simple-enum',
    enum: CorporatePayAuthorizationStatus,
    default: CorporatePayAuthorizationStatus.PENDING,
  })
  status!: CorporatePayAuthorizationStatus;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  approvedAmount?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ nullable: true })
  approvalId?: string;

  @Column({ nullable: true })
  policyId?: string;

  @Column({ nullable: true })
  budgetId?: string;

  @Column({ nullable: true })
  budgetReservationId?: string;

  @Column({ type: 'simple-json', nullable: true })
  policyDecision?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  approvalContext?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  budgetContext?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Column({ nullable: true })
  consumedAt?: Date;

  @Column({ nullable: true })
  revokedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('corporate_pay_fulfillment_evidence')
export class CorporatePayFulfillmentEvidence extends BaseEntity {
  @Index()
  @Column()
  requestId!: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  externalEvidenceId?: string;

  @Column({ type: 'simple-enum', enum: CorporatePayEvidenceType })
  type!: CorporatePayEvidenceType;

  @Column({ nullable: true })
  url?: string;

  @Column({ nullable: true })
  fileAssetId?: string;

  @Column({ nullable: true })
  sha256?: string;

  @Column({ nullable: true })
  actor?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ nullable: true })
  capturedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('corporate_pay_fulfillment_disputes')
export class CorporatePayFulfillmentDispute extends BaseEntity {
  @Index()
  @Column()
  requestId!: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  externalDisputeId?: string;

  @Column({
    type: 'simple-enum',
    enum: CorporatePayDisputeStatus,
    default: CorporatePayDisputeStatus.OPEN,
  })
  status!: CorporatePayDisputeStatus;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  amount?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-json', nullable: true })
  evidence?: Record<string, unknown>[];

  @Column({ type: 'text', nullable: true })
  resolution?: string;

  @Column({ nullable: true })
  openedAt?: Date;

  @Column({ nullable: true })
  resolvedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('integration_outbox')
export class IntegrationOutbox extends BaseEntity {
  @Index()
  @Column()
  destination!: string;

  @Column()
  aggregateType!: string;

  @Index()
  @Column()
  aggregateId!: string;

  @Column()
  eventType!: string;

  @Column({ type: 'simple-json' })
  payload!: Record<string, unknown>;

  @Column({ default: 'PENDING' })
  status!: string;

  @Column({ default: 0 })
  attempts!: number;

  @Column({ nullable: true })
  nextAttemptAt?: Date;

  @Column({ nullable: true })
  processedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  lastError?: string;
}

@Entity('platform_settings')
export class PlatformSetting extends BaseEntity {
  @Index({ unique: true })
  @Column()
  key!: string;

  @Column()
  category!: string;

  @Column({ type: 'simple-json' })
  value!: unknown;

  @Column({ default: false })
  protected!: boolean;

  @Column({ nullable: true })
  updatedByUserId?: string;
}

@Entity('idempotency_records')
export class IdempotencyRecord extends BaseEntity {
  @Index({ unique: true })
  @Column()
  keyHash!: string;

  @Index()
  @Column()
  scope!: string;

  @Column({ nullable: true })
  userId?: string;

  @Column({ nullable: true })
  requestHash?: string;

  @Column({ default: 'PROCESSING' })
  status!: string;

  @Column({ type: 'simple-json', nullable: true })
  responseBody?: unknown;

  @Column({ nullable: true })
  responseStatus?: number;

  @Column()
  expiresAt!: Date;

  @Column({ nullable: true })
  completedAt?: Date;
}

@Entity('stored_payment_methods')
export class StoredPaymentMethod extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Column()
  type!: string;

  @Column()
  label!: string;

  @Column({ nullable: true })
  provider?: string;

  @Column({ nullable: true, select: false })
  providerToken?: string;

  @Column({ nullable: true })
  maskedValue?: string;

  @Column({ nullable: true })
  expiryMonth?: number;

  @Column({ nullable: true })
  expiryYear?: number;

  @Column({ default: false })
  isDefault!: boolean;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('cashout_requests')
export class CashoutRequest extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Index()
  @Column({ nullable: true })
  driverId?: string;

  @Index({ unique: true })
  @Column()
  reference!: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, transformer: numberTransformer })
  amount!: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-enum', enum: CashoutRequestStatus, default: CashoutRequestStatus.PENDING })
  status!: CashoutRequestStatus;

  @Column({ type: 'simple-json' })
  method!: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @Index()
  @Column({ nullable: true })
  payoutId?: string;

  @Column({ nullable: true })
  provider?: string;

  @Column({ nullable: true })
  providerReference?: string;

  @Column({ nullable: true })
  ledgerJournalReference?: string;

  @Column({ nullable: true })
  reviewedByUserId?: string;

  @Column({ nullable: true })
  reviewedAt?: Date;

  @Column({ nullable: true })
  processedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  failureReason?: string;
}

@Entity('feature_flags')
export class FeatureFlag extends BaseEntity {
  @Index()
  @Column({ default: 'GLOBAL' })
  scope!: string;

  @Index()
  @Column()
  key!: string;

  @Column({ default: false })
  enabled!: boolean;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ type: 'simple-json', nullable: true })
  rules?: Record<string, unknown>;

  @Column({ nullable: true })
  updatedByUserId?: string;
}

@Entity('approval_requests')
export class ApprovalRequest extends BaseEntity {
  @Index()
  @Column()
  entityType!: string;

  @Index()
  @Column()
  entityId!: string;

  @Column({ default: 'PENDING' })
  status!: string;

  @Column()
  requestedByUserId!: string;

  @Column({ nullable: true })
  reviewedByUserId?: string;

  @Column({ nullable: true, type: 'text' })
  notes?: string;

  @Column({ type: 'simple-json', nullable: true })
  payload?: Record<string, unknown>;

  @Column({ nullable: true })
  reviewedAt?: Date;
}

@Entity('risk_cases')
export class RiskCase extends BaseEntity {
  @Index()
  @Column()
  type!: string;

  @Column({ default: 'MEDIUM' })
  severity!: string;

  @Index()
  @Column({ default: 'OPEN' })
  status!: string;

  @Column()
  subjectType!: string;

  @Index()
  @Column()
  subjectId!: string;

  @Column({ nullable: true, type: 'text' })
  notes?: string;

  @Column({ nullable: true })
  assignedToUserId?: string;

  @Column({ nullable: true })
  resolvedByUserId?: string;

  @Column({ nullable: true })
  resolvedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  evidence?: Record<string, unknown>;
}

@Entity('service_configurations')
export class ServiceConfiguration extends BaseEntity {
  @Index({ unique: true })
  @Column()
  key!: string;

  @Column()
  name!: string;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'simple-json' })
  configuration!: Record<string, unknown>;

  @Column({ nullable: true })
  updatedByUserId?: string;
}

@Entity('operational_alerts')
export class OperationalAlert extends BaseEntity {
  @Index()
  @Column()
  type!: string;

  @Column({ default: 'WARNING' })
  severity!: string;

  @Index()
  @Column({ default: 'OPEN' })
  status!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ nullable: true })
  subjectType?: string;

  @Column({ nullable: true })
  subjectId?: string;

  @Column({ type: 'simple-json', nullable: true })
  details?: Record<string, unknown>;

  @Column({ nullable: true })
  acknowledgedByUserId?: string;

  @Column({ nullable: true })
  acknowledgedAt?: Date;

  @Column({ nullable: true })
  resolvedAt?: Date;
}

@Entity('rider_commutes')
export class RiderCommute extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Column()
  name!: string;

  @Column({ type: 'simple-enum', enum: ServiceType, default: ServiceType.RIDE })
  serviceType!: ServiceType;

  @Column({ type: 'simple-json' })
  pickup!: { address: string; latitude: number; longitude: number };

  @Column({ type: 'simple-json' })
  dropoff!: { address: string; latitude: number; longitude: number };

  @Column({ type: 'simple-json', nullable: true })
  stops?: Array<{ address: string; latitude: number; longitude: number }>;

  @Column({ type: 'simple-json' })
  schedule!: Record<string, unknown>;

  @Column({ default: true })
  active!: boolean;

  @Column({ nullable: true })
  nextRunAt?: Date;

  @Column({ nullable: true })
  lastBookedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  preferences?: Record<string, unknown>;
}

@Entity('user_documents')
export class UserDocument extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Column({ default: 'USER' })
  userType!: string;

  @Column()
  documentType!: string;

  @Column()
  fileUrl!: string;

  @Column({ nullable: true })
  fileKey?: string;

  @Column({ nullable: true })
  originalFileName?: string;

  @Column({ nullable: true })
  mimeType?: string;

  @Column({ nullable: true })
  sizeBytes?: number;

  @Column({ nullable: true })
  side?: string;

  @Column({ nullable: true })
  issuedAt?: Date;

  @Column({ nullable: true })
  expiryDate?: Date;

  @Column({ default: 'IN_REVIEW' })
  status!: string;

  @Column({ nullable: true, type: 'text' })
  rejectionReason?: string;

  @Column({ nullable: true })
  verifiedAt?: Date;

  @Column({ nullable: true })
  verifiedByUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('emergency_contacts')
export class EmergencyContact extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Column()
  name!: string;

  @Column()
  phone!: string;

  @Column({ nullable: true })
  relationship?: string;

  @Column({ default: false })
  isPrimary!: boolean;
}

@Entity('onboarding_applications')
export class OnboardingApplication extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Index()
  @Column()
  applicationType!: string;

  @Column({ default: 'DRAFT' })
  status!: string;

  @Column({ default: 0 })
  completionPercent!: number;

  @Column({ type: 'simple-json', nullable: true })
  profileData?: Record<string, unknown>;

  @Column({ nullable: true })
  submittedAt?: Date;

  @Column({ nullable: true })
  reviewedAt?: Date;

  @Column({ nullable: true })
  reviewedByUserId?: string;

  @Column({ nullable: true, type: 'text' })
  reviewNotes?: string;
}

@Entity('onboarding_checklist_items')
export class OnboardingChecklistItem extends BaseEntity {
  @Index()
  @Column()
  applicationId!: string;

  @Column()
  key!: string;

  @Column()
  label!: string;

  @Column({ default: true })
  required!: boolean;

  @Column({ default: 'PENDING' })
  status!: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;

  @Column({ nullable: true })
  completedAt?: Date;
}

@Entity('password_reset_tokens')
export class PasswordResetToken extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Index({ unique: true })
  @Column({ select: false })
  tokenHash!: string;

  @Column()
  expiresAt!: Date;

  @Column({ nullable: true })
  consumedAt?: Date;

  @Column({ nullable: true })
  requestedFromIp?: string;
}

@Entity('device_tokens')
export class DeviceToken extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Index({ unique: true })
  @Column()
  token!: string;

  @Column({ type: 'simple-enum', enum: PushPlatform })
  platform!: PushPlatform;

  @Column({ default: 'FCM' })
  provider!: string;

  @Column({ nullable: true })
  deviceId?: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ nullable: true })
  lastSeenAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('push_deliveries')
export class PushDelivery extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Index()
  @Column({ nullable: true })
  notificationId?: string;

  @Column({ nullable: true })
  deviceTokenId?: string;

  @Column({ default: 'LOCAL' })
  provider!: string;

  @Column({ type: 'simple-enum', enum: PushDeliveryStatus, default: PushDeliveryStatus.PENDING })
  status!: PushDeliveryStatus;

  @Column({ default: 0 })
  attempts!: number;

  @Column({ type: 'simple-json', nullable: true })
  response?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ nullable: true })
  sentAt?: Date;
}

@Entity('domain_events')
export class DomainEventRecord extends BaseEntity {
  @Index({ unique: true })
  @Column()
  eventId!: string;

  @Index()
  @Column()
  topic!: string;

  @Column()
  eventType!: string;

  @Column({ nullable: true })
  aggregateType?: string;

  @Index()
  @Column({ nullable: true })
  aggregateId?: string;

  @Column({ nullable: true })
  eventKey?: string;

  @Column({ type: 'simple-json' })
  payload!: Record<string, unknown>;

  @Column({ type: 'simple-enum', enum: DomainEventStatus, default: DomainEventStatus.PENDING })
  status!: DomainEventStatus;

  @Column({ default: 0 })
  attempts!: number;

  @Column()
  occurredAt!: Date;

  @Column({ nullable: true })
  nextAttemptAt?: Date;

  @Column({ nullable: true })
  publishedAt?: Date;

  @Column({ type: 'text', nullable: true })
  lastError?: string;
}

@Index('IDX_matching_jobs_service', ['serviceType', 'serviceId'], { unique: true })
@Entity('matching_jobs')
export class MatchingJob extends BaseEntity {
  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Column()
  serviceId!: string;

  @Column({ type: 'simple-enum', enum: MatchingJobStatus, default: MatchingJobStatus.QUEUED })
  status!: MatchingJobStatus;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLatitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  pickupLongitude!: number;

  @Column({ type: 'simple-json', nullable: true })
  requiredCapabilities?: string[];

  @Column({ default: 3000 })
  currentRadiusMeters!: number;

  @Column({ default: 25000 })
  maxRadiusMeters!: number;

  @Column({ default: 3000 })
  radiusStepMeters!: number;

  @Column({ default: 5 })
  concurrentOfferLimit!: number;

  @Column({ default: 0 })
  dispatchRound!: number;

  @Column({ nullable: true })
  nextDispatchAt?: Date;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Column({ nullable: true })
  assignedDriverId?: string;

  @Column({ nullable: true })
  exhaustedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Index('IDX_job_offers_job_driver', ['jobId', 'driverId'], { unique: true })
@Entity('job_offers')
export class JobOffer extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  jobId!: string;

  @Index()
  @Column({ type: 'uuid' })
  driverId!: string;

  @Column({ type: 'simple-enum', enum: OfferStatus, default: OfferStatus.PENDING })
  status!: OfferStatus;

  @Column()
  offeredAt!: Date;

  @Column()
  expiresAt!: Date;

  @Column({ nullable: true })
  respondedAt?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: numberTransformer })
  distanceMeters?: number;

  @Column({ default: 1 })
  dispatchRound!: number;

  @Column({ type: 'simple-json', nullable: true })
  payload?: Record<string, unknown>;
}

@Entity('delivery_routes')
export class DeliveryRoute extends BaseEntity {
  @Index()
  @Column({ nullable: true })
  organizationId?: string;

  @Index()
  @Column({ nullable: true })
  driverId?: string;

  @Column({ nullable: true })
  vehicleId?: string;

  @Column()
  name!: string;

  @Column({ type: 'simple-enum', enum: DeliveryRouteStatus, default: DeliveryRouteStatus.DRAFT })
  status!: DeliveryRouteStatus;

  @Column({ nullable: true })
  plannedStartAt?: Date;

  @Column({ nullable: true })
  startedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0, transformer: numberTransformer })
  estimatedDistanceKm!: number;

  @Column({ default: 0 })
  estimatedDurationMinutes!: number;

  @Column({ type: 'simple-json', nullable: true })
  optimization?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('ledger_accounts')
export class LedgerAccount extends BaseEntity {
  @Index({ unique: true })
  @Column()
  code!: string;

  @Column()
  name!: string;

  @Column({ type: 'simple-enum', enum: LedgerAccountType })
  accountType!: LedgerAccountType;

  @Column({ type: 'varchar', default: 'ASSET' })
  accountCategory!: string;

  @Column({ default: 'SYSTEM' })
  ownerType!: string;

  @Index()
  @Column({ nullable: true })
  ownerId?: string;

  @Index()
  @Column({ nullable: true })
  organizationId?: string;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  balance!: number;

  @Column({ default: true })
  active!: boolean;
}

@Entity('ledger_account_period_balances')
@Index(['accountId', 'year', 'month'], { unique: true })
export class LedgerAccountPeriodBalance extends BaseEntity {
  @Index()
  @Column()
  accountId!: string;

  @Column({ type: 'smallint' })
  year!: number;

  @Column({ type: 'smallint' })
  month!: number;

  @Column({ type: 'varchar', default: 'OPEN' })
  status!: 'OPEN' | 'CLOSED';

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  openingBalance!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  closingBalance!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  totalDebits!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  totalCredits!: number;

  @Column({ nullable: true })
  closedAt?: Date;

  @Column({ nullable: true })
  closedByUserId?: string;
}

@Entity('journal_transactions')
export class JournalTransaction extends BaseEntity {
  @Index({ unique: true })
  @Column()
  reference!: string;

  @Column()
  transactionType!: string;

  @Column({ type: 'simple-enum', enum: JournalStatus, default: JournalStatus.PENDING })
  status!: JournalStatus;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'simple-enum', enum: ServiceType, nullable: true })
  serviceType?: ServiceType;

  @Index()
  @Column({ nullable: true })
  serviceId?: string;

  @Column({ default: 'UGX' })
  currency!: string;

  @Index()
  @Column({ nullable: true })
  organizationId?: string;

  @Column({ nullable: true })
  postedAt?: Date;

  @Column({ nullable: true })
  reversedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('ledger_entries')
export class LedgerEntry extends BaseEntity {
  @Index()
  @Column()
  journalId!: string;

  @Index()
  @Column()
  accountId!: string;

  @Column({ type: 'simple-enum', enum: TransactionDirection })
  direction!: TransactionDirection;

  @Column({ type: 'decimal', precision: 18, scale: 2, transformer: numberTransformer })
  amount!: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  balanceAfter!: number;

  @Column({ nullable: true })
  memo?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('earnings_ledger')
export class EarningsLedger extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Index()
  @Column({ nullable: true })
  driverId?: string;

  @Column({ type: 'simple-enum', enum: ServiceType, nullable: true })
  serviceType?: ServiceType;

  @Index()
  @Column({ nullable: true })
  serviceId?: string;

  @Index()
  @Column()
  journalId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  grossAmount!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  platformFee!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  netAmount!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, transformer: numberTransformer })
  tipAmount!: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ default: 'POSTED' })
  status!: string;
}

@Entity('trip_pause_requests')
export class TripPauseRequest extends BaseEntity {
  @Index()
  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Index()
  @Column()
  serviceId!: string;

  @Column()
  requestedByUserId!: string;

  @Column({ type: 'simple-enum', enum: TripPauseStatus, default: TripPauseStatus.REQUESTED })
  status!: TripPauseStatus;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ nullable: true })
  riderConfirmedAt?: Date;

  @Column({ nullable: true })
  driverConfirmedAt?: Date;

  @Column({ nullable: true })
  pausedAt?: Date;

  @Column({ nullable: true })
  resumedAt?: Date;

  @Column({ nullable: true })
  resumeRequestedByUserId?: string;

  @Column({ nullable: true })
  riderResumeConfirmedAt?: Date;

  @Column({ nullable: true })
  driverResumeConfirmedAt?: Date;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('user_places')
@Index('IDX_user_places_user_last_used', ['userId', 'lastUsedAt'])
export class UserPlace extends BaseEntity {
  @Index()
  @Column()
  userId!: string;

  @Column()
  label!: string;

  @Column()
  address!: string;

  @Column({ nullable: true })
  providerPlaceId?: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ default: 'SEARCH' })
  source!: string;

  @Column({ default: false })
  pinned!: boolean;

  @Column({ nullable: true })
  pinLabel?: string;

  @Column({ default: 1 })
  useCount!: number;

  @Column()
  lastUsedAt!: Date;

  @Column({ type: 'simple-enum', enum: ServiceType, nullable: true })
  lastServiceType?: ServiceType;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('rental_branches')
export class RentalBranch extends BaseEntity {
  @Index()
  @Column()
  operatorUserId!: string;

  @Index()
  @Column({ nullable: true })
  organizationId?: string;

  @Index({ unique: true })
  @Column()
  code!: string;

  @Column()
  name!: string;

  @Column()
  address!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numberTransformer })
  longitude!: number;

  @Column({ nullable: true })
  phone?: string;

  @Column({ default: 'Africa/Kampala' })
  timezone!: string;

  @Column({ type: 'simple-json', nullable: true })
  openingHours?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  serviceAreas?: string[];

  @Column({ default: true })
  active!: boolean;
}

@Entity('rental_vehicle_classes')
export class RentalVehicleClass extends BaseEntity {
  @Index()
  @Column({ nullable: true })
  operatorUserId?: string;

  @Index()
  @Column({ nullable: true })
  branchId?: string;

  @Index({ unique: true })
  @Column()
  code!: string;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'simple-json' })
  vehicleTypes!: VehicleType[];

  @Column({ default: 1 })
  minimumSeats!: number;

  @Column({ default: 4 })
  maximumPassengers!: number;

  @Column({ default: 0 })
  luggageCapacity!: number;

  @Column({ type: 'simple-json', nullable: true })
  features?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  pricing?: Record<string, unknown>;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ default: true })
  active!: boolean;
}

@Entity('custom_rental_requests')
export class CustomRentalRequest extends BaseEntity {
  @Index()
  @Column()
  renterId!: string;

  @Index()
  @Column({ nullable: true })
  branchId?: string;

  @Column({ nullable: true })
  requestedVehicleClassId?: string;

  @Column({ default: 'REQUESTED' })
  status!: string;

  @Column()
  pickupAt!: Date;

  @Column()
  returnAt!: Date;

  @Column()
  pickupLocation!: string;

  @Column()
  returnLocation!: string;

  @Column({ default: 1 })
  passengerCount!: number;

  @Column({ default: 0 })
  luggageCount!: number;

  @Column({ default: false })
  withDriver!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  requirements?: Record<string, unknown>;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  budgetAmount?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ type: 'simple-enum', enum: PaymentMethod, default: PaymentMethod.CARD })
  paymentMethod!: PaymentMethod;

  @Column({ nullable: true })
  quotedVehicleId?: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  quoteAmount?: number;

  @Column({ nullable: true })
  quoteExpiresAt?: Date;

  @Column({ nullable: true })
  quotedByUserId?: string;

  @Column({ nullable: true })
  quotedAt?: Date;

  @Column({ nullable: true })
  acceptedAt?: Date;

  @Column({ nullable: true })
  rejectedAt?: Date;

  @Column({ nullable: true })
  rejectionReason?: string;

  @Column({ nullable: true })
  bookingId?: string;
}

@Entity('driver_training_assessments')
@Index('IDX_driver_training_assessment_attempt', ['driverId', 'moduleId', 'attemptNumber'], {
  unique: true,
})
export class DriverTrainingAssessment extends BaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Index()
  @Column()
  moduleId!: string;

  @Column({ default: 1 })
  attemptNumber!: number;

  @Column({ type: 'simple-json', nullable: true })
  answers?: Record<string, unknown>;

  @Column({ default: 0 })
  score!: number;

  @Column({ default: false })
  passed!: boolean;

  @Column()
  submittedAt!: Date;

  @Column({ type: 'simple-json', nullable: true })
  feedback?: Record<string, unknown>;
}

@Entity('driver_training_certificates')
export class DriverTrainingCertificate extends BaseEntity {
  @Index()
  @Column()
  driverId!: string;

  @Index()
  @Column({ nullable: true })
  moduleId?: string;

  @Index({ unique: true })
  @Column()
  certificateNumber!: string;

  @Column()
  title!: string;

  @Column()
  issuedAt!: Date;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Index({ unique: true })
  @Column()
  verificationCode!: string;

  @Column({ default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('service_reviews')
@Index('IDX_service_reviews_unique_reviewer', ['serviceType', 'serviceId', 'reviewerUserId'], {
  unique: true,
})
export class ServiceReview extends BaseEntity {
  @Column({ type: 'simple-enum', enum: ServiceType })
  serviceType!: ServiceType;

  @Index()
  @Column()
  serviceId!: string;

  @Index()
  @Column()
  reviewerUserId!: string;

  @Index()
  @Column({ nullable: true })
  revieweeUserId?: string;

  @Column({ default: 'CUSTOMER' })
  reviewerRole!: string;

  @Column()
  rating!: number;

  @Column({ type: 'simple-json', nullable: true })
  categoryRatings?: Record<string, number>;

  @Column({ type: 'simple-json', nullable: true })
  tags?: string[];

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ default: 'PUBLISHED' })
  status!: string;

  @Column({ default: 'PUBLIC' })
  visibility!: string;

  @Column({ type: 'text', nullable: true })
  response?: string;

  @Column({ nullable: true })
  respondedByUserId?: string;

  @Column({ nullable: true })
  respondedAt?: Date;

  @Column({ nullable: true })
  reportedByUserId?: string;

  @Column({ nullable: true })
  reportReason?: string;

  @Column({ nullable: true })
  reportedAt?: Date;

  @Column({ nullable: true })
  moderatedByUserId?: string;

  @Column({ nullable: true })
  moderatedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('safety_event_logs')
export class SafetyEventLog extends BaseEntity {
  @Index()
  @Column()
  incidentId!: string;

  @Column({ default: 'INCIDENT' })
  referenceType!: string;

  @Column({ type: 'simple-enum', enum: ServiceType, nullable: true })
  serviceType?: ServiceType;

  @Column({ nullable: true })
  serviceId?: string;

  @Column()
  eventType!: string;

  @Column({ nullable: true })
  actorUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;
}

@Entity('fleet_branches')
@Index(['fleetId', 'code'], { unique: true })
export class FleetBranchRecord extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Column()
  code!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  managerName?: string;

  @Column({ nullable: true, type: 'text' })
  operatingHours?: string;

  @Column({ default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: numberTransformer })
  latitude?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: numberTransformer })
  longitude?: number;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('fleet_portal_resources')
@Index(['fleetId', 'resourceType', 'resourceKey'], { unique: true })
export class FleetPortalResource extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Index()
  @Column()
  resourceType!: string;

  @Column()
  resourceKey!: string;

  @Index()
  @Column({ nullable: true })
  parentId?: string;

  @Index()
  @Column({ default: 'ACTIVE' })
  status!: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  scheduledAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true, transformer: numberTransformer })
  amount?: number;

  @Column({ default: 'UGX' })
  currency!: string;

  @Column({ nullable: true })
  createdByUserId?: string;

  @Column({ nullable: true })
  updatedByUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  data?: Record<string, unknown>;
}

@Entity('fleet_portal_configurations')
@Index(['fleetId', 'scope'], { unique: true })
export class FleetPortalConfiguration extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Column()
  scope!: string;

  @Column({ type: 'simple-json' })
  data!: Record<string, unknown>;

  @Column({ nullable: true })
  updatedByUserId?: string;
}

@Entity('fleet_role_definitions')
@Index(['fleetId', 'name'], { unique: true })
export class FleetRoleDefinition extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: '#03cd8c' })
  color!: string;

  @Column({ default: false })
  isSystem!: boolean;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'simple-json' })
  permissions!: Record<string, unknown>;
}

@Entity('fleet_member_invitations')
@Index(['fleetId', 'email', 'status'])
export class FleetMemberInvitation extends BaseEntity {
  @Index()
  @Column()
  fleetId!: string;

  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column()
  email!: string;

  @Column()
  role!: string;

  @Column({ select: false })
  tokenHash!: string;

  @Column({ default: 'PENDING' })
  status!: string;

  @Column()
  expiresAt!: Date;

  @Column()
  invitedByUserId!: string;

  @Column({ nullable: true })
  acceptedByUserId?: string;

  @Column({ nullable: true })
  acceptedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('agent_teams')
@Index(['organizationId', 'name'], { unique: true })
export class AgentTeam extends BaseEntity {
  @Index()
  @Column()
  organizationId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ nullable: true })
  supervisorUserId?: string;

  @Column({ type: 'simple-json', nullable: true })
  queueTypes?: string[];

  @Column({ type: 'simple-json', nullable: true })
  serviceCapabilities?: ServiceType[];

  @Column({ type: 'simple-json', nullable: true })
  memberUserIds?: string[];

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('agent_role_definitions')
@Index(['organizationId', 'name'], { unique: true })
export class AgentRoleDefinition extends BaseEntity {
  @Index()
  @Column()
  organizationId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ default: '#03cd8c' })
  color!: string;

  @Column({ default: false })
  isSystem!: boolean;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'simple-json' })
  permissions!: string[];

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('agent_tasks')
export class AgentTask extends BaseEntity {
  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column({ nullable: true })
  assigneeUserId?: string;

  @Column()
  createdByUserId!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: 'GENERAL' })
  category!: string;

  @Index()
  @Column({ default: 'OPEN' })
  status!: string;

  @Column({ default: 'NORMAL' })
  priority!: string;

  @Column({ nullable: true })
  dueAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  relatedType?: string;

  @Column({ nullable: true })
  relatedId?: string;

  @Column({ type: 'simple-json', nullable: true })
  tags?: string[];

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}

@Entity('agent_drafts')
export class AgentDraft extends BaseEntity {
  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column()
  agentUserId!: string;

  @Index()
  @Column()
  draftType!: string;

  @Column()
  title!: string;

  @Column({ default: 'ACTIVE' })
  status!: string;

  @Column({ nullable: true })
  lastStep?: string;

  @Column({ type: 'simple-json' })
  payload!: Record<string, unknown>;

  @Column({ nullable: true })
  expiresAt?: Date;
}

@Entity('agent_qa_reviews')
export class AgentQaReview extends BaseEntity {
  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column()
  agentUserId!: string;

  @Column({ nullable: true })
  reviewerUserId?: string;

  @Column({ default: 'SUPPORT' })
  interactionType!: string;

  @Column({ nullable: true })
  referenceType?: string;

  @Column({ nullable: true })
  referenceId?: string;

  @Index()
  @Column({ default: 'PENDING' })
  status!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true, transformer: numberTransformer })
  score?: number;

  @Column({ type: 'simple-json', nullable: true })
  rubric?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  feedback?: string;

  @Column({ type: 'simple-json', nullable: true })
  coachingPlan?: Record<string, unknown>;

  @Column({ nullable: true })
  reviewedAt?: Date;
}

@Entity('agent_training_modules')
export class AgentTrainingModule extends BaseEntity {
  @Index({ unique: true })
  @Column()
  code!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ nullable: true })
  mediaUrl?: string;

  @Column({ default: 0 })
  sequence!: number;

  @Column({ default: 80 })
  passingScore!: number;

  @Column({ type: 'simple-json', nullable: true })
  roleScopes?: string[];

  @Column({ type: 'simple-json', nullable: true })
  content?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  quiz?: Record<string, unknown>;

  @Column({ default: true })
  required!: boolean;

  @Column({ default: true })
  active!: boolean;
}

@Entity('agent_training_progress')
@Index(['agentUserId', 'moduleId'], { unique: true })
export class AgentTrainingProgress extends BaseEntity {
  @Index()
  @Column()
  agentUserId!: string;

  @Index()
  @Column()
  moduleId!: string;

  @Column({ default: 'NOT_STARTED' })
  status!: string;

  @Column({ default: 0 })
  progressPercent!: number;

  @Column({ default: 0 })
  score!: number;

  @Column({ default: 0 })
  attempts!: number;

  @Column({ type: 'simple-json', nullable: true })
  answers?: Record<string, unknown>;

  @Column({ nullable: true })
  startedAt?: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  certificateNumber?: string;

  @Column({ nullable: true })
  certificateUrl?: string;
}

@Entity('agent_shift_plans')
export class AgentShiftPlan extends BaseEntity {
  @Index()
  @Column()
  organizationId!: string;

  @Index()
  @Column()
  userId!: string;

  @Column({ nullable: true })
  teamId?: string;

  @Column({ default: 'Africa/Kampala' })
  timezone!: string;

  @Column()
  startsAt!: Date;

  @Column()
  endsAt!: Date;

  @Column({ default: 'SCHEDULED' })
  status!: string;

  @Column({ type: 'simple-json', nullable: true })
  recurrence?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  breaks?: Record<string, unknown>[];

  @Column({ nullable: true })
  checkedInAt?: Date;

  @Column({ nullable: true })
  checkedOutAt?: Date;
}

export const ENTITIES = [
  User,
  RefreshToken,
  OtpCode,
  UserAddress,
  SavedContact,
  UserPreference,
  Notification,
  FileAsset,
  AuditLog,
  DriverProfile,
  DriverDocument,
  DriverSocialLink,
  Vehicle,
  VehicleDocument,
  VehicleAccessory,
  DriverSession,
  DriverLocation,
  DriverEarningGoal,
  TrainingModule,
  TrainingProgress,
  ServiceZone,
  PricingRule,
  SurgeZone,
  PromoCode,
  PromoRedemption,
  Wallet,
  WalletTransaction,
  Payment,
  Payout,
  Ride,
  RideStop,
  RideOffer,
  RidePassenger,
  RideEvent,
  RideFeedback,
  DeliveryOrder,
  DeliveryItem,
  DeliveryStop,
  DeliveryEvent,
  TrackingInvitation,
  DeliveryFeedback,
  TourPackage,
  TouristBooking,
  MedicalFacility,
  AmbulanceRequest,
  AmbulanceEvent,
  RentalBooking,
  RentalInspection,
  RentalBlock,
  ChatThread,
  ChatParticipant,
  ChatMessage,
  EmergencyIncident,
  TripShare,
  MapReport,
  SupportTicket,
  Organization,
  OrganizationMember,
  FleetProfile,
  FleetVehicle,
  FleetDriver,
  FleetAssignment,
  FleetMaintenanceRecord,
  FleetBranchRecord,
  FleetPortalResource,
  FleetPortalConfiguration,
  FleetRoleDefinition,
  FleetMemberInvitation,
  SchoolFleetConnection,
  SchoolFleetResource,
  SchoolSyncJob,
  DispatchDesk,
  AgentProfile,
  ManualBooking,
  DispatchAssignment,
  DispatchEvent,
  DispatchShift,
  CorporatePayAccount,
  CorporatePayTransaction,
  CorporatePayWebhookEvent,
  CorporatePayReconciliation,
  CorporatePaySubjectLink,
  CorporatePayPartnerRequest,
  CorporatePayAuthorization,
  CorporatePayFulfillmentEvidence,
  CorporatePayFulfillmentDispute,
  IntegrationOutbox,
  PlatformSetting,
  IdempotencyRecord,
  StoredPaymentMethod,
  CashoutRequest,
  FeatureFlag,
  ApprovalRequest,
  RiskCase,
  ServiceConfiguration,
  OperationalAlert,
  RiderCommute,
  UserDocument,
  EmergencyContact,
  OnboardingApplication,
  OnboardingChecklistItem,
  PasswordResetToken,
  DeviceToken,
  PushDelivery,
  DomainEventRecord,
  MatchingJob,
  JobOffer,
  DeliveryRoute,
  LedgerAccount,
  LedgerAccountPeriodBalance,
  JournalTransaction,
  LedgerEntry,
  EarningsLedger,
  CommissionRule,
  ReconciliationRun,
  ReconciliationRecord,
  TripPauseRequest,
  UserPlace,
  RentalBranch,
  RentalVehicleClass,
  CustomRentalRequest,
  DriverTrainingAssessment,
  DriverTrainingCertificate,
  ServiceReview,
  SafetyEventLog,
  AgentTeam,
  AgentRoleDefinition,
  AgentTask,
  AgentDraft,
  AgentQaReview,
  AgentTrainingModule,
  AgentTrainingProgress,
  AgentShiftPlan,
  ...UNIVERSAL_DISPATCH_ENTITIES,
] as const;
