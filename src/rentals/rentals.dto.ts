import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { InspectionType, PaymentMethod, VehicleType } from '../common/enums';

export class RentalSearchDto {
  @IsDateString() pickupAt!: string;
  @IsDateString() returnAt!: string;
  @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) seats?: number;
}

export class RentalQuoteDto {
  @IsString() vehicleId!: string;
  @IsDateString() pickupAt!: string;
  @IsDateString() returnAt!: string;
  @IsOptional() @IsBoolean() withDriver?: boolean;
}

export class CreateRentalBookingDto extends RentalQuoteDto {
  @IsString() pickupLocation!: string;
  @IsString() returnLocation!: string;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsBoolean() agreementAccepted?: boolean;
}

export class RentalInspectionDto {
  @IsEnum(InspectionType) type!: InspectionType;
  @Type(() => Number) @IsNumber() @Min(0) odometerKm!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) fuelOrChargePercent!: number;
  @IsOptional() @IsArray() photos?: string[];
  @IsOptional() @IsArray() damages?: Record<string, unknown>[];
  @IsOptional() @IsString() notes?: string;
}

export class ExtendRentalDto {
  @IsDateString() returnAt!: string;
}

export class RentalActionDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) damageCharge?: number;
}
