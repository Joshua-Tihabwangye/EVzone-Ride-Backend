import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, RideCategory, ServiceType, TripType, VehicleType } from '../common/enums';
import { RidePointDto } from '../rides/rides.dto';

export class CreateCommuteDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @ValidateNested()
  @Type(() => RidePointDto)
  pickup!: RidePointDto;

  @ValidateNested()
  @Type(() => RidePointDto)
  dropoff!: RidePointDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RidePointDto)
  stops?: RidePointDto[];

  @IsObject()
  schedule!: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  nextRunAt?: string;

  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCommuteDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsObject() schedule?: Record<string, unknown>;
  @IsOptional() @IsObject() preferences?: Record<string, unknown>;
  @IsOptional() @IsDateString() nextRunAt?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class BookCommuteDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @IsOptional() @IsEnum(RideCategory) category?: RideCategory;
  @IsOptional() @IsEnum(TripType) tripType?: TripType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) passengerCount?: number;
  @IsOptional() @IsString() promoCode?: string;
  @IsOptional() @IsObject() preferences?: Record<string, unknown>;
}
