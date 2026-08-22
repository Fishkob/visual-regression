import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { HealthCheckResult } from '@common/domain/health-result.type';

export type { HealthCheckResult };

export interface BuildInfo {
  version: string;
  commitHash: string;
  buildTime: string;
  nodeVersion: string;
}

export class DetailedHealthDto {
  @ApiProperty({ enum: ['ok', 'degraded', 'unhealthy'] })
  status!: 'ok' | 'degraded' | 'unhealthy';

  @ApiProperty({ type: Object })
  results!: Record<string, unknown>;

  @ApiPropertyOptional({ type: String, isArray: true })
  warnings?: string[];

  @ApiPropertyOptional({ type: String, isArray: true })
  errors?: string[];

  @ApiProperty()
  timestamp!: string;

  @ApiProperty()
  version!: string;

  @ApiProperty({ type: Object, description: 'Build metadata' })
  buildInfo!: BuildInfo;

  @ApiProperty()
  uptime!: number;

  @ApiProperty({ type: Object })
  checks!: Record<string, HealthCheckResult>;
}
