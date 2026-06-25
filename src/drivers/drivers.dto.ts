import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { DocumentType, DriverAvailabilityStatus, ServiceType } from '../common/enums';

export class OnboardDriverDto {
  @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities!: ServiceType[];
  @IsOptional() @IsObject() preferences?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(80) experienceYears?: number;
}

export class DriverAvailabilityDto {
  @IsEnum(DriverAvailabilityStatus) status!: DriverAvailabilityStatus;
  @IsOptional() @IsString() vehicleId?: string;
}

export class DriverLocationDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) speedKph?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(360) heading?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) accuracyMeters?: number;
  @IsOptional() @IsEnum(ServiceType) serviceType?: ServiceType;
  @IsOptional() @IsString() serviceId?: string;
}

export class DriverDocumentDto {
  @IsEnum(DocumentType) type!: DocumentType;
  @IsString() fileUrl!: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class EarningGoalDto {
  @Type(() => Number) @IsNumber() @Min(1) goalAmount!: number;
  @IsOptional() @IsDateString() periodStart?: string;
}

export class TrainingProgressDto {
  @IsOptional() @IsObject() answers?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) score?: number;
}
