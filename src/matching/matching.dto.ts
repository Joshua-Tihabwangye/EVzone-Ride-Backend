import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { ServiceType } from '../common/enums';

export class CreateMatchingJobDto {
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsString() serviceId!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) pickupLatitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) pickupLongitude!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(250) currentRadiusMeters?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(250) maxRadiusMeters?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) radiusStepMeters?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25) concurrentOfferLimit?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class RejectMatchingOfferDto {
  @IsOptional() @IsString() reason?: string;
}
