import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreatePartnerDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsUrl() webhookUrl?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class UpdatePartnerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: string;
  @IsOptional() @IsUrl() webhookUrl?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class CreatePartnerApiKeyDto {
  @IsArray() @IsString({ each: true }) scopes!: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class RotatePartnerApiKeyDto {
  @IsArray() @IsString({ each: true }) scopes!: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreatePartnerWebhookDto {
  @IsArray() @IsString({ each: true }) eventTypes!: string[];
  @IsUrl() url!: string;
  @IsOptional() @IsString() secret?: string;
}

export class PartnerQuotaQueryDto {
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsString() metric?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
}

export class PartnerSelfUpdateDto {
  @IsOptional() @IsUrl() webhookUrl?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class PartnerAdapterActionDto {
  @IsString() action!: string;
  @IsObject() payload!: Record<string, unknown>;
}

export class PartnerListQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
}

export class PartnerWebhookListQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
}

export class PartnerOutboxQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() eventType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
}

export class EnqueuePartnerEventDto {
  @IsString() eventType!: string;
  @IsOptional() @IsString() externalEventId?: string;
  @IsObject() payload!: Record<string, unknown>;
}

export class SetPartnerQuotaDto {
  @IsString() metric!: string;
  @IsString() period!: string;
  @Type(() => Number) @IsInt() @Min(0) allowed!: number;
}
