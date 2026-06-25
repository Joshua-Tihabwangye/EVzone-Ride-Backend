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
  IsPhoneNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BookingSource,
  DispatchAssignmentStatus,
  DispatchPriority,
  ManualBookingStatus,
  MembershipStatus,
  PaymentMethod,
  ServiceType,
} from '../common/enums';

export class CreateDispatchDeskDto {
  @IsString() name!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsArray() @IsString({ each: true }) zoneIds?: string[];
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class UpdateDispatchDeskDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
  @IsOptional() @IsArray() @IsString({ each: true }) zoneIds?: string[];
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class CreateAgentProfileDto {
  @IsString() userId!: string;
  @IsOptional() @IsString() deskId?: string;
  @IsOptional() @IsString() employeeCode?: string;
  @IsOptional() @IsBoolean() canCreateManualBookings?: boolean;
  @IsOptional() @IsBoolean() canAssignDrivers?: boolean;
  @IsOptional() @IsBoolean() canOverridePricing?: boolean;
  @IsOptional() @IsBoolean() canIssueRefunds?: boolean;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
}

export class UpdateAgentProfileDto {
  @IsOptional() @IsString() deskId?: string;
  @IsOptional() @IsEnum(MembershipStatus) status?: MembershipStatus;
  @IsOptional() @IsBoolean() canCreateManualBookings?: boolean;
  @IsOptional() @IsBoolean() canAssignDrivers?: boolean;
  @IsOptional() @IsBoolean() canOverridePricing?: boolean;
  @IsOptional() @IsBoolean() canIssueRefunds?: boolean;
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceCapabilities?: ServiceType[];
}

export class ManualCustomerDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsPhoneNumber() phone?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class InitialDispatchAssignmentDto {
  @IsOptional() @IsString() fleetId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() vehicleId?: string;
}

export class CreateManualBookingDto {
  @IsOptional() @IsString() deskId?: string;
  @IsOptional() @IsEnum(BookingSource) source?: BookingSource;
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsOptional() @IsEnum(DispatchPriority) priority?: DispatchPriority;
  @ValidateNested() @Type(() => ManualCustomerDto) customer!: ManualCustomerDto;
  @IsObject() payload!: Record<string, unknown>;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedAmount?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => InitialDispatchAssignmentDto)
  assignment?: InitialDispatchAssignmentDto;
  @IsOptional() @IsString() corporatePayAccountId?: string;
  @IsOptional() @IsString() corporatePayExternalRequestId?: string;
  @IsOptional() @IsString() corporatePayExternalAuthorizationId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) corporatePayAuthorizedAmount?: number;
  @IsOptional() @IsString() corporatePayApprovalId?: string;
  @IsOptional() @IsString() corporatePayPolicyId?: string;
  @IsOptional() @IsString() corporatePayBudgetId?: string;
  @IsOptional() @IsString() corporatePayBudgetReservationId?: string;
  @IsOptional() @IsString() corporatePayCostCenterId?: string;
  @IsOptional() @IsString() corporatePayGroupId?: string;
  @IsOptional() @IsString() corporatePayPurchaseOrderId?: string;
  @IsOptional() @IsObject() corporateContext?: Record<string, unknown>;
}

export class UpdateManualBookingDto {
  @IsOptional() @IsEnum(DispatchPriority) priority?: DispatchPriority;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedAmount?: number;
  @IsOptional() @IsString() notes?: string;
}

export class AssignManualBookingDto {
  @IsOptional() @IsString() fleetId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsEnum(DispatchAssignmentStatus) status?: DispatchAssignmentStatus;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ManualBookingActionDto {
  @IsString() reason!: string;
  @IsOptional() @IsString() comment?: string;
}

export class DispatchNoteDto {
  @IsString() message!: string;
  @IsOptional() @IsBoolean() internal?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
}

export class DispatchListQueryDto {
  @IsOptional() @IsEnum(ServiceType) serviceType?: ServiceType;
  @IsOptional() @IsEnum(ManualBookingStatus) status?: ManualBookingStatus;
  @IsOptional() @IsEnum(DispatchPriority) priority?: DispatchPriority;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class CreateDispatchShiftDto {
  @IsString() deskId!: string;
  @IsString() userId!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}
