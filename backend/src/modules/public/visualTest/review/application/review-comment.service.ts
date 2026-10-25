import { Injectable } from '@nestjs/common';
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

@Injectable()
export class ReviewCommentService {
  constructor(
    private readonly comments: ReviewCommentRepository,
    private readonly testResolver: TestResolver,
    private readonly comparisons: UnifiedComparisonsRepository,
    private readonly webhooks: WebhookDispatchService,
    private readonly audit: AuditService,
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
    const test = await this.testResolver.findTest(
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
  }

  async list(
    projectName: string,
    testName: string,
    comparisonId?: string,
    branch?: string,
  ): Promise<CommentView[]> {
    const test = await this.testResolver.findTest(
      projectName,
      testName,
      branch,
    );
    const rows = await this.comments.listForTest(test.id, comparisonId);
    return rows.map((row) => this.toView(row));
  }

  async resolve(
    projectName: string,
    testName: string,
    id: string,
    actor: string,
    branch?: string,
  ): Promise<CommentView> {
    const test = await this.testResolver.findTest(
      projectName,
      testName,
      branch,
    );
    const row = await this.comments.findById(id);
    if (row?.testId !== test.id) {
      throw new DomainError('Comment not found', 'NOT_FOUND');
    }
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
