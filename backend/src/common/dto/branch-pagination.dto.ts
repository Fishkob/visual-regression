import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';
import { UNASSIGNED_GROUP_FILTER } from '@common/domain/group-filter';
import { TEST_KINDS } from '@common/domain/test-kind';
import { MAX_NAME_LENGTH } from '@common/http/pipes/name-validation.util';

// A paginated list that can be scoped to one branch. The branch parameter is
// declared on the DTO because the whole query object is validated with
// whitelist + forbidNonWhitelisted; @BranchQuery() only extracts the value.
// The value itself is validated by BranchNameValidationPipe (the domain owner),
// so an array (`?branch=a&branch=b`) or a malformed name is a 400 on every
// route, not a 422 on the DTO routes and a 400 on the pipe-only ones.
export class BranchPaginationDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Branch to read (defaults to the project default branch)',
  })
  @IsOptional()
  @Allow()
  branch?: string;
}

// The inbox additionally filters by project. Declared only here so the
// project-scoped pending endpoint does not advertise (and silently ignore) a
// `projectName` query parameter.
export class ReviewInboxPaginationDto extends BranchPaginationDto {
  @ApiPropertyOptional({
    description: 'Project to scope the read to (defaults to every project)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  projectName?: string;

  @ApiPropertyOptional({
    description: 'Filter by test kind',
    enum: TEST_KINDS,
  })
  @IsOptional()
  @IsIn(TEST_KINDS as string[])
  kind?: string;

  @ApiPropertyOptional({
    description: `Group id, or "${UNASSIGNED_GROUP_FILTER}" for projects without a group`,
  })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive search across the test name and the project name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  q?: string;
}
