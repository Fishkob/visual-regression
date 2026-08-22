import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { VariantDto } from '@public/visualTest/review/presentation/dto/variant.dto';

export class ApproveResultDto {
  @ApiProperty({
    example: true,
    description: 'Indicates that the approval was successful',
  })
  @IsBoolean()
  @Expose()
  approved!: true;

  @ApiProperty({
    example: 'http://localhost/baseline-new.png',
    description: 'URL of the new baseline object after approval',
  })
  @IsString()
  @Expose()
  newBaselineUrl!: string;
}

// The approve request pins the exact comparison the reviewer acted on. Without
// the id, approval would re-resolve to whatever comparison is pending at click
// time — silently promoting content the reviewer never saw.
export class ApproveComparisonBodyDto {
  @ApiProperty({
    example: 'cm0xyz123',
    description: 'Id of the comparison the reviewer approved',
  })
  @IsString()
  @IsNotEmpty()
  comparisonId!: string;
}

export class UpdateThresholdResultDto {
  @ApiProperty({
    example: 'product_mobile',
    description: 'Name of the test that was updated',
  })
  @IsString()
  @Expose()
  test!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Expose()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Expose()
  threshold?: number;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Number of pending comparisons the update auto-accepted (or would auto-accept, for a preview)',
  })
  @IsOptional()
  @IsNumber()
  @Expose()
  autoAcceptedCount?: number;
}

export class PendingTestDto {
  @ApiProperty()
  @Expose()
  name!: string;

  @ApiPropertyOptional({ type: () => VariantDto })
  @Type(() => VariantDto)
  @Expose()
  variant?: VariantDto;

  @ApiPropertyOptional()
  @Expose()
  latestStatus?: string;
}
