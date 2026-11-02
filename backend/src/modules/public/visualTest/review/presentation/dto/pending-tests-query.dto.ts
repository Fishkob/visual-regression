import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BranchPaginationDto } from '@common/dto/branch-pagination.dto';
import { TEST_KINDS } from '@common/domain/test-kind';
import { MAX_NAME_LENGTH } from '@common/http/pipes/name-validation.util';

// The review pass walks this list, so it must describe the same set the inbox
// showed: the inbox filters that narrow *within* a project (kind, free text,
// run key, tag) travel here. The group filter is project-scoped and is not
// repeated — the current project either matches the inbox group or the pass was
// never started from it.
export class PendingTestsQueryDto extends BranchPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by test kind', enum: TEST_KINDS })
  @IsOptional()
  @IsIn(TEST_KINDS as string[])
  kind?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive search across the test name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  q?: string;

  @ApiPropertyOptional({ description: 'Only pending reviews of this run key' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  runKey?: string;

  @ApiPropertyOptional({ description: 'Filter pending reviews by test tag' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;
}
