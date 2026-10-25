import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsDefined,
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
    description: 'Canonical URL of the new baseline object after approval',
  })
  @IsString()
  @Expose()
  newBaselineUrl!: string;

  @ApiProperty({
    description: 'Time-limited presigned URL for rendering the new baseline',
  })
  @IsString()
  @Expose()
  signedNewBaselineUrl!: string;
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

export class PendingReviewDto {
  @ApiProperty()
  @IsString()
  @Expose()
  comparisonId!: string;

  @ApiProperty()
  @IsString()
  @Expose()
  projectName!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Expose()
  groupId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Expose()
  groupName?: string | null;

  @ApiProperty()
  @IsString()
  @Expose()
  testName!: string;

  @ApiProperty({ example: 'image' })
  @IsString()
  @Expose()
  kind!: string;

  @ApiProperty({ example: 'main' })
  @IsString()
  @Expose()
  branchName!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @Expose()
  isDefaultBranch!: boolean;

  @ApiProperty({ type: () => VariantDto })
  @IsDefined()
  @Type(() => VariantDto)
  @Expose()
  variant!: VariantDto;

  @ApiProperty()
  @IsNumber()
  @Expose()
  mismatchPixelCount!: number;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsNumber()
  @Expose()
  mismatchPageCount?: number | null;

  @ApiProperty({
    description:
      'Pending comparisons in this project on this branch, across every test (the set the review pass walks, independent of inbox filters)',
  })
  @IsNumber()
  @Expose()
  projectPendingCount!: number;

  @ApiProperty({
    description:
      'Number of branches in this project that currently have pending comparisons',
  })
  @IsNumber()
  @Expose()
  projectBranchCount!: number;

  @ApiProperty()
  @IsDate()
  @Type(() => Date)
  @Expose()
  createdAt!: Date;
}
