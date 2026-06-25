import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, RideCategory, RideMode, TripType, VehicleType } from '../common/enums';

export class RidePointDto {
  @IsString() address!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
}

export class EstimateRideDto {
  @ValidateNested() @Type(() => RidePointDto) pickup!: RidePointDto;
  @ValidateNested() @Type(() => RidePointDto) destination!: RidePointDto;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => RidePointDto)
  stops?: RidePointDto[];
  @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @IsOptional() @IsEnum(RideMode) mode?: RideMode;
  @IsOptional() @IsEnum(RideCategory) category?: RideCategory;
  @IsOptional() @IsEnum(TripType) tripType?: TripType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) passengerCount?: number;
  @IsOptional() @IsString() promoCode?: string;
  @IsOptional() @IsObject() extras?: Record<string, number>;
}

export class CreateRideDto extends EstimateRideDto {
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsDateString() returnAt?: string;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsString() beneficiaryContactId?: string;
  @IsOptional() @IsObject() beneficiary?: { name?: string; phone?: string; email?: string };
  @IsOptional() @IsObject() preferences?: Record<string, unknown>;
  @IsOptional() sharingEnabled?: boolean;
}

export class CancelRideDto {
  @IsString() reason!: string;
  @IsOptional() @IsString() comment?: string;
}

export class RescheduleRideDto {
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsDateString() returnAt?: string;
}

export class VerifyRideOtpDto {
  @IsString() code!: string;
}

export class CompleteRideDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) actualDistanceKm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) actualDurationMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) waitingMinutes?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) tolls?: number;
}

export class RideFeedbackDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() message?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) tipAmount?: number;
}

export class AddSharedPassengerDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsPhoneNumber() phone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) seatCount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fareShare?: number;
}
