import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
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

  @ApiPropertyOptional({
    example: 'ci-12345',
    description: 'CI run key that groups this upload with the rest of the run',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9._:/-]+$/, {
    message:
      'runKey may only contain letters, digits, dot, underscore, colon, slash or dash',
  })
  runKey?: string;

  @ApiPropertyOptional({ example: '9fceb02' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  commitSha?: string;

  @ApiPropertyOptional({ example: 'feat: add checkout v2' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commitMessage?: string;

  @ApiPropertyOptional({
    example: 'https://github.com/org/repo/actions/runs/1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  // http(s) only: the dashboard links this straight into an href, so a value
  // like `javascript:...` would be stored XSS. require_tld:false keeps
  // self-hosted `http://localhost:3001/ci` valid.
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  ciUrl?: string;
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

  @ApiPropertyOptional({
    description: 'Run key echoed when the upload belonged to a run',
  })
  @Expose()
  runKey?: string;
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

  @ApiProperty({
    description:
      'Id of the queued ComparisonJob (poll GET /projects/:projectName/tests/:testName/jobs/:jobId)',
  })
  @Expose()
  jobId!: string;
}
