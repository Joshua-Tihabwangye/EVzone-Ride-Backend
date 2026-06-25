import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  Min,
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

export class CorporatePayCustomerDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsPhoneNumber() phone?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CorporatePayPartnerQuoteDto {
  @IsOptional() @IsString() externalRequestId?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() externalOrganizationId?: string;
  @IsOptional() @IsString() externalMemberId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsOptional() @IsEnum(CorporatePayRequestKind) requestKind?: CorporatePayRequestKind;
  @IsObject() customer!: CorporatePayCustomerDto;
  @IsObject() servicePayload!: Record<string, unknown>;
  @IsOptional() @IsObject() corporateContext?: Record<string, unknown>;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsEnum(DispatchPriority) priority?: DispatchPriority;
  @IsOptional() @IsString() currency?: string;
}

export class CreateCorporatePayPartnerRequestDto extends CorporatePayPartnerQuoteDto {
  @IsString() declare externalRequestId: string;
  @IsOptional() @IsString() externalOrderId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() approvalId?: string;
  @IsOptional() @IsString() policyId?: string;
  @IsOptional() @IsString() budgetId?: string;
  @IsOptional() @IsString() budgetReservationId?: string;
  @IsOptional() @IsString() costCenterId?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CorporatePayAuthorizationDto {
  @IsString() externalAuthorizationId!: string;
  @IsEnum(CorporatePayAuthorizationStatus) status!: CorporatePayAuthorizationStatus;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) approvedAmount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() approvalId?: string;
  @IsOptional() @IsString() policyId?: string;
  @IsOptional() @IsString() budgetId?: string;
  @IsOptional() @IsString() budgetReservationId?: string;
  @IsOptional() @IsObject() policyDecision?: Record<string, unknown>;
  @IsOptional() @IsObject() approvalContext?: Record<string, unknown>;
  @IsOptional() @IsObject() budgetContext?: Record<string, unknown>;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CorporatePayPartnerListQueryDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() externalOrganizationId?: string;
  @IsOptional() @IsEnum(CorporatePayRequestStatus) status?: CorporatePayRequestStatus;
  @IsOptional() @IsEnum(ServiceType) serviceType?: ServiceType;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class CorporatePayPartnerCancelDto {
  @IsString() reason!: string;
  @IsOptional() @IsString() comment?: string;
}

export class CreateCorporatePayEvidenceDto {
  @IsOptional() @IsString() externalEvidenceId?: string;
  @IsEnum(CorporatePayEvidenceType) type!: CorporatePayEvidenceType;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() fileAssetId?: string;
  @IsOptional() @IsString() sha256?: string;
  @IsOptional() @IsString() actor?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() capturedAt?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateCorporatePayDisputeDto {
  @IsOptional() @IsString() externalDisputeId?: string;
  @IsString() reason!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() @IsObject({ each: true }) evidence?: Record<string, unknown>[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateCorporatePayDisputeDto {
  @IsEnum(CorporatePayDisputeStatus) status!: CorporatePayDisputeStatus;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsArray() @IsObject({ each: true }) evidence?: Record<string, unknown>[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CorporatePaySustainabilityQueryDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() externalOrganizationId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class CorporatePayReconciliationExportQueryDto extends CorporatePaySustainabilityQueryDto {
  @IsOptional() @IsEnum(CorporatePayRequestStatus) status?: CorporatePayRequestStatus;
}

export class CorporatePaySubjectLinkDto {
  @IsString() externalOrganizationId!: string;
  @IsString() externalMemberId!: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsPhoneNumber() phone?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CorporatePayEventAckDto {
  @IsOptional() @IsString() externalReceiptId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CorporatePayRebookDto {
  @IsString() externalRequestId!: string;
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsObject() servicePayload?: Record<string, unknown>;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CorporatePayPartnerRefundDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) amount?: number;
  @IsString() reason!: string;
  @IsOptional() @IsString() externalRefundId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
