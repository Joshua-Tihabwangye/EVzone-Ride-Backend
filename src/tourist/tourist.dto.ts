import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaymentMethod, VehicleType } from '../common/enums';

export class CreateTourPackageDto {
  @IsString() title!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() countryCode?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(365) durationDays!: number;
  @Type(() => Number) @IsNumber() @Min(0) basePrice!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() itinerary?: Record<string, unknown>[];
  @IsOptional() @IsArray() includedServices?: string[];
  @IsOptional() @IsString() imageUrl?: string;
}

export class TouristQuoteDto {
  @IsOptional() @IsString() tourPackageId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) distanceKm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationDays?: number;
  @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) passengers?: number;
  @IsOptional() @IsString() promoCode?: string;
}

export class CreateTouristBookingDto extends TouristQuoteDto {
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsString() pickupAddress!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) pickupLatitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) pickupLongitude!: number;
  @IsOptional() @IsString() dropoffAddress?: string;
  @IsOptional() @IsString() guideLanguage?: string;
  @IsOptional() @IsArray() itinerary?: Record<string, unknown>[];
  @IsOptional() @IsObject() preferences?: Record<string, unknown>;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
}

export class TouristActionDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) finalAmount?: number;
}
