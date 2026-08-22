import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  Allow,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ComparisonStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { ScreenshotDto } from '@public/visualTest/review/presentation/dto/screenshot.dto';

export class ComparisonDto {
  @ApiProperty()
  @IsString()
  @Expose()
  id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Expose()
  diffImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Expose()
  mismatchPixelCount?: number;

  @ApiProperty({ enum: ComparisonStatus, enumName: 'ComparisonStatus' })
  @IsEnum(ComparisonStatus)
  @Expose()
  status!: ComparisonStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  @Expose()
  createdAt?: Date;

  @ApiPropertyOptional({ type: () => ScreenshotDto })
  @IsOptional()
  @IsObject()
  @Expose()
  @Type(() => ScreenshotDto)
  candidate?: ScreenshotDto;

  @ApiPropertyOptional({ type: () => ScreenshotDto })
  @IsOptional()
  @IsObject()
  @Expose()
  @Type(() => ScreenshotDto)
  baseline?: ScreenshotDto;

  @ApiProperty({
    description:
      'True if mismatchPixelCount exceeds baseline.pixelDiffThreshold',
  })
  @IsBoolean()
  @Allow()
  @Expose()
  thresholdExceeded!: boolean;
}
