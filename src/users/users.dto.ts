import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 80) firstName?: string;
  @IsOptional() @IsString() @Length(1, 80) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsPhoneNumber() phone?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsString() countryCode?: string;
}

export class CreateAddressDto {
  @IsString() label!: string;
  @IsOptional() @IsString() type?: string;
  @IsString() addressLine!: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class UpdateAddressDto extends CreateAddressDto {}

export class CreateContactDto {
  @IsString() name!: string;
  @IsString() phone!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() relationship?: string;
  @IsOptional() @IsBoolean() isEmergencyContact?: boolean;
}

export class UpdatePreferencesDto {
  @IsOptional() routeTypes?: string[];
  @IsOptional() rideTypes?: string[];
  @IsOptional() @IsObject() vehiclePreferences?: Record<string, unknown>;
  @IsOptional() @IsObject() driverPersonality?: Record<string, unknown>;
  @IsOptional() @IsObject() accessibility?: Record<string, unknown>;
  @IsOptional() @IsObject() notificationPreferences?: Record<string, boolean>;
  @IsOptional() @IsObject() servicePreferences?: Record<string, unknown>;
}
