import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { CorporatePayTransactionStatus, ReconciliationStatus, ServiceType } from '../common/enums';

export class LinkCorporatePayAccountDto {
  @IsString() externalAccountId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) transactionLimit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlyLimit?: number;
  @IsOptional() @IsObject() approvalRules?: Record<string, unknown>;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateCorporatePayAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) transactionLimit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) monthlyLimit?: number;
  @IsOptional() @IsObject() approvalRules?: Record<string, unknown>;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class InitiateCorporatePayDto {
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsString() serviceId!: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() manualBookingId?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() returnUrl?: string;
  @IsOptional() @IsString() externalRequestId?: string;
  @IsOptional() @IsString() externalAuthorizationId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) authorizedAmount?: number;
  @IsOptional() @IsString() approvalId?: string;
  @IsOptional() @IsString() policyId?: string;
  @IsOptional() @IsString() budgetId?: string;
  @IsOptional() @IsString() budgetReservationId?: string;
  @IsOptional() @IsString() costCenterId?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsObject() corporateContext?: Record<string, unknown>;
}

export class CorporatePayWebhookDto {
  @IsString() id!: string;
  @IsString() type!: string;
  @IsObject() data!: Record<string, unknown>;
}

export class UpdateCorporatePayTransactionDto {
  @IsEnum(CorporatePayTransactionStatus) status!: CorporatePayTransactionStatus;
  @IsOptional() @IsString() externalTransactionId?: string;
  @IsOptional() @IsString() reason?: string;
}

export class ReconcileCorporatePayDto {
  @IsString() transactionId!: string;
  @IsOptional() @IsString() externalSettlementId?: string;
  @Type(() => Number) @IsNumber() @Min(0) settledAmount!: number;
  @IsOptional() @IsString() statementDate?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ResolveReconciliationDto {
  @IsEnum(ReconciliationStatus) status!: ReconciliationStatus;
  @IsOptional() @IsString() note?: string;
}

export class CorporatePayRefundDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) amount?: number;
  @IsOptional() @IsString() reason?: string;
}
