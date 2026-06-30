import { IsObject, IsOptional, IsString } from 'class-validator';

export class FlutterwaveWebhookDataDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  txRef?: string;

  @IsString()
  @IsOptional()
  status?: string;

  [key: string]: unknown;
}

export class FlutterwaveWebhookDto {
  @IsString()
  @IsOptional()
  event?: string;

  @IsString()
  @IsOptional()
  'event.type'?: string;

  @IsObject()
  @IsOptional()
  data?: FlutterwaveWebhookDataDto;

  [key: string]: unknown;
}
