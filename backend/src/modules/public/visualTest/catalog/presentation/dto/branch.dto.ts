import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_BRANCH_NAME_LENGTH } from '@public/visualTest/core/domain/constants/branch.constants';

export class UpdateBranchDto {
  @ApiPropertyOptional({
    description: 'Archive or unarchive the branch',
  })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({
    description:
      'Branch to inherit baselines from; null or the default branch means the project default',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BRANCH_NAME_LENGTH)
  targetBranch?: string | null;
}

export class BranchSummaryDto {
  @ApiProperty({ example: 'feature/checkout-v2' })
  @Expose()
  name!: string;

  @ApiProperty({ example: false })
  @Expose()
  isDefault!: boolean;

  @ApiProperty({ example: false })
  @Expose()
  isArchived!: boolean;

  @ApiProperty({ example: 'main', nullable: true, type: String })
  @Expose()
  targetBranchName!: string | null;

  @ApiProperty({
    example: 12,
    description:
      'Tests materialised on this branch; inherited (not yet materialised) tests are not counted',
  })
  @Expose()
  testCount!: number;

  @ApiProperty({ example: 2 })
  @Expose()
  pendingCount!: number;

  @ApiProperty()
  @Expose()
  createdAt!: Date;
}

// The command endpoints all answer with the same envelope; declaring it (instead
// of an example-only @ApiOkResponse) keeps the generated SDK typed as
// `{ success: boolean }` rather than `unknown`.
export class BranchCommandResultDto {
  @ApiProperty({ example: true })
  @Expose()
  success!: boolean;
}
