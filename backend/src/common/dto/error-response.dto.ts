import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  message!: string;

  @ApiPropertyOptional({ example: 'Bad Request' })
  error?: string;

  @ApiPropertyOptional({ example: '/api/projects' })
  path?: string;

  @ApiPropertyOptional({ example: '2025-10-20T12:00:00Z' })
  timestamp?: string;

  @ApiPropertyOptional({ example: 'E_UNIQUE_CONSTRAINT' })
  code?: string;

  @ApiPropertyOptional({
    type: Object,
    isArray: true,
    example: [{ field: 'name', messages: ['must not be empty'] }],
  })
  errors?: { field: string; messages: string[] }[];

  @ApiPropertyOptional({
    example: '4d9b0e1e-449d-47e1-8c3b-5b54e3c76f47',
    description: 'Unique request trace ID for debugging/log correlation',
  })
  traceId?: string;
}
