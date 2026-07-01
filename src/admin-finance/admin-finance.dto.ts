import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminFinanceListQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
}

export class ReviewCashoutAdminDto {
  @IsString() status!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() provider?: string;
}

export class RefundPaymentAdminDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class CreateSettlementBatchDto {
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) totalCount?: number;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsDateString() settlementDate?: string;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class CreateWalletReconciliationDto {
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() runId?: string;
}
