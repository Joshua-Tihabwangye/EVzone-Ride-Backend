import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ServiceType } from '../common/enums';

export class CreateReviewDto {
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  revieweeUserId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsObject()
  categoryRatings?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  comment?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RespondReviewDto {
  @IsString()
  @Length(1, 2000)
  response!: string;
}

export class ReportReviewDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ModerateReviewDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
