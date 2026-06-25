import { Type } from 'class-transformer';
import {
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
import { EmergencyPriority, PaymentMethod } from '../common/enums';

export class AmbulancePointDto {
  @IsString() address!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
}

export class AmbulanceEstimateDto {
  @IsObject() pickup!: AmbulancePointDto;
  @IsOptional() @IsObject() destination?: AmbulancePointDto;
  @IsEnum(EmergencyPriority) priority!: EmergencyPriority;
  @IsOptional() @IsObject() medicalNeeds?: Record<string, unknown>;
}

export class CreateAmbulanceRequestDto extends AmbulanceEstimateDto {
  @IsString() patientName!: string;
  @IsOptional() @IsString() patientPhone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(130) patientAge?: number;
  @IsOptional() @IsString() medicalCondition?: string;
  @IsOptional() @IsString() medicalFacilityId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsBoolean() consentToShareMedicalInfo?: boolean;
}

export class DispatchAmbulanceDto {
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() vehicleId?: string;
}

export class AmbulanceActionDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) finalCost?: number;
}
