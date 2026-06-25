import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  MembershipStatus,
  OrganizationMemberRole,
  OrganizationStatus,
  OrganizationType,
  ServiceType,
} from '../common/enums';

export class CreateOrganizationDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsEnum(OrganizationType) type!: OrganizationType;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsString() taxIdentificationNumber?: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsPhoneNumber() contactPhone?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsString() taxIdentificationNumber?: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsPhoneNumber() contactPhone?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class InviteOrganizationMemberDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsPhoneNumber() phone?: string;
  @IsEnum(OrganizationMemberRole) role!: OrganizationMemberRole;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}

export class UpdateOrganizationMemberDto {
  @IsOptional() @IsEnum(OrganizationMemberRole) role?: OrganizationMemberRole;
  @IsOptional() @IsEnum(MembershipStatus) status?: MembershipStatus;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}

export class ReviewOrganizationDto {
  @IsEnum(OrganizationStatus) status!: OrganizationStatus;
  @IsOptional() @IsString() reason?: string;
}

export class OrganizationQueryDto {
  @IsOptional() @IsEnum(OrganizationType) type?: OrganizationType;
  @IsOptional() @IsEnum(OrganizationStatus) status?: OrganizationStatus;
  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) limit?: number;
  @IsOptional() @IsString() search?: string;
}
