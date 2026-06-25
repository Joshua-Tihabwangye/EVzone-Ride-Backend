import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { DriverAvailabilityStatus } from '../common/enums';

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
