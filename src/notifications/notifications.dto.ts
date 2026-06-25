import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { PushPlatform } from '../common/enums';

export class RegisterDeviceTokenDto {
  @IsString()
  token!: string;

  @IsEnum(PushPlatform)
  platform!: PushPlatform;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
