import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';

import { DomainError } from '@common/domain/domain-error';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { ReviewCommentRepository } from '@public/visualTest/review/infrastructure/repositories/review-comment.repository';

export interface CommentView {
  id: string;
  projectName: string;
  branchName: string | null;
  testId: string;
  comparisonId: string | null;
  body: string;
  authorId: string | null;
  author: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

const MAX_BODY = 4000;

// The thread read is paged newest-first: a test's discussion is read from the
// recent end, and an unbounded read would grow with the thread. One page is the
// window a reviewer needs; older pages are reached with the `before` cursor,
// whose id is the oldest comment the caller holds. The limit is both the
// default page and the maximum, so a client cannot ask for "the whole thread"
// in one request and call it pagination.
export const COMMENT_PAGE_SIZE = 200;

export interface CommentListQuery {
  comparisonId?: string;
  branch?: string;
  before?: string;
  limit?: number;
}

@Injectable()
export class ReviewCommentService {
  constructor(
    private readonly comments: ReviewCommentRepository,
    private readonly testResolver: TestResolver,
    private readonly comparisons: UnifiedComparisonsRepository,
    private readonly webhooks: WebhookDispatchService,
    private readonly audit: AuditService,
    private readonly uow: PrismaUnitOfWork,
  ) {}

  async create(
    projectName: string,
    testName: string,
    input: { body: string; comparisonId?: string; branch?: string },
    actor: { id: string | null; username: string },
  ): Promise<CommentView> {
    const body = input.body.trim();
    if (!body) throw new DomainError('Comment body is required', 'BAD_REQUEST');
    if (body.length > MAX_BODY) {
      throw new DomainError(
        `Comment body must be at most ${MAX_BODY} characters`,
        'BAD_REQUEST',
      );
    }
    // A comment is a write: it belongs to the branch that owns the test. An
    // inherited test resolves to its ancestor, and writing there would store a
    // row whose branchName names a branch that does not own it — the same 409
    // every other mutation on an inherited test already answers.
    const test = await this.testResolver.findOwnTest(
      projectName,
      testName,
      input.branch,
    );
    if (input.comparisonId) {
      const comparison = await this.comparisons.findByIdForTest(
        test.id,
        input.comparisonId,
      );
      if (!comparison) {
        throw new DomainError('Comparison not found', 'NOT_FOUND');
      }
    }
    // The comment, its notification and its trail commit together: a comment that
    // nobody was told about, or one with no record of who wrote it, is exactly the
    // silent loss the approval path already refuses.
    return this.uow.execute(async () => {
      const row = await this.comments.create({
        projectName,
        branchName: input.branch ?? null,
        testId: test.id,
        comparisonId: input.comparisonId ?? null,
        body,
        authorId: actor.id,
        author: actor.username,
      });
      await this.webhooks.enqueueReviewComment({
        projectName,
        testName,
        branchName: input.branch ?? null,
        kind: test.kind,
        author: actor.username,
        body,
        comparisonId: input.comparisonId ?? null,
      });
      await this.audit.record({
        actor: actor.username,
        action: AUDIT_ACTIONS.reviewComment,
        projectName,
        testName,
        branchName: input.branch ?? null,
        targetType: 'comment',
        targetId: row.id,
        metadata: { comparisonId: input.comparisonId ?? null },
      });
      return this.toView(row);
    });
  }

  async list(
    projectName: string,
    testName: string,
    query: CommentListQuery = {},
  ): Promise<CommentView[]> {
    const limit = query.limit ?? COMMENT_PAGE_SIZE;
    if (limit < 1 || limit > COMMENT_PAGE_SIZE) {
      throw new DomainError(
        `limit must be between 1 and ${COMMENT_PAGE_SIZE}`,
        'BAD_REQUEST',
      );
    }
    const test = await this.testResolver.findTest(
      projectName,
      testName,
      query.branch,
    );
    // A cursor is only meaningful inside the thread it was read from. Resolving
    // it through the row (rather than trusting the id) also yields the
    // createdAt half of the pair; a cursor from another test is a 404, not a
    // silent read of this thread from an unrelated point.
    const cursor = query.before
      ? await this.comments.findById(query.before)
      : null;
    if (query.before && cursor?.testId !== test.id) {
      throw new DomainError('Comment not found', 'NOT_FOUND');
    }
    const rows = await this.comments.listForTest(test.id, {
      comparisonId: query.comparisonId,
      before: cursor
        ? { id: cursor.id, createdAt: cursor.createdAt }
        : undefined,
      limit,
    });
    return rows.map((row) => this.toView(row));
  }

  async resolve(
    projectName: string,
    testName: string,
    id: string,
    actor: string,
    branch?: string,
  ): Promise<CommentView> {
    // Resolving closes the thread, so it is a write like create(): only the
    // branch that owns the test may close its discussion.
    const test = await this.testResolver.findOwnTest(
      projectName,
      testName,
      branch,
    );
    const row = await this.comments.findById(id);
    if (row?.testId !== test.id) {
      throw new DomainError('Comment not found', 'NOT_FOUND');
    }
    return this.uow.execute(async () => {
      const resolved = row.resolvedAt
        ? row
        : await this.comments.resolve(id, actor);
      await this.audit.record({
        actor,
        action: AUDIT_ACTIONS.reviewCommentResolve,
        projectName,
        testName,
        branchName: branch ?? null,
        targetType: 'comment',
        targetId: id,
      });
      return this.toView(resolved);
    });
  }

  private toView(row: {
    id: string;
    projectName: string;
    branchName: string | null;
    testId: string;
    comparisonId: string | null;
    body: string;
    authorId: string | null;
    author: string;
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedBy: string | null;
  }): CommentView {
    return { ...row };
  }
}
