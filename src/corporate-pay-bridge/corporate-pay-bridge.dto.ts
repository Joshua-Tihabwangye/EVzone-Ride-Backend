import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CorporatePayAuthorizationStatus,
  CorporatePayDisputeStatus,
  CorporatePayEvidenceType,
  CorporatePayRequestKind,
  CorporatePayRequestStatus,
  DispatchPriority,
  ServiceType,
} from '../common/enums';

export class CorporatePayOrganizationSelectorDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  externalOrganizationId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;
}

export class CorporatePayCustomerDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CorporatePayContextDto {
  @IsOptional()
  @IsString()
  approvalId?: string;

  @IsOptional()
  @IsString()
  policyId?: string;

  @IsOptional()
  @IsString()
  budgetId?: string;

  @IsOptional()
  @IsString()
  budgetReservationId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CorporatePayQuoteDto extends CorporatePayOrganizationSelectorDto {
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CorporatePayContextDto)
  corporateContext?: CorporatePayContextDto;
}

export class CorporatePayAuthorizationDto {
  @IsString()
  @MinLength(3)
  externalAuthorizationId!: string;

  @IsEnum(CorporatePayAuthorizationStatus)
  status!: CorporatePayAuthorizationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  approvedAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  approvalId?: string;

  @IsOptional()
  @IsString()
  policyId?: string;

  @IsOptional()
  @IsString()
  budgetId?: string;

  @IsOptional()
  @IsString()
  budgetReservationId?: string;

  @IsOptional()
  @IsObject()
  policyDecision?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  approvalContext?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  budgetContext?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  autoConfirm?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CorporatePayCreateRequestDto extends CorporatePayQuoteDto {
  @IsString()
  @MinLength(3)
  externalRequestId!: string;

  @IsOptional()
  @IsString()
  externalOrderId?: string;

  @IsOptional()
  @IsString()
  externalMemberId?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsEnum(CorporatePayRequestKind)
  requestKind?: CorporatePayRequestKind;

  @IsOptional()
  @IsEnum(DispatchPriority)
  priority?: DispatchPriority;

  @ValidateNested()
  @Type(() => CorporatePayCustomerDto)
  customer!: CorporatePayCustomerDto;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  autoConfirm?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CorporatePayAuthorizationDto)
  authorization?: CorporatePayAuthorizationDto;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CorporatePayConfirmRequestDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  authorizationId?: string;

  @IsOptional()
  @IsString()
  returnUrl?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CorporatePayCancelRequestDto {
  @IsString()
  @MinLength(2)
  reason!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsBoolean()
  refundRequested?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundAmount?: number;
}

export class CorporatePayRebookRequestDto {
  @IsString()
  @MinLength(3)
  externalRequestId!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CorporatePayAuthorizationDto)
  authorization?: CorporatePayAuthorizationDto;

  @IsOptional()
  @IsBoolean()
  autoConfirm?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CorporatePayAccountLinkDto extends CorporatePayOrganizationSelectorDto {
  @IsString()
  @MinLength(3)
  externalAccountId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transactionLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyLimit?: number;

  @IsOptional()
  @IsObject()
  approvalRules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CorporatePayEvidenceDto {
  @IsOptional()
  @IsString()
  externalEvidenceId?: string;

  @IsEnum(CorporatePayEvidenceType)
  type!: CorporatePayEvidenceType;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  fileAssetId?: string;

  @IsOptional()
  @IsString()
  sha256?: string;

  @IsOptional()
  @IsString()
  actor?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CorporatePayDisputeDto {
  @IsOptional()
  @IsString()
  externalDisputeId?: string;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsArray()
  evidence?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CorporatePayResolveDisputeDto {
  @IsEnum(CorporatePayDisputeStatus)
  status!: CorporatePayDisputeStatus;

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsOptional()
  @IsArray()
  evidence?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CorporatePayPartnerQueryDto extends CorporatePayOrganizationSelectorDto {
  @IsOptional()
  @IsEnum(CorporatePayRequestStatus)
  status?: CorporatePayRequestStatus;

  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @IsOptional()
  @IsString()
  externalRequestId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class CorporatePayUsageQueryDto extends CorporatePayPartnerQueryDto {
  @IsOptional()
  @IsString()
  format?: 'json' | 'csv';
}

export class CorporatePayEventsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  aggregateId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
