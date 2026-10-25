import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsDate,
  IsDefined,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { TEST_KINDS } from '@common/domain/test-kind';
import type { TestKind } from '@common/domain/test-kind';
import { VariantDto } from '@public/visualTest/review/presentation/dto/variant.dto';

// One row of the durable approval trail. The identifiers are deliberately plain
// values (not nested entities): the comparison row an approval referred to may
// already be deleted, and the audit row is the only surviving record of it.
export class ApprovalDto {
  @ApiProperty({
    example: 'cm0xyz123',
    description: 'Id of the approval audit record',
  })
  @IsString()
  @Expose()
  id!: string;

  @ApiProperty({
    example: 'jane.doe',
    description: 'Username of the authenticated principal that approved',
  })
  @IsString()
  @Expose()
  approvedBy!: string;

  @ApiProperty({ description: 'When the approval was recorded' })
  @IsDate()
  @Type(() => Date)
  @Expose()
  approvedAt!: Date;

  @ApiProperty({
    example: 'cm0cmp123',
    description:
      'Id of the approved comparison (may no longer exist in the database)',
  })
  @IsString()
  @Expose()
  comparisonId!: string;

  @ApiProperty({ example: 'image', enum: TEST_KINDS })
  @IsEnum(TEST_KINDS)
  @Expose()
  testKind!: TestKind;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Branch the approval was made on, or null when the caller did not name one',
  })
  @IsOptional()
  @IsString()
  @Expose()
  branchName?: string | null;

  @ApiProperty({ type: () => VariantDto })
  @IsDefined()
  @Type(() => VariantDto)
  @Expose()
  variant!: VariantDto;

  @ApiProperty({
    description: 'Image hash of the candidate that became the new baseline',
  })
  @IsString()
  @Expose()
  candidateHash!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Expose()
  baselineHash?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Pixel mismatch the reviewer accepted',
  })
  @IsOptional()
  @IsNumber()
  @Expose()
  mismatchPixelCount?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsNumber()
  @Expose()
  mismatchPageCount?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Page count of the approved artifact (PDF kind)',
  })
  @IsOptional()
  @IsNumber()
  @Expose()
  pageCount?: number | null;
}
