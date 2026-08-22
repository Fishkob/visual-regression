import { ApiPropertyOptional } from '@nestjs/swagger';
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
}
