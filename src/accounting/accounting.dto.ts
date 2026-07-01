import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LedgerAccountType, ServiceType, TransactionDirection } from '../common/enums';

export class LedgerLineDto {
  @IsString() accountCode!: string;
  @IsString() accountName!: string;
  @IsEnum(LedgerAccountType) accountType!: LedgerAccountType;
  @IsOptional() @IsString() accountCategory?: string;
  @IsOptional() @IsString() ownerType?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsEnum(TransactionDirection) direction!: TransactionDirection;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class PostJournalDto {
  @IsString() reference!: string;
  @IsString() transactionType!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(ServiceType) serviceType?: ServiceType;
  @IsOptional() @IsString() serviceId?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LedgerLineDto)
  lines!: LedgerLineDto[];
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ClosePeriodDto {
  @Type(() => Number) @IsNumber() year!: number;
  @Type(() => Number) @IsNumber() month!: number;
}
