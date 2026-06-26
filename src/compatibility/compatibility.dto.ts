import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { DriverAvailabilityStatus, ServiceType } from '../common/enums';

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

export class CompatDriverProfilePatchDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() streetAddress?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() landmark?: string;
  @IsOptional() @IsString() nationalIdNumber?: string;
  @IsOptional() @IsString() profilePhoto?: string;
}

export class CompatDriverPreferencesDto {
  @IsObject()
  preferences!: Record<string, unknown>;
}

export class CompatDriverServiceCapabilitiesDto {
  @IsArray()
  @IsEnum(ServiceType, { each: true })
  serviceCapabilities!: ServiceType[];
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

export class CompatSocialLinkDto {
  @IsString()
  platform!: string;

  @IsString()
  url!: string;
}
