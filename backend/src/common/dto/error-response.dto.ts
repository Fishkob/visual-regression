import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DOMAIN_ERROR_REASONS,
  type DomainErrorReason,
} from '@common/domain/domain-error';
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
    enum: DOMAIN_ERROR_REASONS,
    description:
      'Machine-readable refinement of `code` for failures a client can act on differently. Absent when the plain code says everything.',
  })
  reason?: DomainErrorReason;

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
