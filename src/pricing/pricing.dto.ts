import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ServiceType, VehicleType } from '../common/enums';

export class QuoteDto {
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @Type(() => Number) @IsNumber() @Min(0) distanceKm!: number;
  @Type(() => Number) @IsNumber() @Min(0) durationMinutes!: number;
  @IsOptional() @IsString() promoCode?: string;
  @IsOptional() @IsObject() extras?: Record<string, number>;
}

export class CreatePricingRuleDto {
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsOptional() @IsString() zoneId?: string;
  @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @Type(() => Number) @IsNumber() @Min(0) baseFare!: number;
  @Type(() => Number) @IsNumber() @Min(0) perKm!: number;
  @Type(() => Number) @IsNumber() @Min(0) perMinute!: number;
  @Type(() => Number) @IsNumber() @Min(0) minimumFare!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) bookingFee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cancellationFee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) waitingPerMinute?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) @Max(10) defaultMultiplier?: number;
  @IsOptional() @IsObject() extras?: Record<string, number>;
}

export class CreateSurgeZoneDto {
  @IsOptional() @IsString() zoneId?: string;
  @IsString() name!: string;
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @Type(() => Number) @IsNumber() @Min(1) @Max(10) multiplier!: number;
  @IsOptional() @IsObject() polygon?: Record<string, unknown>;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreatePromoCodeDto {
  @IsString() code!: string;
  @IsOptional() @IsEnum(ServiceType) serviceType?: ServiceType;
  @IsIn(['PERCENT', 'FIXED']) discountType!: 'PERCENT' | 'FIXED';
  @Type(() => Number) @IsNumber() @Min(0) value!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maximumDiscount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumSpend?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) globalUsageLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) perUserLimit?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
