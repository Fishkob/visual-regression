import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ScreenshotType } from '@public/visualTest/core/domain/types/visual-test.types';
import { VariantDto } from '@public/visualTest/review/presentation/dto/variant.dto';

export class ScreenshotDto {
  @ApiProperty()
  @IsString()
  @Expose()
  id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Expose()
  visualTestId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Expose()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Expose()
  imageHash?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  @Expose()
  createdAt?: Date;

  @ApiPropertyOptional({
    description:
      'Maximum allowed pixel mismatch between baseline and candidate',
  })
  @IsOptional()
  @IsNumber()
  @Expose()
  pixelDiffThreshold?: number;

  @ApiPropertyOptional({ enum: ScreenshotType, enumName: 'ScreenshotType' })
  @IsOptional()
  @IsEnum(ScreenshotType)
  @Expose()
  type?: ScreenshotType;

  @ApiPropertyOptional({ type: () => VariantDto })
  @IsOptional()
  @Type(() => VariantDto)
  @Expose()
  variant?: VariantDto;
}
