import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  Allow,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ComparisonStatus, JobStatus } from '@/prisma/client';
import { DEFAULT_JOB_STATUS_POLLING } from '@public/visualTest/intake/application/job-status-polling';

export class JobStatusQueryDto {
  @ApiPropertyOptional({
    description: `Seconds to wait for the job to reach a terminal state (0-${String(DEFAULT_JOB_STATUS_POLLING.maxWaitSeconds)}, default 0)`,
    default: 0,
    minimum: 0,
    maximum: DEFAULT_JOB_STATUS_POLLING.maxWaitSeconds,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(DEFAULT_JOB_STATUS_POLLING.maxWaitSeconds)
  wait?: number = 0;

  // Declared for the whitelist (the query object is validated as a whole).
  // BranchNameValidationPipe via @BranchQuery() owns the actual rule.
  @ApiPropertyOptional({
    description: 'Branch to read or act on (defaults to the default branch)',
  })
  @IsOptional()
  @Allow()
  branch?: string;
}

export class JobComparisonDto {
  @ApiProperty()
  @IsString()
  @Expose()
  id!: string;

  @ApiProperty({ enum: ComparisonStatus, enumName: 'ComparisonStatus' })
  @IsEnum(ComparisonStatus)
  @Expose()
  status!: ComparisonStatus;

  @ApiProperty()
  @IsInt()
  @Expose()
  mismatchPixelCount!: number;

  @ApiPropertyOptional({
    description: 'Number of differing pages (PDF comparisons)',
  })
  @IsOptional()
  @IsInt()
  @Expose()
  mismatchPageCount?: number;

  @ApiPropertyOptional({
    description: 'Number of pages compared (PDF comparisons)',
  })
  @IsOptional()
  @IsInt()
  @Expose()
  pageCount?: number;
}

export class ComparisonJobStatusDto {
  @ApiProperty()
  @IsString()
  @Expose()
  id!: string;

  @ApiProperty({ enum: JobStatus, enumName: 'JobStatus' })
  @IsEnum(JobStatus)
  @Expose()
  status!: JobStatus;

  @ApiProperty()
  @IsString()
  @Expose()
  testId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Failure message when the job FAILED, otherwise null',
  })
  @IsOptional()
  @IsString()
  @Expose()
  error!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsString()
  @Expose()
  createdAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Terminal timestamp, null while the job is pending/processing',
  })
  @IsOptional()
  @IsString()
  @Expose()
  completedAt!: string | null;

  @ApiProperty({
    type: () => JobComparisonDto,
    nullable: true,
    description:
      'Comparison produced by the job, null while queued or when it was retired/approved away',
  })
  @IsOptional()
  @Type(() => JobComparisonDto)
  @Expose()
  comparison!: JobComparisonDto | null;
}
