import { ApiProperty } from '@nestjs/swagger';
import {
  TestStatus,
  ComparisonStatus,
} from '@public/visualTest/core/domain/types/visual-test.types';

export class PdfVariantDetailsDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  pdfUrl!: string;

  @ApiProperty()
  imageHash!: string;

  @ApiProperty({ type: Number, nullable: true })
  pageCount!: number | null;

  @ApiProperty()
  viewport!: string;

  @ApiProperty()
  browser!: string;

  @ApiProperty()
  environment!: string;
}

export class PdfCandidateDetailsDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  pdfUrl!: string;

  @ApiProperty()
  imageHash!: string;

  @ApiProperty()
  viewport!: string;

  @ApiProperty()
  browser!: string;

  @ApiProperty()
  environment!: string;
}

export class PdfComparisonDetailsDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  baselineId!: string;

  @ApiProperty({ type: String, nullable: true })
  diffPdfUrl!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  pageCount!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  mismatchPageCount!: number | null;

  @ApiProperty({ enum: ComparisonStatus, enumName: 'ComparisonStatus' })
  status!: ComparisonStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: PdfCandidateDetailsDto, nullable: true })
  candidate!: PdfCandidateDetailsDto | null;
}

export class PdfTestDetailsDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: TestStatus, enumName: 'TestStatus' })
  status!: TestStatus;

  @ApiProperty()
  kind!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ enum: ['branch', 'inherited'] })
  origin!: 'branch' | 'inherited';

  @ApiProperty({ type: String, nullable: true })
  inheritedFrom!: string | null;

  @ApiProperty({
    description:
      'True while this baseline is an inherited clone that still follows the target branch',
  })
  baselineInherited!: boolean;

  @ApiProperty({ type: String, nullable: true })
  inheritTarget!: string | null;

  @ApiProperty({ type: PdfVariantDetailsDto, nullable: true })
  baseline!: PdfVariantDetailsDto | null;

  @ApiProperty({ type: PdfComparisonDetailsDto, nullable: true })
  comparison!: PdfComparisonDetailsDto | null;
}
