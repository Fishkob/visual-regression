import { Controller, Get, Query, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireProjectScope } from '@common/http/authenticated-principal';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ReviewInboxPaginationDto } from '@common/dto/branch-pagination.dto';
import { PaginatedResponseDto } from '@common/dto/paginated-response.dto';
import { ReviewInboxService } from '@public/visualTest/review/application/review-inbox.service';
import { PendingReviewDto } from '@public/visualTest/review/presentation/dto/review-responses.dto';
import { InboxBranchesQueryDto } from '@public/visualTest/review/presentation/dto/inbox-branches-query.dto';
import {
  PROJECT_RESERVED_NAMES,
  validateName,
} from '@common/http/pipes/name-validation.util';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { Scope } from '@common/http/api-key-scope.decorator';
import { ProjectSpanning } from '@common/http/project-route.decorator';

@ApiTags('Review')
@ProjectSpanning()
@Controller('review')
export class ReviewInboxController {
  constructor(private readonly inbox: ReviewInboxService) {}

  @Scope('read')
  @Get('pending')
  @ApiOperation({ summary: 'List pending reviews across all projects' })
  @ApiOkResponse({ type: PaginatedResponseDto(PendingReviewDto) })
  @ApiQuery({ name: 'projectName', required: false })
  async getPending(
    @Req() req: AuthenticatedRequest,
    @Query() pagination: ReviewInboxPaginationDto,
    @BranchQuery() branch?: string,
  ) {
    const trimmedProject = pagination.projectName?.trim();
    if (trimmedProject) {
      validateName(trimmedProject, PROJECT_RESERVED_NAMES);
    }
    // An explicitly empty filter is "no filter"; the repository treats a falsy
    // value as absent, so no normalization is needed here.
    return this.inbox.getPending(
      pagination,
      {
        branchName: branch,
        projectName: trimmedProject,
        kind: pagination.kind,
        groupId: pagination.groupId,
        teamId: pagination.teamId,
        q: pagination.q?.trim(),
        runKey: pagination.runKey?.trim(),
        tag: pagination.tag?.trim().toLowerCase(),
        ...(pagination.assignedToMe && req.auth?.userId
          ? { assigneeId: req.auth.userId }
          : {}),
      },
      requireProjectScope(req),
    );
  }

  // The inbox filter's branch choices. A separate read because they must cover
  // every pending branch, not just the branches on the current page.
  @Scope('read')
  @Get('branches')
  @ApiOperation({
    summary: 'List branches that currently have pending reviews',
  })
  @ApiOkResponse({ type: [String] })
  async getBranches(
    @Req() req: AuthenticatedRequest,
    @Query() query: InboxBranchesQueryDto,
  ): Promise<string[]> {
    // An empty value is "no lens", not a team named "".
    const trimmed = query.teamId?.trim();
    const teamId = trimmed === '' ? undefined : trimmed;
    // The branch choices follow the team lens, so a filtered inbox does not
    // offer the branches of a team it is not showing.
    return this.inbox.getBranchNames(requireProjectScope(req), teamId);
  }
}
