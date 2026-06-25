import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CoordinateDto {
  @ApiProperty({ example: 0.3476 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 32.5825 })
  @IsLongitude()
  longitude!: number;
}

export class PlaceSearchDto {
  @ApiProperty({ example: 'Acacia Mall Kampala' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  query!: string;

  @ApiPropertyOptional({ default: 'ug' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class ReverseGeocodeDto extends CoordinateDto {}

export class RouteEstimateDto {
  @ApiProperty({ type: [CoordinateDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  points!: CoordinateDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  alternatives?: boolean;
}

export class GeofenceCheckDto {
  @ApiProperty({ type: CoordinateDto })
  @ValidateNested()
  @Type(() => CoordinateDto)
  point!: CoordinateDto;

  @ApiProperty({ type: [CoordinateDto], description: 'Polygon vertices in order' })
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  polygon!: CoordinateDto[];
}
