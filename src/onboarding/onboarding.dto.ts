import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class StartOnboardingDto {
  @ApiProperty({
    enum: [
      'DRIVER',
      'FLEET_PARTNER',
      'AGENT_DISPATCHER',
      'TOUR_OPERATOR',
      'RENTAL_PARTNER',
      'MEDICAL_PARTNER',
    ],
  })
  @IsIn(['DRIVER', 'FLEET_PARTNER', 'AGENT_DISPATCHER', 'TOUR_OPERATOR', 'RENTAL_PARTNER', 'MEDICAL_PARTNER'])
  applicationType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  profileData?: Record<string, unknown>;
}

export class UpdateOnboardingDto {
  @IsOptional()
  @IsObject()
  profileData?: Record<string, unknown>;
}

export class CompleteChecklistItemDto {
  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'WAIVED'])
  status!: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class ReviewOnboardingDto {
  @IsIn(['APPROVED', 'REJECTED', 'NEEDS_CHANGES'])
  status!: string;

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class UploadUserDocumentDto {
  @IsString()
  documentType!: string;

  @IsString()
  fileUrl!: string;

  @IsOptional() @IsString() fileKey?: string;
  @IsOptional() @IsString() originalFileName?: string;
  @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @IsInt() @Min(0) sizeBytes?: number;
  @IsOptional() @IsString() side?: string;
  @IsOptional() @IsDateString() issuedAt?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() userType?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ReviewUserDocumentDto {
  @IsIn(['VERIFIED', 'REJECTED', 'IN_REVIEW'])
  status!: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class CreateEmergencyContactDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsPhoneNumber()
  phone!: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
