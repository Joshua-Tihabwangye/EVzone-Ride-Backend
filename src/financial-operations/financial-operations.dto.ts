import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStoredPaymentMethodDto {
  @ApiProperty({ enum: ['CARD', 'MOBILE_MONEY', 'BANK_ACCOUNT', 'WALLET'] })
  @IsIn(['CARD', 'MOBILE_MONEY', 'BANK_ACCOUNT', 'WALLET'])
  type!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: 'Provider token; encrypted at rest and never returned' })
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  maskedValue?: string;

  @IsOptional()
  @IsNumber()
  expiryMonth?: number;

  @IsOptional()
  @IsNumber()
  expiryYear?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateStoredPaymentMethodDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateCashoutRequestDto {
  @IsNumber()
  @Min(100)
  amount!: number;

  @IsObject()
  method!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ReviewCashoutRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
