import { IsOptional, IsString } from 'class-validator';

export class AcceptDriverJobDto {
  @IsOptional()
  @IsString()
  vehicleId?: string;
}

export class DeclineDriverJobDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
