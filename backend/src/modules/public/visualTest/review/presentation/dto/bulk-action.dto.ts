import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const BULK_LIMIT = 100;

export class BulkApprovalDto {
  @ApiProperty({ type: String, isArray: true, maxItems: BULK_LIMIT })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_LIMIT)
  @IsString({ each: true })
  comparisonIds!: string[];
}

export class BulkDeleteTestsDto {
  @ApiProperty({ type: String, isArray: true, maxItems: BULK_LIMIT })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_LIMIT)
  @IsString({ each: true })
  testNames!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;
}

export class BulkMoveProjectsDto {
  @ApiProperty({ type: String, isArray: true, maxItems: BULK_LIMIT })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_LIMIT)
  @IsString({ each: true })
  projectNames!: string[];

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  groupId?: string | null;
}

export class BulkItemResultDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  success!: boolean;

  @ApiPropertyOptional()
  @Expose()
  error?: string;
}

export class BulkApprovalResultDto {
  @ApiProperty({ type: BulkItemResultDto, isArray: true })
  @Expose()
  approved!: BulkItemResultDto[];

  @ApiProperty({ type: BulkItemResultDto, isArray: true })
  @Expose()
  failed!: BulkItemResultDto[];
}

export class BulkDeleteResultDto {
  @ApiProperty({ type: BulkItemResultDto, isArray: true })
  @Expose()
  deleted!: BulkItemResultDto[];

  @ApiProperty({ type: BulkItemResultDto, isArray: true })
  @Expose()
  failed!: BulkItemResultDto[];
}

export class BulkMoveResultDto {
  @ApiProperty({ type: BulkItemResultDto, isArray: true })
  @Expose()
  moved!: BulkItemResultDto[];

  @ApiProperty({ type: BulkItemResultDto, isArray: true })
  @Expose()
  failed!: BulkItemResultDto[];
}
