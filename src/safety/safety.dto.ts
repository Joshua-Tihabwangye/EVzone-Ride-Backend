import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  EmergencyStatus,
  EmergencyType,
  ServiceType,
  SupportPriority,
  SupportTicketStatus,
} from '../common/enums';

export class CreateEmergencyDto {
  @IsEnum(EmergencyType) type!: EmergencyType;
  @IsOptional() @IsEnum(ServiceType) serviceType?: ServiceType;
  @IsOptional() @IsString() serviceId?: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsArray() notifiedContacts?: Record<string, unknown>[];
}

export class UpdateEmergencyDto {
  @IsEnum(EmergencyStatus) status!: EmergencyStatus;
}

export class CreateTripShareDto {
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsString() serviceId!: string;
  @IsOptional() @IsArray() recipients?: Record<string, unknown>[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) expiresInHours?: number;
}

export class CreateMapReportDto {
  @IsString() type!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateSupportTicketDto {
  @IsOptional() @IsEnum(ServiceType) serviceType?: ServiceType;
  @IsOptional() @IsString() serviceId?: string;
  @IsString() category!: string;
  @IsOptional() @IsEnum(SupportPriority) priority?: SupportPriority;
  @IsString() subject!: string;
  @IsString() description!: string;
}

export class SupportMessageDto {
  @IsString() message!: string;
}

export class UpdateSupportTicketDto {
  @IsOptional() @IsEnum(SupportTicketStatus) status?: SupportTicketStatus;
  @IsOptional() @IsString() assignedToUserId?: string;
  @IsOptional() @IsEnum(SupportPriority) priority?: SupportPriority;
}

export class RequestTripPauseDto {
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsString() serviceId!: string;
  @IsString() reason!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(180) expiresInMinutes?: number;
}

export class RespondTripPauseDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() note?: string;
}

export class ResumeTripDto {
  @IsOptional() @IsString() note?: string;
}
