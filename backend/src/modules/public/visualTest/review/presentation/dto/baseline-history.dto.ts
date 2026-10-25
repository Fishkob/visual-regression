import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { BaselineRevisionReason } from '@public/visualTest/core/domain/types/visual-test.types';

export const BASELINE_REVISION_LIMIT_MAX_LENGTH = 100;

export class BaselineRevisionDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  viewport!: string;

  @ApiProperty()
  @Expose()
  browser!: string;

  @ApiProperty()
  @Expose()
  environment!: string;

  @ApiProperty({
    description: 'Canonical storage URL of the baseline file (identity)',
  })
  @Expose()
  imageUrl!: string;

  @ApiProperty({
    description: 'Time-limited presigned URL for rendering the baseline',
  })
  @Expose()
  signedImageUrl!: string;

  @ApiProperty()
  @Expose()
  imageHash!: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  pageCount?: number | null;

  @ApiProperty()
  @Expose()
  pixelDiffThreshold!: number;

  @ApiProperty({ enum: ['approval', 'restore', 'import'] })
  @Expose()
  reason!: BaselineRevisionReason;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  createdBy?: string | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;
}

export class RestoreBaselineDto {
  @ApiProperty({ description: 'The baseline revision to restore' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(BASELINE_REVISION_LIMIT_MAX_LENGTH)
  revisionId!: string;
}

export class RestoreBaselineResultDto {
  @ApiProperty()
  @Expose()
  baselineUrl!: string;

  @ApiProperty()
  @Expose()
  signedBaselineUrl!: string;
}
