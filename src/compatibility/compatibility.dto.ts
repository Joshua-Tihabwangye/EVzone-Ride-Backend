import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
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

export class CompatDriverLocationHeartbeatDto {
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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speedKph?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speed?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  timestamp?: number;

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsString()
  routeId?: string;

  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @IsOptional()
  @IsString()
  serviceId?: string;
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
  @IsOptional() @IsBoolean() trainingCompleted?: boolean;
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
