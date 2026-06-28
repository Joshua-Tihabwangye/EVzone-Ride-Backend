import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { UserRole } from '../common/enums';

export class RegisterDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
  @IsOptional() @IsBoolean() invite?: boolean;
  // Optional driver registration profile fields so the frontend can persist the
  // full signup details in a single call instead of relying on a follow-up PATCH.
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() streetAddress?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() landmark?: string;
}

export class LoginDto {
  @IsOptional() @IsString() identifier?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() password!: string;
}

export class RefreshDto {
  @IsString() refreshToken!: string;
}

export class LogoutDto {
  @IsString() refreshToken!: string;
}

export class RequestOtpDto {
  @IsString() destination!: string;
  @IsIn(['SMS', 'EMAIL']) channel!: 'SMS' | 'EMAIL';
  @IsString() purpose = 'VERIFY_ACCOUNT';
}

export class VerifyOtpDto {
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() @Length(6, 6) code?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(6, 6) otp?: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

export class ForgotPasswordDto {
  @IsOptional() @IsString() identifier?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['SMS', 'EMAIL']) channel?: 'SMS' | 'EMAIL';
}

export class VerifyPasswordResetOtpDto {
  @IsOptional() @IsString() identifier?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(6, 6) code?: string;
  @IsOptional() @IsString() @Length(6, 6) otp?: string;
}

export class ResetPasswordDto {
  @IsOptional() @IsString() resetToken?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(6, 6) otp?: string;
  @IsString() @MinLength(8) newPassword!: string;
}
