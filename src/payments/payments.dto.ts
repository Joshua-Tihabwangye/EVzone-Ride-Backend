import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod, ServiceType } from '../common/enums';

export class CreatePaymentDto {
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsString() serviceId!: string;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class ConfirmPaymentDto {
  @IsOptional() @IsString() providerToken?: string;
}

export class RefundPaymentDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) amount?: number;
  @IsOptional() @IsString() reason?: string;
}
