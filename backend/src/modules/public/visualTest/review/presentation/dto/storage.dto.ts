import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class StorageUsageDto {
  @ApiProperty({ description: 'Current stored bytes (screenshots + diffs)' })
  @Expose()
  usageBytes!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  quotaBytes!: string | null;

  @ApiProperty({ description: 'Usage as a percentage of the hard quota' })
  @Expose()
  percent!: number;

  @ApiProperty()
  @Expose()
  softPercent!: number;

  @ApiProperty({ description: 'True once usage reaches the soft threshold' })
  @Expose()
  warning!: boolean;

  @ApiProperty()
  @Expose()
  fileCount!: number;

  @ApiProperty()
  @Expose()
  diffCount!: number;

  @ApiProperty({ type: Number, nullable: true })
  @Expose()
  baselineRevisionLimit!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  @Expose()
  runHistoryDays!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  @Expose()
  orphanGraceHours!: number | null;
}

export class UpdateRetentionDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Baseline revisions kept per variant; null uses the global default',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  baselineRevisionLimit?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  runHistoryDays?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orphanGraceHours?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Hard storage quota in bytes: a positive whole number, or null for unlimited. ' +
      'Zero, negative and non-numeric values are rejected — an ambiguous value must ' +
      'not silently disable the quota.',
    example: '10737418240',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message:
      'storageQuotaBytes must be a positive whole number of bytes; send null for unlimited',
  })
  storageQuotaBytes?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quotaSoftPercent?: number | null;
}
