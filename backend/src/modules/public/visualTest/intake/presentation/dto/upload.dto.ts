import { ApiProperty } from '@nestjs/swagger';
import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@common/domain/upload-outcome';
import { Expose } from 'class-transformer';
import { VariantParamsDto } from '@public/visualTest/core/presentation/dto/variant-params.dto';

export class UploadDocumentDto extends VariantParamsDto {}

export class UploadResultDto {
  @ApiProperty({
    enum: ComparisonOutcome,
    enumName: 'ComparisonOutcome',
  })
  @Expose()
  status!: ComparisonOutcome;
}

export class BaselineCreatedResultDto extends UploadResultDto {
  @Expose()
  declare status: typeof ComparisonOutcome.BASELINE_CREATED;

  @ApiProperty()
  @Expose()
  testId!: string;

  @ApiProperty()
  @Expose()
  fileUrl!: string;
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
