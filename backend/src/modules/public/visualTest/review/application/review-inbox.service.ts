import { Injectable } from '@nestjs/common';
import type { ProjectScope } from '@common/domain/project-scope';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from '@common/dto/pagination.dto';
import { paginatedQuery } from '@common/utils/paginated-query';
import { ReviewInboxRepository } from '@public/visualTest/review/infrastructure/repositories/review-inbox.repository';
import { PendingReviewDto } from '@public/visualTest/review/presentation/dto/review-responses.dto';

@Injectable()
export class ReviewInboxService {
  constructor(private readonly inbox: ReviewInboxRepository) {}

  async getPending(
    pagination: PaginationDto,
    filters:
      | {
          branchName?: string;
          projectName?: string;
          kind?: string;
          groupId?: string;
          teamId?: string;
          q?: string;
          runKey?: string;
          tag?: string;
          assigneeId?: string;
        }
      | undefined,
    scope: ProjectScope,
  ) {
    return paginatedQuery(
      (args) => this.inbox.findPending(args, filters, scope),
      pagination,
      (row) =>
        plainToInstance(PendingReviewDto, row, {
          excludeExtraneousValues: true,
        }),
    );
  }

  async getBranchNames(
    scope: ProjectScope,
    teamId?: string,
  ): Promise<string[]> {
    return this.inbox.findPendingBranchNames(scope, teamId);
  }
}
