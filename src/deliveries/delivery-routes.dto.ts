import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { StopStatus } from '../common/enums';

export class CreateDeliveryRouteDto {
  @IsString() name!: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsDateString() plannedStartAt?: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) orderIds!: string[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class AddDeliveryRouteOrdersDto {
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) orderIds!: string[];
}

export class DispatchDeliveryRouteDto {
  @IsString() driverId!: string;
  @IsString() vehicleId!: string;
  @IsOptional() @IsDateString() plannedStartAt?: string;
}

export class UpdateDeliveryRouteStopDto {
  @IsEnum(StopStatus) status!: StopStatus;
  @IsOptional() @IsString() proofUrl?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CompleteDeliveryRouteDto {
  @IsOptional() @Type(() => Boolean) @IsBoolean() force?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) actualDistanceKm?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
