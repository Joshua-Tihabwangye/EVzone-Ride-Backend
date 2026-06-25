import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
import {
  FleetAssetStatus,
  FleetAssignmentStatus,
  IntegrationStatus,
  MaintenanceStatus,
  OrganizationStatus,
  ServiceType,
  SyncDirection,
} from '../common/enums';

export class CreateFleetProfileDto {
  @IsString() displayName!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsBoolean() schoolShuttleEnabled?: boolean;
  @IsOptional() @IsString() defaultZoneId?: string;
  @IsOptional() @IsString() operationsEmail?: string;
  @IsOptional() @IsString() operationsPhone?: string;
  @IsOptional() @IsObject() dispatchRules?: Record<string, unknown>;
  @IsOptional() @IsObject() payoutConfiguration?: Record<string, unknown>;
}

export class UpdateFleetProfileDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsBoolean() schoolShuttleEnabled?: boolean;
  @IsOptional() @IsString() defaultZoneId?: string;
  @IsOptional() @IsString() operationsEmail?: string;
  @IsOptional() @IsString() operationsPhone?: string;
  @IsOptional() @IsObject() dispatchRules?: Record<string, unknown>;
  @IsOptional() @IsObject() payoutConfiguration?: Record<string, unknown>;
}

export class LinkFleetVehicleDto {
  @IsString() vehicleId!: string;
  @IsOptional() @IsString() ownershipType?: string;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsEnum(FleetAssetStatus) status?: FleetAssetStatus;
  @IsOptional() @IsBoolean() schoolManaged?: boolean;
  @IsOptional() @IsString() schoolId?: string;
  @IsOptional() @IsString() externalSource?: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) routeIds?: string[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateFleetVehicleDto {
  @IsOptional() @IsEnum(FleetAssetStatus) status?: FleetAssetStatus;
  @IsOptional() @IsString() ownershipType?: string;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsBoolean() schoolManaged?: boolean;
  @IsOptional() @IsString() schoolId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) routeIds?: string[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class LinkFleetDriverDto {
  @IsString() driverId!: string;
  @IsOptional() @IsString() engagementType?: string;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsEnum(FleetAssetStatus) status?: FleetAssetStatus;
  @IsOptional() @IsBoolean() schoolManaged?: boolean;
  @IsOptional() @IsString() schoolId?: string;
  @IsOptional() @IsString() externalSource?: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateFleetDriverDto {
  @IsOptional() @IsEnum(FleetAssetStatus) status?: FleetAssetStatus;
  @IsOptional() @IsString() engagementType?: string;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsBoolean() schoolManaged?: boolean;
  @IsOptional() @IsString() schoolId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateFleetAssignmentDto {
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsOptional() @IsString() serviceId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() routeExternalId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateFleetAssignmentDto {
  @IsOptional() @IsEnum(FleetAssignmentStatus) status?: FleetAssignmentStatus;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateMaintenanceRecordDto {
  @IsString() vehicleId!: string;
  @IsString() category!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) odometerKm?: number;
  @IsDateString() scheduledAt!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() serviceProvider?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
}

export class UpdateMaintenanceRecordDto {
  @IsOptional() @IsEnum(MaintenanceStatus) status?: MaintenanceStatus;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsDateString() completedAt?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsString() serviceProvider?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
}

export class CreateSchoolConnectionDto {
  @IsString() schoolId!: string;
  @IsString() schoolName!: string;
  @IsOptional() @IsString() externalTenantId?: string;
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsString() webhookSecret?: string;
  @IsOptional() @IsString() webhookUrl?: string;
  @IsOptional() @IsEnum(SyncDirection) syncDirection?: SyncDirection;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class UpdateSchoolConnectionDto {
  @IsOptional() @IsString() schoolName?: string;
  @IsOptional() @IsString() externalTenantId?: string;
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsString() webhookSecret?: string;
  @IsOptional() @IsString() webhookUrl?: string;
  @IsOptional() @IsEnum(SyncDirection) syncDirection?: SyncDirection;
  @IsOptional() @IsEnum(IntegrationStatus) status?: IntegrationStatus;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class SchoolResourceDto {
  @IsString() resourceType!: string;
  @IsString() externalId!: string;
  @IsOptional() @IsString() localEntityType?: string;
  @IsOptional() @IsString() localEntityId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
  @IsObject() payload!: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class RunSchoolSyncDto {
  @IsOptional() @IsEnum(SyncDirection) direction?: SyncDirection;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsArray() resources?: SchoolResourceDto[];
}

export class FleetListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(ServiceType) serviceType?: ServiceType;
  @IsOptional() @IsEnum(FleetAssetStatus) status?: FleetAssetStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class AdminReviewFleetDto {
  @IsEnum(OrganizationStatus) status!: OrganizationStatus;
  @IsOptional() @IsString() reason?: string;
}
