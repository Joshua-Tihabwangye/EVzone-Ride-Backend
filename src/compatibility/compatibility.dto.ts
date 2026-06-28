import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { DriverAvailabilityStatus, EnergyType, ServiceType, VehicleType } from '../common/enums';

export class CompatDriverPresenceDto {
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @IsOptional()
  location?: { latitude: number; longitude: number; accuracy?: number; heading?: number; speed?: number };
}

export class CompatDriverPreferencesDto {
  @IsObject()
  preferences!: Record<string, unknown>;
}

export class CompatRejectJobDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CompatFeatureFlagPatchDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}

export class CompatAvailabilityDto {
  @IsEnum(DriverAvailabilityStatus)
  status!: DriverAvailabilityStatus;

  @IsOptional()
  @IsString()
  vehicleId?: string;
}

/**
 * Permissive vehicle update DTO for the driver compatibility layer.
 * The frontend still uses legacy field names (`plate`, `type`, `imageKey`,
 * `batterySize`, `range`, etc.) while the backend DTO uses different names.
 * This DTO accepts everything the frontend may send; the controller then maps
 * it to the canonical `UpdateVehicleDto`.
 */
export class CompatUpdateVehicleDto {
  @IsOptional() @IsString() make?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() year?: number;
  @IsOptional() @IsString() plate?: string;
  @IsOptional() @IsString() plateNumber?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @IsOptional() @IsEnum(EnergyType) energyType?: EnergyType;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsObject() accessories?: Record<string, unknown>;
  @IsOptional() @IsString() imageKey?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsNumber() batterySize?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsNumber() range?: number;
  @IsOptional() @IsInt() seats?: number;
  @IsOptional() @IsNumber() cargoCapacityKg?: number;
  @IsOptional() @IsObject() features?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsNumber() dailyRentalRate?: number;
  @IsOptional() @IsNumber() includedDailyKm?: number;
  @IsOptional() @IsNumber() extraKmRate?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
