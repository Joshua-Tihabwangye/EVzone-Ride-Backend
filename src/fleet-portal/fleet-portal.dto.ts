import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { FleetAssetStatus, ServiceType } from '../common/enums';

export class UpdateFleetPortalProfileDto {
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlySpendLimit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) dailySpendLimit?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpsertFleetBranchDto {
  @IsString() name!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() managerName?: string;
  @IsOptional() @IsString() operatingHours?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class PatchFleetBranchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() managerName?: string;
  @IsOptional() @IsString() operatingHours?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateFleetPortalDriverDto {
  @IsOptional() @IsString() fleetAccountId?: string;
  @IsString() displayName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class PatchFleetPortalDriverDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateFleetPortalVehicleDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() fleetAccountId?: string;
  @IsOptional() @IsString() vehicleName?: string;
  @IsString() make!: string;
  @IsString() model!: string;
  @Type(() => Number) @IsInt() @Min(1900) @Max(2200) yearOfManufacture!: number;
  @IsString() licensePlate!: string;
  @IsOptional() @IsString() powertrain?: string;
  @IsOptional() @IsString() vehicleStatus?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() vin?: string;
  @IsOptional() @IsString() countryOfRegistration?: string;
  @IsOptional() @IsString() bodyType?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) connectors?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) batteryKwh?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) acMaxKw?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) dcMaxKw?: number;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class PatchFleetPortalVehicleDto {
  @IsOptional() @IsString() vehicleName?: string;
  @IsOptional() @IsString() make?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2200) yearOfManufacture?: number;
  @IsOptional() @IsString() licensePlate?: string;
  @IsOptional() @IsString() powertrain?: string;
  @IsOptional() @IsString() vehicleStatus?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() vin?: string;
  @IsOptional() @IsString() countryOfRegistration?: string;
  @IsOptional() @IsString() bodyType?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) connectors?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) batteryKwh?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) acMaxKw?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) dcMaxKw?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateFleetPortalDispatchDto {
  @IsObject() pickup!: Record<string, unknown>;
  @IsObject() dropoff!: Record<string, unknown>;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsObject() customer?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedAmount?: number;
  @IsOptional() @IsString() currency?: string;
}

export class PatchFleetPortalDispatchDto {
  @IsOptional() @IsObject() pickup?: Record<string, unknown>;
  @IsOptional() @IsObject() dropoff?: Record<string, unknown>;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsObject() customer?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedAmount?: number;
  @IsOptional() @IsString() currency?: string;
}

export class CreateFleetServiceOrderDto {
  @IsString() customerName!: string;
  @IsOptional() @IsString() assetId?: string;
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class PatchFleetServiceOrderDto {
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class CreateFleetIncidentDto {
  @IsString() category!: string;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsString() status?: string;
  @IsString() description!: string;
  @IsOptional() @IsString() reporterId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class FleetPortalListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
}

export class UpdateFleetResourceStatusDto {
  @IsString() status!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class LinkFleetAssetStatusDto {
  @IsEnum(FleetAssetStatus) status!: FleetAssetStatus;
}
