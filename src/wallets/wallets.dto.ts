import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TopUpDto {
  @Type(() => Number) @IsNumber() @Min(100) amount!: number;
  @IsOptional() @IsString() providerToken?: string;
}

export class TransferDto {
  @IsString() recipient!: string;
  @Type(() => Number) @IsNumber() @Min(100) amount!: number;
  @IsOptional() @IsString() note?: string;
}

export class WithdrawDto {
  @Type(() => Number) @IsNumber() @Min(1000) amount!: number;
  @IsString() destination!: string;
}
