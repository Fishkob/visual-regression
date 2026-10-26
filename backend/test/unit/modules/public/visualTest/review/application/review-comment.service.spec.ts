import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ReviewCommentService } from '@public/visualTest/review/application/review-comment.service';
import { ReviewCommentRepository } from '@public/visualTest/review/infrastructure/repositories/review-comment.repository';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { AuditService } from '@internal/audit/audit.service';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';

describe('ReviewCommentService', () => {
  let service: ReviewCommentService;
  let comments: Mocked<ReviewCommentRepository>;
  let testResolver: Mocked<TestResolver>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let webhooks: Mocked<WebhookDispatchService>;
  let audit: Mocked<AuditService>;

  const actor = { id: 'user-1', username: 'alice' };
  const row = {
    id: 'c-1',
    projectName: 'shop',
    branchName: 'feature/x',
    testId: 'test-1',
    comparisonId: null,
    body: 'Looks intended',
    authorId: 'user-1',
    author: 'alice',
    createdAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
  };

  beforeEach(async () => {
    comments = createMock<ReviewCommentRepository>();
    testResolver = createMock<TestResolver>();
    comparisons = createMock<UnifiedComparisonsRepository>();
    webhooks = createMock<WebhookDispatchService>();
    audit = createMock<AuditService>();

    testResolver.findOwnTest.mockResolvedValue({
      id: 'test-1',
      name: 'login',
      kind: 'image',
    });
    testResolver.findTest.mockResolvedValue({
      id: 'test-1',
      name: 'login',
      kind: 'image',
      origin: 'branch',
      inheritedFrom: null,
    });
    comments.create.mockResolvedValue(row);
    comments.findById.mockResolvedValue(row);
    comments.resolve.mockResolvedValue({
      ...row,
      resolvedAt: new Date(),
      resolvedBy: 'alice',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewCommentService,
        { provide: ReviewCommentRepository, useValue: comments },
        { provide: TestResolver, useValue: testResolver },
        { provide: UnifiedComparisonsRepository, useValue: comparisons },
        { provide: WebhookDispatchService, useValue: webhooks },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(ReviewCommentService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts a comment on the branch that owns the test', async () => {
    const view = await service.create(
      'shop',
      'login',
      { body: 'Looks intended', branch: 'feature/x' },
      actor,
    );

    expect(testResolver.findOwnTest).toHaveBeenCalledWith(
      'shop',
      'login',
      'feature/x',
    );
    expect(comments.create).toHaveBeenCalledWith({
      projectName: 'shop',
      branchName: 'feature/x',
      testId: 'test-1',
      comparisonId: null,
      body: 'Looks intended',
      authorId: 'user-1',
      author: 'alice',
    });
    expect(webhooks.enqueueReviewComment).toHaveBeenCalled();
    expect(view.id).toBe('c-1');
  });

  it('rejects a comment on an inherited test instead of writing to the ancestor', async () => {
    testResolver.findOwnTest.mockRejectedValue(
      new DomainError(
        'Test "login" is inherited from branch "main" and cannot be modified here',
        'CONFLICT',
      ),
    );

    await expect(
      service.create(
        'shop',
        'login',
        { body: 'Looks intended', branch: 'feature/x' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(comments.create).not.toHaveBeenCalled();
    expect(webhooks.enqueueReviewComment).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('lists the inherited thread through the read resolution', async () => {
    testResolver.findTest.mockResolvedValue({
      id: 'test-1',
      name: 'login',
      kind: 'image',
      origin: 'inherited',
      inheritedFrom: 'main',
    });
    comments.listForTest.mockResolvedValue([row]);

    await service.list('shop', 'login', undefined, 'feature/x');

    expect(testResolver.findTest).toHaveBeenCalledWith(
      'shop',
      'login',
      'feature/x',
    );
    expect(comments.listForTest).toHaveBeenCalledWith('test-1', undefined);
  });

  it('resolves a comment on the owning branch', async () => {
    const view = await service.resolve('shop', 'login', 'c-1', 'alice', 'main');

    expect(testResolver.findOwnTest).toHaveBeenCalledWith(
      'shop',
      'login',
      'main',
    );
    expect(comments.resolve).toHaveBeenCalledWith('c-1', 'alice');
    expect(view.resolvedAt).toBeInstanceOf(Date);
  });

  it('rejects resolving from a branch that does not own the test', async () => {
    testResolver.findOwnTest.mockRejectedValue(
      new DomainError(
        'Test "login" is inherited from branch "main" and cannot be modified here',
        'CONFLICT',
      ),
    );

    await expect(
      service.resolve('shop', 'login', 'c-1', 'alice', 'feature/x'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(comments.resolve).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
