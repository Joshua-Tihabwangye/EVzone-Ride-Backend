import { IsObject, IsOptional, IsString } from 'class-validator';

export class PaytotaWebhookDataDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  status?: string;

  [key: string]: unknown;
}

export class PaytotaWebhookDto {
  @IsString()
  @IsOptional()
  eventType?: string;

  @IsObject()
  @IsOptional()
  data?: PaytotaWebhookDataDto;

  [key: string]: unknown;
}
