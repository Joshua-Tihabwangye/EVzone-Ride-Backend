import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { ReconciliationRunStatus, ReconciliationStatus } from '../common/enums';

export class StartReconciliationRunDto {
  @IsIn(['PAYMENTS', 'PAYOUTS', 'CORPORATEPAY'])
  type!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  tolerance?: number;

  @IsOptional()
  @IsString()
  fileContent?: string;

  @IsOptional()
  @IsString()
  fileMimeType?: string;

  @IsOptional()
  @IsObject()
  columnMapping?: Record<string, string>;
}

export class ResolveReconciliationRecordDto {
  @IsEnum(ReconciliationStatus)
  status!: ReconciliationStatus.RESOLVED | ReconciliationStatus.IGNORED;

  @IsOptional()
  @IsString()
  resolution?: string;
}

export class UploadSettlementDto {
  @IsString()
  provider!: string;

  @IsIn(['PAYMENTS', 'PAYOUTS', 'CORPORATEPAY'])
  type!: string;

  @IsString()
  fileContent!: string;

  @IsOptional()
  @IsString()
  fileMimeType?: string;

  @IsOptional()
  @IsDateString()
  statementDate?: string;

  @IsOptional()
  @IsObject()
  columnMapping?: Record<string, string>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  tolerance?: number;
}

export class ReconciliationRunsQueryDto {
  @IsOptional()
  @IsIn(['PAYMENTS', 'PAYOUTS', 'CORPORATEPAY'])
  type?: string;

  @IsOptional()
  @IsEnum(ReconciliationRunStatus)
  status?: ReconciliationRunStatus;
}

export class ReconciliationRecordsQueryDto {
  @IsOptional()
  @IsEnum(ReconciliationStatus)
  status?: ReconciliationStatus;
}
