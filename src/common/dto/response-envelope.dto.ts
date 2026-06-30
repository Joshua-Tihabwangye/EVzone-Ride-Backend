import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Current page number', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of items', example: 100 })
  total!: number;

  @ApiProperty({ description: 'Total number of pages', example: 5 })
  pageCount!: number;
}

export class ResponseEnvelopeDto<TData = unknown> {
  @ApiProperty({ description: 'Indicates whether the request succeeded', example: true })
  success!: boolean;

  @ApiProperty({ description: 'Response payload', type: 'object', additionalProperties: true })
  data!: TData;

  @ApiProperty({ description: 'Unique request identifier', example: 'req_0197a8c3f1a24b2e9d0e5c6a' })
  requestId!: string;

  @ApiProperty({ description: 'ISO timestamp of the response', example: '2026-06-30T12:00:00.000Z' })
  timestamp!: string;
}

export class PaginatedResponseDto<TItem = unknown> extends ResponseEnvelopeDto<TItem[]> {
  @ApiProperty({ description: 'Pagination metadata', type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ErrorDetailDto {
  @ApiProperty({ description: 'HTTP status code', example: 400 })
  statusCode!: number;

  @ApiProperty({ description: 'Error message or messages', example: 'Validation failed' })
  message!: string | string[];

  @ApiProperty({ description: 'Request path', example: '/api/v1/rides' })
  path!: string;

  @ApiProperty({ description: 'HTTP method', example: 'POST' })
  method!: string;

  @ApiProperty({ description: 'Unique request identifier', example: 'req_0197a8c3f1a24b2e9d0e5c6a' })
  requestId!: string;

  @ApiProperty({ description: 'ISO timestamp of the error response', example: '2026-06-30T12:00:00.000Z' })
  timestamp!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ description: 'Always false for error responses', example: false })
  success!: boolean;

  @ApiProperty({ description: 'Error details', type: ErrorDetailDto })
  error!: ErrorDetailDto;
}

export class AckResponseDto {
  @ApiProperty({ description: 'Indicates whether the request succeeded', example: true })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Human-readable acknowledgement message' })
  message?: string;

  @ApiProperty({ description: 'Unique request identifier', example: 'req_0197a8c3f1a24b2e9d0e5c6a' })
  requestId!: string;

  @ApiProperty({ description: 'ISO timestamp of the response', example: '2026-06-30T12:00:00.000Z' })
  timestamp!: string;
}
