import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_BRANCH_NAME_LENGTH } from '@public/visualTest/core/domain/constants/branch.constants';
import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@common/domain/upload-outcome';
import { Expose } from 'class-transformer';
import { VariantParamsDto } from '@public/visualTest/core/presentation/dto/variant-params.dto';

export class UploadDocumentDto extends VariantParamsDto {
  @ApiPropertyOptional({
    example: 'feature/checkout-v2',
    description:
      'Branch that produced the upload (defaults to the project default branch)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BRANCH_NAME_LENGTH)
  branch?: string;

  @ApiPropertyOptional({
    example: 'main',
    description:
      'Branch the new branch inherits from (defaults to the project default branch)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BRANCH_NAME_LENGTH)
  targetBranch?: string;
}

export class UploadResultDto {
  @ApiProperty({
    enum: ComparisonOutcome,
    enumName: 'ComparisonOutcome',
  })
  @Expose()
  status!: ComparisonOutcome;

  @ApiProperty({
    example: 'feature/checkout-v2',
    description:
      'Branch the upload landed on (the resolved default when the request omitted it)',
  })
  @Expose()
  branch!: string;
}

export class BaselineCreatedResultDto extends UploadResultDto {
  @Expose()
  declare status: typeof ComparisonOutcome.BASELINE_CREATED;

  @ApiProperty()
  @Expose()
  testId!: string;

  @ApiProperty({
    description: 'Canonical storage URL of the new baseline (identity)',
  })
  @Expose()
  fileUrl!: string;

  @ApiProperty({
    description: 'Time-limited presigned URL for fetching the new baseline',
  })
  @Expose()
  signedFileUrl!: string;
}

export class IdenticalResultDto extends UploadResultDto {
  @Expose()
  declare status: typeof ComparisonOutcome.IDENTICAL;

  @ApiProperty()
  @Expose()
  mismatchPixelCount!: number;
}

export class ComparisonQueuedResultDto extends UploadResultDto {
  @Expose()
  declare status: typeof ComparisonOutcome.COMPARISON_QUEUED;

  @ApiProperty({ enum: ComparisonErrorCode, enumName: 'ComparisonErrorCode' })
  @Expose()
  error!: ComparisonErrorCode;

  @ApiProperty()
  @Expose()
  message!: string;
}
