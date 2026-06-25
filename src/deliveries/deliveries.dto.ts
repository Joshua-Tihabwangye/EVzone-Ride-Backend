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
  ValidateNested,
} from 'class-validator';
import { DeliveryServiceType, PackageSize, PaymentMethod } from '../common/enums';

export class DeliveryPointDto {
  @IsString() address!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
}

export class DeliveryContactDto {
  @IsString() name!: string;
  @IsString() phone!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsObject() addressDetails?: Record<string, unknown>;
  @IsOptional() @IsBoolean() requiresAcceptance?: boolean;
}

export class DeliveryItemDto {
  @IsString() name!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitWeightKg?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsObject() dimensions?: Record<string, number>;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class EstimateDeliveryDto {
  @ValidateNested() @Type(() => DeliveryPointDto) pickup!: DeliveryPointDto;
  @ValidateNested() @Type(() => DeliveryPointDto) destination!: DeliveryPointDto;
  @IsEnum(DeliveryServiceType) serviceType!: DeliveryServiceType;
  @IsEnum(PackageSize) packageSize!: PackageSize;
  @Type(() => Number) @IsNumber() @Min(0) weightKg!: number;
  @IsOptional() @IsBoolean() fragile?: boolean;
  @IsOptional() @IsString() promoCode?: string;
}

export class CreateDeliveryDto extends EstimateDeliveryDto {
  @IsString() packageName!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) declaredValue?: number;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @ValidateNested() @Type(() => DeliveryContactDto) sender!: DeliveryContactDto;
  @ValidateNested() @Type(() => DeliveryContactDto) receiver!: DeliveryContactDto;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryItemDto)
  items?: DeliveryItemDto[];
}

export class DeliveryActionDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() proofUrl?: string;
}

export class VerifyDeliveryQrDto {
  @IsString() token!: string;
}

export class VerifyDeliveryDropoffDto {
  @IsString() code!: string;
}

export class CreateTrackingInvitationDto {
  @IsOptional() @IsString() recipientUserId?: string;
  @IsOptional() @IsString() recipientName?: string;
  @IsOptional() @IsString() recipientPhone?: string;
  @IsOptional() @IsEmail() recipientEmail?: string;
}

export class DeliveryFeedbackDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() message?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) tipAmount?: number;
}
