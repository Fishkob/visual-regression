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

export class BranchRetentionPreviewDto {
  @ApiProperty({
    description:
      'The window the sweep will apply, with the deployment default resolved',
  })
  @Expose()
  days!: number;

  @ApiProperty({
    description: 'Branches the sweep would delete right now',
  })
  @Expose()
  eligible!: number;
}

export class RetentionPreviewDto {
  @ApiProperty({ type: BaselineRevisionPreviewDto })
  @Expose()
  baselineRevisions!: BaselineRevisionPreviewDto;

  @ApiProperty({ type: RunRetentionPreviewDto })
  @Expose()
  runs!: RunRetentionPreviewDto;

  @ApiProperty({ type: BranchRetentionPreviewDto })
  @Expose()
  branches!: BranchRetentionPreviewDto;

  // Named for what it is. `/storage` reports the same setting as the *stored
  // override* (null = "use the default"), which is what an edit form needs; this
  // endpoint is a dry run, so it reports the value the sweeps will actually use.
  @ApiProperty({
    description:
      'The grace the orphan sweeps will apply, with the global default resolved',
  })
  @Expose()
  effectiveOrphanGraceHours!: number;

  @ApiProperty({ type: RetentionStoragePreviewDto })
  @Expose()
  storage!: RetentionStoragePreviewDto;
}
