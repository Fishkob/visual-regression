import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { Allow, IsOptional, IsString } from 'class-validator';
import { TestStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { VariantDto } from '@public/visualTest/review/presentation/dto/variant.dto';
import { ScreenshotDto } from '@public/visualTest/review/presentation/dto/screenshot.dto';
import { ComparisonDto } from '@public/visualTest/review/presentation/dto/comparison.dto';

export class VisualTestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Expose()
  name?: string;

  @ApiPropertyOptional({ example: 'image' })
  @IsOptional()
  @IsString()
  @Expose()
  kind?: string;

  @ApiPropertyOptional({ type: () => VariantDto })
  @IsOptional()
  @Type(() => VariantDto)
  @Expose()
  variant?: VariantDto;

  @ApiPropertyOptional({
    example: 'UNCHANGED',
    enum: TestStatus,
    enumName: 'TestStatus',
    description: 'Latest status of the test variant',
  })
  @IsOptional()
  @Allow()
  @Expose()
  latestStatus?: TestStatus | null;

  @ApiPropertyOptional({ enum: ['branch', 'inherited'] })
  @IsOptional()
  @IsString()
  @Expose()
  origin?: 'branch' | 'inherited';

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Expose()
  inheritedFrom?: string | null;
}

export class VisualTestDetailsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Expose()
  name?: string;

  @ApiPropertyOptional({
    type: () => ScreenshotDto,
    description: 'Baseline screenshot, if one exists',
  })
  @IsOptional()
  @Expose()
  @Type(() => ScreenshotDto)
  baseline?: ScreenshotDto | undefined;

  @ApiPropertyOptional({
    type: () => ComparisonDto,
    description: 'Latest comparison result, if available',
  })
  @IsOptional()
  @Expose()
  @Type(() => ComparisonDto)
  comparison?: ComparisonDto | undefined;

  @ApiPropertyOptional({ enum: ['branch', 'inherited'] })
  @IsOptional()
  @IsString()
  @Expose()
  origin?: 'branch' | 'inherited';

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Expose()
  inheritedFrom?: string | null;

  // Whether the baseline itself is still an inherited clone (it follows the
  // target until this branch approves), and which branch it follows. The test
  // level `origin` above is a different fact: it says whether the TEST row is
  // materialised here.
  @ApiPropertyOptional({
    description:
      'True while this baseline is an inherited clone that still follows the target branch',
  })
  @IsOptional()
  @Expose()
  baselineInherited?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Branch whose baseline this one follows while inherited',
  })
  @IsOptional()
  @IsString()
  @Expose()
  inheritTarget?: string | null;
}

// One tile of the variant gallery: the variant's identity, the image that
// represents it (the candidate while a change is pending, otherwise the
// baseline) and how much it differs.
export class TestVariantSummaryDto {
  @ApiProperty({ example: '1920x1080' })
  @Expose()
  viewport!: string;

  @ApiProperty({ example: 'chromium' })
  @Expose()
  browser!: string;

  @ApiProperty({ example: 'staging' })
  @Expose()
  environment!: string;

  @ApiProperty({
    enum: TestStatus,
    enumName: 'TestStatus',
    description: 'Per-variant status, derived like the project overview',
  })
  @Expose()
  status!: TestStatus;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  baselineUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Candidate image of the pending comparison, if the variant has one',
  })
  @Expose()
  candidateUrl!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  @Expose()
  mismatchPixelCount!: number | null;

  @ApiProperty({
    description:
      "True while the variant's baseline is an inherited clone that follows the target branch",
  })
  @Expose()
  baselineInherited!: boolean;
}

export class TestVariantsDto {
  @ApiProperty()
  @Expose()
  name!: string;

  @ApiProperty({ example: 'image' })
  @Expose()
  kind!: string;

  @ApiProperty({ type: () => TestVariantSummaryDto, isArray: true })
  @Type(() => TestVariantSummaryDto)
  @Expose()
  variants!: TestVariantSummaryDto[];
}
