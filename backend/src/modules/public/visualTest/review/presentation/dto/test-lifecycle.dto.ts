import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTestMetadataDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({
    type: String,
    isArray: true,
    maxItems: 20,
    description: 'Normalized to lowercase; empty clears the tags',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'ISO timestamp until which the test is muted; null clears the mute. A past timestamp also clears it.',
  })
  @IsOptional()
  @IsDateString()
  mutedUntil?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  muteReason?: string | null;

  @ApiPropertyOptional({ enum: ['FAIL', 'PAD', 'CROP', 'RESIZE'] })
  @IsOptional()
  @IsIn(['FAIL', 'PAD', 'CROP', 'RESIZE'])
  sizePolicy?: 'FAIL' | 'PAD' | 'CROP' | 'RESIZE';
}

export class TestFlakeDto {
  @ApiProperty()
  @Expose()
  transitions!: number;

  @ApiProperty()
  @Expose()
  changed!: number;

  @ApiProperty()
  @Expose()
  clean!: number;
}

export class TestMetadataDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  description!: string | null;

  @ApiProperty({ type: String, isArray: true })
  @Expose()
  tags!: string[];

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  mutedUntil!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  muteReason!: string | null;

  @ApiProperty()
  @Expose()
  isMuted!: boolean;

  @ApiProperty({ enum: ['FAIL', 'PAD', 'CROP', 'RESIZE'] })
  @Expose()
  sizePolicy!: string;

  @ApiProperty({ type: TestFlakeDto })
  @Expose()
  flake!: TestFlakeDto;
}
