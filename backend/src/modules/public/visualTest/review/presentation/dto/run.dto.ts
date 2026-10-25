import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class RunDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  key!: string;

  @ApiProperty()
  @Expose()
  branchName!: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  commitSha?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  commitMessage?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  ciUrl?: string | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiProperty()
  @Expose()
  lastActivityAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  finishedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  finishedBy?: string | null;
}

export class RunPendingDto {
  @ApiProperty()
  @Expose()
  comparisonId!: string;

  @ApiProperty()
  @Expose()
  testName!: string;

  @ApiProperty()
  @Expose()
  kind!: string;

  @ApiProperty()
  @Expose()
  branchName!: string;

  @ApiProperty({ type: Object })
  @Expose()
  variant!: { viewport: string; browser: string; environment: string };

  @ApiProperty()
  @Expose()
  mismatchPixelCount!: number;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  mismatchPageCount?: number | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;
}

export class RunApprovalDto {
  @ApiProperty()
  @Expose()
  comparisonId!: string;

  @ApiProperty()
  @Expose()
  testName!: string;

  @ApiProperty()
  @Expose()
  approvedBy!: string;

  @ApiProperty()
  @Expose()
  approvedAt!: Date;
}

export class RunFailedJobDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  testName!: string;

  @ApiProperty()
  @Expose()
  branchName!: string;

  @ApiProperty()
  @Expose()
  error!: string;

  @ApiProperty()
  @Expose()
  createdAt!: Date;
}

export class RunUploadDto {
  @ApiProperty()
  @Expose()
  testName!: string;

  @ApiProperty()
  @Expose()
  kind!: string;

  @ApiProperty({ type: Object })
  @Expose()
  variant!: { viewport: string; browser: string; environment: string };

  @ApiProperty()
  @Expose()
  outcome!: string;

  @ApiProperty()
  @Expose()
  createdAt!: Date;
}

export class RunStatusDto {
  @ApiProperty({ enum: ['open', 'pending', 'failed', 'passed'] })
  @Expose()
  state!: string;

  @ApiProperty()
  @Expose()
  pendingComparisons!: number;

  @ApiProperty()
  @Expose()
  mutedPending!: number;

  @ApiProperty()
  @Expose()
  pendingJobs!: number;

  @ApiProperty()
  @Expose()
  failedJobs!: number;

  @ApiProperty()
  @Expose()
  approved!: number;

  @ApiProperty()
  @Expose()
  testCount!: number;
}

export class RunDetailDto {
  @ApiProperty({ type: RunDto })
  @Expose()
  @Type(() => RunDto)
  run!: RunDto;

  @ApiProperty({ type: RunStatusDto })
  @Expose()
  @Type(() => RunStatusDto)
  status!: RunStatusDto;

  @ApiProperty({ type: RunPendingDto, isArray: true })
  @Expose()
  @Type(() => RunPendingDto)
  pending!: RunPendingDto[];

  @ApiProperty({ type: RunApprovalDto, isArray: true })
  @Expose()
  @Type(() => RunApprovalDto)
  approvals!: RunApprovalDto[];

  @ApiProperty({ type: RunUploadDto, isArray: true })
  @Expose()
  @Type(() => RunUploadDto)
  uploads!: RunUploadDto[];

  @ApiProperty({ type: RunFailedJobDto, isArray: true })
  @Expose()
  @Type(() => RunFailedJobDto)
  failedJobs!: RunFailedJobDto[];
}

export class RunStatusResultDto {
  @ApiProperty({ type: RunDto })
  @Expose()
  @Type(() => RunDto)
  run!: RunDto;

  @ApiProperty({ type: RunStatusDto })
  @Expose()
  @Type(() => RunStatusDto)
  status!: RunStatusDto;
}

export class RunApproveAllResultDto {
  @ApiProperty()
  @Expose()
  approved!: number;

  @ApiProperty({ type: Object, isArray: true })
  @Expose()
  failed!: { comparisonId: string; error: string }[];
}

export class RunListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by branch (defaults to all)' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
