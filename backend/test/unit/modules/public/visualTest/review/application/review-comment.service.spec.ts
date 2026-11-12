import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
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
import { createMockUoW } from '@test/utils/mocks';

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
        { provide: PrismaUnitOfWork, useValue: createMockUoW() },
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

    await service.list('shop', 'login', { branch: 'feature/x' });

    expect(testResolver.findTest).toHaveBeenCalledWith(
      'shop',
      'login',
      'feature/x',
    );
    expect(comments.listForTest).toHaveBeenCalledWith('test-1', {
      comparisonId: undefined,
      before: undefined,
      limit: 200,
    });
  });

  it('pages a thread from the cursor pair instead of re-reading the newest 200', async () => {
    const cursor = {
      ...row,
      id: 'c-40',
      createdAt: new Date('2026-01-02T00:00:00Z'),
    };
    comments.findById.mockResolvedValue(cursor);
    comments.listForTest.mockResolvedValue([row]);

    await service.list('shop', 'login', { before: 'c-40', limit: 50 });

    expect(comments.listForTest).toHaveBeenCalledWith('test-1', {
      comparisonId: undefined,
      before: { id: 'c-40', createdAt: cursor.createdAt },
      limit: 50,
    });
  });

  it('rejects a cursor that belongs to another thread', async () => {
    // A cursor from a different test cannot anchor this thread: answering with
    // rows would silently start the page at a point that test never saw, so the
    // missing cursor is a 404 like a missing filter value.
    comments.findById.mockResolvedValue({ ...row, testId: 'test-2' });

    await expect(
      service.list('shop', 'login', { before: 'c-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(comments.listForTest).not.toHaveBeenCalled();
  });

  it('rejects a page size outside the window instead of clamping it', async () => {
    // A silent clamp would answer a request for 500 comments with 200 and no
    // hint that the page was cut — the same silent truncation the cursor exists
    // to remove.
    await expect(
      service.list('shop', 'login', { limit: 201 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      service.list('shop', 'login', { limit: 0 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(comments.listForTest).not.toHaveBeenCalled();
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
