import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import { ServiceType } from '../common/enums';

export class UpdateDriverPreferencesDto {
  @IsOptional()
  @IsArray()
  @IsEnum(ServiceType, { each: true })
  serviceCapabilities?: ServiceType[];

  @IsOptional()
  @IsObject()
  servicePreferences?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  interactionPreferences?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  schedulePreferences?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(500)
  maximumPickupDistanceKm?: number;

  @IsOptional()
  @IsBoolean()
  autoAcceptEligibleJobs?: boolean;
}

export class SubmitTrainingAssessmentDto {
  @IsObject()
  answers!: Record<string, unknown>;
}
