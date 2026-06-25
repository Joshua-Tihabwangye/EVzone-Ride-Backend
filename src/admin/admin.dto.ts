import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import {
  AccountStatus,
  DocumentStatus,
  DriverVerificationStatus,
  OrganizationStatus,
  UserRole,
  VehicleStatus,
} from '../common/enums';

export class UpdateUserStatusDto {
  @IsEnum(AccountStatus)
  status!: AccountStatus;
}

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

export class ReviewDocumentDto {
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class ReviewDriverDto {
  @IsEnum(DriverVerificationStatus)
  verificationStatus!: DriverVerificationStatus;
}

export class ReviewVehicleDto {
  @IsEnum(VehicleStatus)
  status!: VehicleStatus;
}

export class ReviewOrganizationDto {
  @IsEnum(OrganizationStatus)
  status!: OrganizationStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpsertPlatformSettingDto {
  @IsString()
  category!: string;

  @IsObject()
  value!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  protected?: boolean;
}
