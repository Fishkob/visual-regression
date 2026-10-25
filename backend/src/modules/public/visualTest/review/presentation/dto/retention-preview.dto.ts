import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class BaselineRevisionPreviewDto {
  @ApiProperty()
  @Expose()
  limit!: number;

  @ApiProperty()
  @Expose()
  overflow!: number;
}

export class RunRetentionPreviewDto {
  @ApiProperty()
  @Expose()
  days!: number;

  @ApiProperty()
  @Expose()
  eligible!: number;
}

export class RetentionStoragePreviewDto {
  @ApiProperty()
  @Expose()
  usageBytes!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  quotaBytes!: string | null;

  @ApiProperty()
  @Expose()
  percent!: number;

  @ApiProperty()
  @Expose()
  warning!: boolean;
}

export class RetentionPreviewDto {
  @ApiProperty({ type: BaselineRevisionPreviewDto })
  @Expose()
  baselineRevisions!: BaselineRevisionPreviewDto;

  @ApiProperty({ type: RunRetentionPreviewDto })
  @Expose()
  runs!: RunRetentionPreviewDto;

  @ApiProperty()
  @Expose()
  orphanGraceHours!: number;

  @ApiProperty({ type: RetentionStoragePreviewDto })
  @Expose()
  storage!: RetentionStoragePreviewDto;
}
