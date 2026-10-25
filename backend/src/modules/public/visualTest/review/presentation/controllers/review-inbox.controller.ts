import { Controller, Get, Query, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
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
import {
  PROJECT_RESERVED_NAMES,
  validateName,
} from '@common/http/pipes/name-validation.util';
import { BranchQuery } from '@common/http/branch-query.decorator';

@ApiTags('Review')
@Controller('review')
export class ReviewInboxController {
  constructor(private readonly inbox: ReviewInboxService) {}

  @Get('pending')
  @ApiOperation({ summary: 'List pending reviews across all projects' })
  @ApiOkResponse({ type: PaginatedResponseDto(PendingReviewDto) })
  @ApiQuery({ name: 'projectName', required: false })
  async getPending(
    @Query() pagination: ReviewInboxPaginationDto,
    @BranchQuery() branch?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const trimmedProject = pagination.projectName?.trim();
    if (trimmedProject) {
      validateName(trimmedProject, PROJECT_RESERVED_NAMES);
    }
    // An explicitly empty filter is "no filter"; the repository treats a falsy
    // value as absent, so no normalization is needed here.
    return this.inbox.getPending(pagination, {
      branchName: branch,
      projectName: trimmedProject,
      kind: pagination.kind,
      groupId: pagination.groupId,
      q: pagination.q?.trim(),
      runKey: pagination.runKey?.trim(),
      tag: pagination.tag?.trim().toLowerCase(),
      ...(pagination.assignedToMe && req?.auth?.userId
        ? { assigneeId: req.auth.userId }
        : {}),
    });
  }

  // The inbox filter's branch choices. A separate read because they must cover
  // every pending branch, not just the branches on the current page.
  @Get('branches')
  @ApiOperation({
    summary: 'List branches that currently have pending reviews',
  })
  @ApiOkResponse({ type: [String] })
  async getBranches(): Promise<string[]> {
    return this.inbox.getBranchNames();
  }
}
