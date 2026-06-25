import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  DispatchCancellationParty,
  DispatchExclusionType,
  DispatchPolicyStatus,
  DispatchQualificationStatus,
  DispatchShiftStatus,
  DispatchUnitStatus,
  UniversalScheduleType,
  UniversalServiceFamily,
  UniversalServiceType,
  UniversalTripStatus,
  UniversalTripStopType,
} from './domain/universal-dispatch.enums';

export class DispatchGeoPointDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  accuracyMeters?: number;
}

export class SetActiveDispatchVehicleDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  fleetId?: string;

  @IsOptional()
  @IsString()
  marketId?: string;
}

export class GoOnlineDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsEnum(UniversalServiceType, { each: true })
  requestedServices?: UniversalServiceType[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  location?: DispatchGeoPointDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  batterySoc?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  usableRangeKm?: number;
}

export class GoOfflineDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DispatchLocationUpdateDto extends DispatchGeoPointDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence!: number;

  @IsDateString()
  recordedAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(400)
  speedKph?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  batterySoc?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  usableRangeKm?: number;

  @IsOptional()
  @IsString()
  chargingState?: string;
}

export class RequestStopDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence!: number;

  @IsEnum(UniversalTripStopType)
  type!: UniversalTripStopType;

  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  location!: DispatchGeoPointDto;

  @IsOptional()
  @IsDateString()
  earliestAt?: string;

  @IsOptional()
  @IsDateString()
  latestAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400)
  serviceDurationSeconds?: number;

  @IsOptional()
  @IsObject()
  requirements?: Record<string, unknown>;
}

export class RequestRequirementDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category!: string;

  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @IsOptional()
  value?: unknown;
}

export class CreateUniversalServiceRequestDto {
  @IsString()
  @MinLength(6)
  @MaxLength(160)
  clientRequestId!: string;

  @IsEnum(UniversalServiceFamily)
  serviceFamily!: UniversalServiceFamily;

  @IsEnum(UniversalServiceType)
  serviceType!: UniversalServiceType;

  @IsOptional()
  @IsEnum(UniversalScheduleType)
  scheduleType?: UniversalScheduleType;

  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  pickup!: DispatchGeoPointDto;

  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  dropoff!: DispatchGeoPointDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RequestStopDto)
  stops?: RequestStopDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RequestRequirementDto)
  requirementItems?: RequestRequirementDto[];

  @IsOptional()
  @IsUUID()
  beneficiaryUserId?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsObject()
  recurrenceRule?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  passengerCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cargoWeightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cargoVolumeM3?: number;

  @IsOptional()
  @IsObject()
  requirements?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  payment?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  fareQuoteId?: string;

  @IsOptional()
  @IsString()
  paymentAuthorizationId?: string;

  @IsOptional()
  @IsBoolean()
  sharingAllowed?: boolean;

  @IsOptional()
  @IsString()
  tripType?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CancelUniversalRequestDto {
  @IsString()
  reasonCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsEnum(DispatchCancellationParty)
  actorParty?: DispatchCancellationParty;

  @IsOptional()
  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  location?: DispatchGeoPointDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class RescheduleUniversalRequestDto {
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsObject()
  recurrenceRule?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class DeclineUniversalOfferDto {
  @IsString()
  reasonCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AcceptUniversalOfferDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedOfferVersion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedDispatchUnitVersion?: number;
}

export class ArrivalDto {
  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  location!: DispatchGeoPointDto;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsBoolean()
  override?: boolean;

  @IsOptional()
  @IsString()
  overrideReason?: string;
}

export class TransitionUniversalTripDto {
  @IsEnum(UniversalTripStatus)
  targetStatus!: UniversalTripStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stopSequence?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  location?: DispatchGeoPointDto;

  @IsOptional()
  @IsString()
  reasonCode?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class VerifyUniversalTripCodeDto {
  @IsString()
  @Length(4, 256)
  code!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stopSequence?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  location?: DispatchGeoPointDto;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class CreateDispatchPolicyDto {
  @IsString()
  policyKey!: string;

  @IsString()
  version!: string;

  @IsEnum(UniversalServiceType)
  serviceType!: UniversalServiceType;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;
}

export class ValidateDispatchPolicyDto {
  @IsEnum(UniversalServiceType)
  serviceType!: UniversalServiceType;

  @IsObject()
  config!: Record<string, unknown>;
}

export class DispatchPolicyStateDto {
  @IsEnum(DispatchPolicyStatus)
  status!: DispatchPolicyStatus;
}

export class MatchUniversalRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxWaves?: number;

  @IsOptional()
  @IsBoolean()
  shadowMode?: boolean;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ReleaseUniversalAssignmentDto {
  @IsString()
  reasonCode!: string;

  @IsOptional()
  @IsBoolean()
  rematch?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class OptimizeUniversalRouteDto {
  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  origin!: DispatchGeoPointDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RequestStopDto)
  stops!: RequestStopDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DispatchGeoPointDto)
  destination?: DispatchGeoPointDto;

  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown>;
}

export class InsertSharedBookingDto {
  @IsUUID()
  requestId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRouteVersion!: number;
}

export class ChangeDriverDto {
  @IsString()
  reasonCode!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class DispatchUnitAdminStateDto {
  @IsEnum(DispatchUnitStatus)
  status!: DispatchUnitStatus;

  @IsString()
  reasonCode!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpsertDriverCertificationDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsEnum(DispatchQualificationStatus)
  status?: DispatchQualificationStatus;

  @IsOptional()
  @IsString()
  issuer?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpsertDriverEntitlementDto {
  @IsEnum(UniversalServiceType)
  serviceType!: UniversalServiceType;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown>;
}

export class UpsertVehicleCapabilityDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  booleanValue?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  numericValue?: number;

  @IsOptional()
  @IsString()
  textValue?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateDriverShiftDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  fleetId?: string;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsEnum(DispatchShiftStatus)
  status?: DispatchShiftStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  maximumDrivingMinutes?: number;

  @IsOptional()
  @IsObject()
  recurrence?: Record<string, unknown>;
}

export class CreateDriverScheduleDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsEnum(UniversalServiceType)
  serviceType!: UniversalServiceType;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsObject()
  recurrenceRule?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  reservedCapacity?: Record<string, unknown>;
}

export class CreateDispatchExclusionDto {
  @IsUUID()
  driverId!: string;

  @IsEnum(DispatchExclusionType)
  type!: DispatchExclusionType;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
