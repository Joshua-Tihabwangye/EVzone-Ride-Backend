import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ServiceType } from '../common/enums';

export class CreateCommissionRuleDto {
  @IsString()
  name!: string;

  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  fleetId?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  priority?: number;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  driverSharePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  platformFeePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fixedPlatformFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  taxPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  tipPayoutPercent?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateCommissionRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  fleetId?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  priority?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  driverSharePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  platformFeePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fixedPlatformFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  taxPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  tipPayoutPercent?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class CommissionRulesQueryDto {
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  active?: boolean;
}

export class CommissionPreviewDto {
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  fleetId?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;
}
