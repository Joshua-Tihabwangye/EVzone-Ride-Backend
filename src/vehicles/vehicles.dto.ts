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
import { DocumentType, EnergyType, ServiceType, VehicleType } from '../common/enums';

export class CreateVehicleDto {
  @IsString() make!: string;
  @IsString() model!: string;
  @Type(() => Number) @IsInt() @Min(1980) @Max(2100) year!: number;
  @IsString() plateNumber!: string;
  @IsEnum(VehicleType) vehicleType!: VehicleType;
  @IsEnum(EnergyType) energyType!: EnergyType;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) seats!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cargoCapacityKg?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities!: ServiceType[];
  @IsOptional() @IsObject() features?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) dailyRentalRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) includedDailyKm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) extraKmRate?: number;
}

export class UpdateVehicleDto extends CreateVehicleDto {}

export class VehicleDocumentDto {
  @IsEnum(DocumentType) type!: DocumentType;
  @IsString() fileUrl!: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class SetAccessoriesDto {
  @IsArray()
  accessories!: Array<{
    code: string;
    category: string;
    enabled?: boolean;
    details?: Record<string, unknown>;
  }>;
}
