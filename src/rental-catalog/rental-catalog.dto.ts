import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaymentMethod, VehicleType } from '../common/enums';

export class CreateRentalBranchDto {
  @IsString()
  @Length(2, 50)
  code!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsString()
  @Length(2, 500)
  address!: string;

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
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsObject()
  openingHours?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceAreas?: string[];

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateRentalBranchDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @Length(2, 500) address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsObject() openingHours?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsString({ each: true }) serviceAreas?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateRentalVehicleClassDto {
  @IsString()
  @Length(2, 50)
  code!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsEnum(VehicleType, { each: true })
  vehicleTypes!: VehicleType[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maximumPassengers?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minimumSeats?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) luggageCapacity?: number;
  @IsOptional() @IsObject() features?: Record<string, unknown>;
  @IsOptional() @IsObject() pricing?: Record<string, unknown>;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateRentalVehicleClassDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsEnum(VehicleType, { each: true }) vehicleTypes?: VehicleType[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maximumPassengers?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minimumSeats?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) luggageCapacity?: number;
  @IsOptional() @IsObject() features?: Record<string, unknown>;
  @IsOptional() @IsObject() pricing?: Record<string, unknown>;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateCustomRentalRequestDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() vehicleClassId?: string;
  @IsDateString() pickupAt!: string;
  @IsDateString() returnAt!: string;
  @IsString() pickupLocation!: string;
  @IsString() returnLocation!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) passengerCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) luggageCount?: number;
  @IsOptional() @IsBoolean() withDriver?: boolean;
  @IsOptional() @IsObject() requirements?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) budgetAmount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
}

export class QuoteCustomRentalRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quoteAmount!: number;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class RejectCustomRentalRequestDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}
