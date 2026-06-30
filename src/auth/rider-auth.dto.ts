import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class RiderRegisterDto {
  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class RiderLoginDto {
  @IsString()
  identifier!: string;

  @IsString()
  password!: string;
}

export class RiderVerifyDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 6)
  code!: string;
}

export class RiderResendVerificationDto {
  @IsEmail()
  email!: string;
}

export class RiderForgotPasswordDto {
  @IsString()
  identifier!: string;
}

export class RiderVerifyResetDto {
  @IsString()
  identifier!: string;

  @IsString()
  @Length(4, 6)
  code!: string;
}

export class RiderResetPasswordDto {
  @IsString()
  resetToken!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
