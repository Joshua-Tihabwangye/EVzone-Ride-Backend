import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertFeatureFlagDto {
  @ApiProperty({ example: 'shared_rides' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  key!: string;

  @ApiPropertyOptional({ default: 'GLOBAL' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}

export class CreateApprovalDto {
  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class DecideApprovalDto {
  @IsIn(['APPROVED', 'REJECTED', 'CANCELLED'])
  status!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRiskCaseDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: string;

  @IsString()
  subjectType!: string;

  @IsString()
  subjectId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class UpdateRiskCaseDto {
  @IsOptional()
  @IsIn(['OPEN', 'INVESTIGATING', 'ESCALATED', 'RESOLVED', 'DISMISSED'])
  status?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}

export class UpsertServiceConfigurationDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsObject()
  configuration!: Record<string, unknown>;
}

export class ResolveOperationalAlertDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
