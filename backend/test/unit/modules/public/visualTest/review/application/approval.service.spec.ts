import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainError } from '@common/domain/domain-error';
import {
  ApprovalService,
  type ApprovalDecisionOptions,
} from '@public/visualTest/review/application/approval.service';
import { Tracker } from '@common/tracker/tracker.service';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  ComparisonStatus,
  ScreenshotType,
} from '@public/visualTest/core/domain/types/visual-test.types';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ApprovalVoteRepository } from '@public/visualTest/review/infrastructure/repositories/approval-vote.repository';
import { ApprovalAuditRepository } from '@public/visualTest/core/infrastructure/repositories/approval-audit.repository';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { BaselineHistoryService } from '@public/visualTest/core/application/services/baseline-history.service';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { AuditService } from '@internal/audit/audit.service';
import {
  PDF_RENDER_CACHE,
  IPdfRenderCache,
} from '@common/domain/pdf-sidecar.interface';
import { createMock } from '@test/utils/create-mock';
import {
  createMockLogger,
  createMockProjectRepository,
  createMockStorage,
  createMockUoW,
} from '@test/utils/mocks';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { STORAGE_OBJECT_REFERENCEDNESS } from '@common/domain/storage-referencedness.interface';

describe('ApprovalService', () => {
  let service: ApprovalService;
  let statusService: Mocked<TestStatusService>;
  let testResolver: Mocked<TestResolver>;
  let metrics: Mocked<IMetricsRecorder>;
  let storage: Mocked<IStorageProvider>;
  let uow: Mocked<PrismaUnitOfWork>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let retirement: Mocked<ComparisonRetirementService>;
  let baselineHistory: Mocked<BaselineHistoryService>;
  let webhooks: Mocked<WebhookDispatchService>;
  let audit: Mocked<AuditService>;
  let pdfRenderCache: Mocked<IPdfRenderCache>;
  let approvalAudit: Mocked<ApprovalAuditRepository>;
  let projects: Mocked<ProjectRepository>;
  let votes: Mocked<ApprovalVoteRepository>;

  const imageTest = { id: 'test-1', name: 'my-test', kind: 'image' as const };
  const pdfTest = { id: 'test-1', name: 'my-test', kind: 'pdf' as const };
  const variant = Variant.fromStrings('1920x1080', 'chrome', 'staging');
  const approvedBy = 'reviewer';

  function options(
    overrides: Partial<ApprovalDecisionOptions> = {},
  ): ApprovalDecisionOptions {
    return {
      principalType: 'user',
      principalId: 'user-1',
      ...overrides,
    };
  }

  function makeBaseline(overrides = {}) {
    return new ScreenshotEntity({
      id: 'baseline-1',
      visualTestId: 'test-1',
      type: ScreenshotType.BASELINE,
      imageHash: 'old-hash',
      imageUrl: 'http://storage/baseline.png',
      variant,
      createdAt: new Date('2024-01-01'),
      pixelDiffThreshold: 0,
      ...overrides,
    });
  }

  function makeCandidate(overrides = {}) {
    return new ScreenshotEntity({
      id: 'candidate-1',
      visualTestId: 'test-1',
      type: ScreenshotType.CURRENT,
      imageHash: 'new-hash',
      imageUrl: 'http://storage/candidate.png',
      variant,
      createdAt: new Date('2024-01-02'),
      pixelDiffThreshold: 0,
      ...overrides,
    });
  }

  function makeComparison(
    baseline: ScreenshotEntity,
    candidate: ScreenshotEntity,
    overrides = {},
  ) {
    return new ComparisonEntity({
      id: 'comp-1',
      visualTestId: 'test-1',
      mismatchPixelCount: 10,
      diffImageUrl: 'http://storage/diff.png',
      status: ComparisonStatus.PENDING_APPROVAL,
      baselineId: baseline.id,
      candidateId: candidate.id,
      createdAt: new Date(),
      baseline,
      candidate,
      ...overrides,
    });
  }

  function makePdfComparison() {
    const baseline = new ScreenshotEntity({
      id: 'pdf-baseline-1',
      visualTestId: 'test-1',
      type: ScreenshotType.BASELINE,
      imageHash: 'old-pdf-hash',
      imageUrl: 'http://storage/pdf-baseline.png',
      variant,
      createdAt: new Date('2024-01-01'),
      pixelDiffThreshold: 0,
      pageCount: 5,
    });
    const candidate = new ScreenshotEntity({
      id: 'pdf-candidate-1',
      visualTestId: 'test-1',
      type: ScreenshotType.CURRENT,
      imageHash: 'new-pdf-hash',
      imageUrl: 'http://storage/pdf-candidate.png',
      variant,
      createdAt: new Date('2024-01-02'),
      pixelDiffThreshold: 0,
      pageCount: 5,
    });
    return new ComparisonEntity({
      id: 'pdf-comp-1',
      visualTestId: 'test-1',
      mismatchPixelCount: 0,
      diffImageUrl: null,
      status: ComparisonStatus.PENDING_APPROVAL,
      baselineId: baseline.id,
      candidateId: candidate.id,
      createdAt: new Date(),
      baseline,
      candidate,
    });
  }

  beforeEach(async () => {
    projects = createMockProjectRepository();
    projects.findByName.mockResolvedValue({ requiredApprovals: 1 } as never);
    votes = createMock<ApprovalVoteRepository>();
    votes.hasVoted.mockResolvedValue(false);
    votes.countForComparison.mockResolvedValue(0);
    votes.record.mockResolvedValue(undefined);
    statusService = createMock<TestStatusService>();
    testResolver = createMock<TestResolver>();
    metrics = createMock<IMetricsRecorder>();
    screenshots = createMock<UnifiedScreenshotRepository>();
    screenshots.filterReclaimableUrls.mockImplementation((urls) =>
      Promise.resolve(urls),
    );
    comparisons = createMock<UnifiedComparisonsRepository>();
    comparisons.completeImageApproval.mockResolvedValue([]);
    comparisons.completePdfApproval.mockResolvedValue([]);
    retirement = createMock<ComparisonRetirementService>();
    retirement.retireSiblingsAndDeleteCandidate.mockResolvedValue([]);
    baselineHistory = createMock<BaselineHistoryService>();
    baselineHistory.recordOutgoingBaseline.mockResolvedValue([]);
    webhooks = createMock<WebhookDispatchService>();
    webhooks.enqueueComparisonApproved.mockResolvedValue(0);
    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);
    pdfRenderCache = createMock<IPdfRenderCache>();
    approvalAudit = createMock<ApprovalAuditRepository>();
    approvalAudit.record.mockResolvedValue(undefined);
    const tracker = createMock<Tracker>();
    tracker.track.mockImplementation((_: string, fn: () => Promise<any>) =>
      fn(),
    );
    const uowLocal = createMockUoW() as unknown as Mocked<PrismaUnitOfWork>;
    uow = uowLocal;
    storage = createMockStorage() as unknown as Mocked<IStorageProvider>;
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: TestResolver, useValue: testResolver },
        { provide: TestStatusService, useValue: statusService },
        { provide: PrismaUnitOfWork, useValue: uowLocal },
        StateChangeWorkflow,
        {
          provide: STORAGE_OBJECT_REFERENCEDNESS,
          useValue: {
            filterReclaimableUrls: (urls: string[]) => Promise.resolve(urls),
          },
        },

        {
          provide: StorageUsageService,
          useValue: createMock<StorageUsageService>(),
        },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: Tracker, useValue: tracker },
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
        { provide: UnifiedComparisonsRepository, useValue: comparisons },
        { provide: ComparisonRetirementService, useValue: retirement },
        { provide: BaselineHistoryService, useValue: baselineHistory },
        { provide: WebhookDispatchService, useValue: webhooks },
        { provide: AuditService, useValue: audit },
        { provide: PDF_RENDER_CACHE, useValue: pdfRenderCache },
        { provide: ApprovalAuditRepository, useValue: approvalAudit },
        { provide: ProjectRepository, useValue: projects },
        { provide: ApprovalVoteRepository, useValue: votes },
        { provide: AppLoggerService, useValue: createMockLogger() },
        { provide: METRICS_RECORDER, useValue: metrics },
      ],
    }).compile();

    service = module.get(ApprovalService);
    uow = uowLocal;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('approveImage', () => {
    function mockResolvedTest() {
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
    }

    it('approves an image test and returns new baseline url', async () => {
      const baseline = makeBaseline();
      const candidate = makeCandidate();
      const comparison = makeComparison(baseline, candidate);

      mockResolvedTest();
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      comparisons.completeImageApproval.mockResolvedValue([
        'http://storage/diff.png',
      ]);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      const result = await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(testResolver.findTestOfKind).toHaveBeenCalledWith(
        'my-project',
        'my-test',
        'image',
      );
      expect(comparisons.findByIdForTest).toHaveBeenCalledWith(
        'test-1',
        'comp-1',
      );
      expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
      expect(screenshots.markBaselineOwned).toHaveBeenCalledWith('baseline-1');
      expect(comparisons.completeImageApproval).toHaveBeenCalledWith(
        'test-1',
        'comp-1',
      );
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/baseline.png',
        'http://storage/diff.png',
      ]);
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'domain_events_total',
        expect.objectContaining({ event: 'comparison_approved' }),
      );
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'domain_events_total',
        expect.objectContaining({ event: 'baseline_updated' }),
      );
      expect(webhooks.enqueueComparisonApproved).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'my-project',
          testName: 'my-test',
          kind: 'image',
          comparisonId: 'comp-1',
          approvedBy: 'reviewer',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'reviewer',
          action: 'approval',
          projectName: 'my-project',
          testName: 'my-test',
          targetType: 'test',
          targetId: 'test-1',
        }),
      );

      expect(result).toEqual({
        approved: true as const,
        newBaselineUrl: 'http://storage/candidate.png',
        signedNewBaselineUrl: 'http://storage/candidate.png',
      });
    });

    it('carries the decision reason and note into the audit row and the approval webhook', async () => {
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
      comparisons.findByIdForTest.mockResolvedValue(
        makeComparison(makeBaseline(), makeCandidate()),
      );
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options({ reason: 'FLAKE', note: 'Flaky promo banner' }),
      );

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'approval',
          metadata: expect.objectContaining({
            reason: 'FLAKE',
            note: 'Flaky promo banner',
          }),
        }),
      );
      expect(webhooks.enqueueComparisonApproved).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'FLAKE',
          note: 'Flaky promo banner',
        }),
      );
      expect(approvalAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'FLAKE',
          note: 'Flaky promo banner',
        }),
      );
    });

    it('records null reason and note in the audit metadata when none was given', async () => {
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
      comparisons.findByIdForTest.mockResolvedValue(
        makeComparison(makeBaseline(), makeCandidate()),
      );
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'approval',
          metadata: expect.objectContaining({ reason: null, note: null }),
        }),
      );
      expect(webhooks.enqueueComparisonApproved).toHaveBeenCalledWith(
        expect.objectContaining({ reason: null, note: null }),
      );
    });

    it('records the replaced baseline before overwriting it', async () => {
      const baseline = makeBaseline();
      const comparison = makeComparison(baseline, makeCandidate());
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(baselineHistory.recordOutgoingBaseline).toHaveBeenCalledWith({
        testId: 'test-1',
        variant,
        baseline,
        reason: 'approval',
        createdBy: approvedBy,
      });
      expect(
        baselineHistory.recordOutgoingBaseline.mock.invocationCallOrder[0],
      ).toBeLessThan(
        screenshots.updateBaselineScreenshot.mock.invocationCallOrder[0],
      );
    });

    it('records the approval audit entry with the decision it folded into the baseline', async () => {
      const comparison = makeComparison(makeBaseline(), makeCandidate());
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        'jane.doe',
        'feature/x',
        options(),
      );

      expect(approvalAudit.record).toHaveBeenCalledTimes(1);
      expect(approvalAudit.record).toHaveBeenCalledWith({
        projectName: 'my-project',
        testName: 'my-test',
        branchName: 'feature/x',
        testId: 'test-1',
        runId: null,
        runKey: null,
        testKind: 'image',
        variantViewport: '1920x1080',
        variantBrowser: 'chrome',
        variantEnvironment: 'staging',
        comparisonId: 'comp-1',
        baselineId: 'baseline-1',
        candidateId: 'candidate-1',
        candidateHash: 'new-hash',
        baselineHash: 'old-hash',
        mismatchPixelCount: 10,
        mismatchPageCount: null,
        pageCount: null,
        approvedBy: 'jane.doe',
        reason: null,
        note: null,
      });
    });

    it('records a null branch when the caller did not name one', async () => {
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
      comparisons.findByIdForTest.mockResolvedValue(
        makeComparison(makeBaseline(), makeCandidate()),
      );
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(approvalAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ branchName: null, approvedBy }),
      );
    });

    it('writes the audit row after the approval takes effect, inside the same change', async () => {
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
      comparisons.findByIdForTest.mockResolvedValue(
        makeComparison(makeBaseline(), makeCandidate()),
      );
      statusService.recomputeStatus.mockResolvedValue(undefined);

      // Observe whether the audit write runs while the workflow's change
      // function is executing — i.e. inside the transaction that will roll the
      // approval back if the write fails.
      let inChange = false;
      let auditWrittenInChange: boolean | undefined;
      uow.execute.mockImplementation(((fn: () => Promise<unknown>) => {
        inChange = true;
        return fn().finally(() => {
          inChange = false;
        });
      }) as never);
      approvalAudit.record.mockImplementation(() => {
        auditWrittenInChange = inChange;
        return Promise.resolve();
      });

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options(),
      );

      // The comparison is already gone (image approval deletes it) when the
      // audit row is written — which is why the row is denormalized.
      expect(
        comparisons.completeImageApproval.mock.invocationCallOrder[0],
      ).toBeLessThan(approvalAudit.record.mock.invocationCallOrder[0]!);
      expect(auditWrittenInChange).toBe(true);
    });

    it('fails the approval when the audit write fails so no approval escapes the trail', async () => {
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
      comparisons.findByIdForTest.mockResolvedValue(
        makeComparison(makeBaseline(), makeCandidate()),
      );
      statusService.recomputeStatus.mockResolvedValue(undefined);
      approvalAudit.record.mockRejectedValue(new Error('audit write failed'));

      await expect(
        service.approveImage(
          'my-project',
          'my-test',
          'comp-1',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toThrow('audit write failed');
      expect(approvalAudit.record).toHaveBeenCalledTimes(1);
    });

    it('executes the approval in a retried Serializable transaction like the upload path', async () => {
      const baseline = makeBaseline();
      const candidate = makeCandidate();
      const comparison = makeComparison(baseline, candidate);

      mockResolvedTest();
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(uow.execute).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: 'Serializable',
        }),
      );
    });

    it('throws when project not found', async () => {
      testResolver.findTestOfKind.mockRejectedValue(
        new DomainError('Project "my-project" not found', 'NOT_FOUND'),
      );
      await expect(
        service.approveImage(
          'my-project',
          'my-test',
          'comp-1',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toThrow(DomainError);
    });

    it('throws when comparison is not found', async () => {
      mockResolvedTest();
      comparisons.findByIdForTest.mockResolvedValue(null);
      await expect(
        service.approveImage(
          'my-project',
          'my-test',
          'comp-1',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toThrow(DomainError);
    });

    it('throws when comparison is no longer pending', async () => {
      mockResolvedTest();
      comparisons.findByIdForTest.mockResolvedValue(
        new ComparisonEntity({
          id: 'comp-1',
          visualTestId: 'test-1',
          mismatchPixelCount: 10,
          diffImageUrl: 'http://storage/diff.png',
          status: ComparisonStatus.APPROVED,
          baselineId: 'baseline-1',
          candidateId: 'candidate-1',
          createdAt: new Date(),
        }),
      );
      await expect(
        service.approveImage(
          'my-project',
          'my-test',
          'comp-1',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('throws when comparison missing baseline', async () => {
      mockResolvedTest();
      const comparison = makeComparison(makeBaseline(), makeCandidate()) as any;
      comparison.baseline = null;
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      await expect(
        service.approveImage(
          'my-project',
          'my-test',
          'comp-1',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toThrow(DomainError);
    });

    it('throws when comparison missing candidate', async () => {
      mockResolvedTest();
      const comparison = makeComparison(makeBaseline(), makeCandidate()) as any;
      comparison.candidate = null;
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      await expect(
        service.approveImage(
          'my-project',
          'my-test',
          'comp-1',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toThrow(DomainError);
    });

    it('rejects approving a PDF test through the image endpoint', async () => {
      testResolver.findTestOfKind.mockRejectedValue(
        new DomainError('Test "my-test" is not an image test', 'BAD_REQUEST'),
      );

      await expect(
        service.approveImage(
          'my-project',
          'my-test',
          'comp-1',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toThrow(/not an image test/);
      expect(comparisons.findByIdForTest).not.toHaveBeenCalled();
      expect(comparisons.completeImageApproval).not.toHaveBeenCalled();
    });

    it('updates baseline, deletes comparison, retires others and returns stale urls', async () => {
      mockResolvedTest();
      const comparison = makeComparison(makeBaseline(), makeCandidate());
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      comparisons.completeImageApproval.mockResolvedValue([
        'http://storage/diff.png',
      ]);
      retirement.retireSiblingsAndDeleteCandidate.mockResolvedValue([
        'http://storage/stale-diff.png',
      ]);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(screenshots.updateBaselineScreenshot).toHaveBeenCalledWith(
        'baseline-1',
        {
          imageHash: 'new-hash',
          imageUrl: 'http://storage/candidate.png',
        },
      );
      expect(comparisons.completeImageApproval).toHaveBeenCalledWith(
        'test-1',
        'comp-1',
      );
      expect(retirement.retireSiblingsAndDeleteCandidate).toHaveBeenCalledWith(
        'test-1',
        variant,
        'candidate-1',
      );
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/baseline.png',
        'http://storage/diff.png',
        'http://storage/stale-diff.png',
      ]);
    });

    it('drops urls still referenced by a baseline or live comparison from the stale list', async () => {
      mockResolvedTest();
      const comparison = makeComparison(makeBaseline(), makeCandidate());
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      screenshots.filterReclaimableUrls.mockResolvedValue([]);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(storage.deleteAll).not.toHaveBeenCalled();
    });
  });

  describe('4-eyes votes', () => {
    function mockPendingImage() {
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
      comparisons.findByIdForTest.mockResolvedValue(
        makeComparison(makeBaseline(), makeCandidate()),
      );
      statusService.recomputeStatus.mockResolvedValue(undefined);
    }

    it('waits for the required number of distinct approvers and keys the vote on the principal id', async () => {
      projects.findByName.mockResolvedValue({ requiredApprovals: 2 } as never);
      votes.countForComparison.mockResolvedValue(0);
      mockPendingImage();

      const result = await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        'jane.doe',
        undefined,
        options({ principalId: 'user-alice' }),
      );

      expect(result).toEqual({
        approved: false,
        requiresMoreApprovals: true,
        votes: 1,
        required: 2,
      });
      expect(votes.record).toHaveBeenCalledWith({
        comparisonId: 'comp-1',
        projectName: 'my-project',
        testId: 'test-1',
        userId: 'user-alice',
        username: 'jane.doe',
      });
      expect(audit.record).toHaveBeenCalledWith({
        actor: 'jane.doe',
        action: 'review.vote',
        projectName: 'my-project',
        testName: 'my-test',
        branchName: null,
        targetType: 'comparison',
        targetId: 'comp-1',
        metadata: {
          comparisonId: 'comp-1',
          votes: 1,
          required: 2,
          principalType: 'user',
        },
      });
      expect(approvalAudit.record).not.toHaveBeenCalled();
    });

    it('writes the vote audit inside the same transaction as the vote', async () => {
      projects.findByName.mockResolvedValue({ requiredApprovals: 2 } as never);
      mockPendingImage();

      let inChange = false;
      let auditWrittenInChange: boolean | undefined;
      uow.execute.mockImplementation(((fn: () => Promise<unknown>) => {
        inChange = true;
        return fn().finally(() => {
          inChange = false;
        });
      }) as never);
      audit.record.mockImplementation(() => {
        auditWrittenInChange = inChange;
        return Promise.resolve();
      });

      await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(auditWrittenInChange).toBe(true);
    });

    it('rejects an API-key vote on a 4-eyes project without recording a vote', async () => {
      projects.findByName.mockResolvedValue({ requiredApprovals: 2 } as never);
      mockPendingImage();

      await expect(
        service.approveImage(
          'my-project',
          'my-test',
          'comp-1',
          'ci-key',
          undefined,
          options({ principalType: 'apiKey', principalId: 'api-key-1' }),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(votes.record).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(approvalAudit.record).not.toHaveBeenCalled();
    });

    it('keeps API-key approvals working when a single approval is required', async () => {
      projects.findByName.mockResolvedValue({ requiredApprovals: 1 } as never);
      mockPendingImage();

      const result = await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        'ci-key',
        undefined,
        options({ principalType: 'apiKey', principalId: 'api-key-1' }),
      );

      expect(result.approved).toBe(true);
      expect(votes.record).not.toHaveBeenCalled();
      expect(approvalAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ approvedBy: 'ci-key' }),
      );
    });

    it('does not audit a duplicate vote', async () => {
      projects.findByName.mockResolvedValue({ requiredApprovals: 2 } as never);
      votes.hasVoted.mockResolvedValue(true);
      mockPendingImage();

      await expect(
        service.approveImage(
          'my-project',
          'my-test',
          'comp-1',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(votes.record).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(approvalAudit.record).not.toHaveBeenCalled();
    });

    it('records the finalizing vote without a review.vote audit row', async () => {
      projects.findByName.mockResolvedValue({ requiredApprovals: 2 } as never);
      votes.countForComparison.mockResolvedValue(1);
      mockPendingImage();

      const result = await service.approveImage(
        'my-project',
        'my-test',
        'comp-1',
        'bob',
        undefined,
        options({ principalId: 'user-bob' }),
      );

      expect(result.approved).toBe(true);
      expect(votes.record).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-bob', username: 'bob' }),
      );
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'approval' }),
      );
      expect(approvalAudit.record).toHaveBeenCalledTimes(1);
    });
  });

  describe('approvePdf', () => {
    function mockResolvedPdfTest() {
      testResolver.findTestOfKind.mockResolvedValue(pdfTest);
    }

    it('approves a PDF test', async () => {
      const comparison = makePdfComparison();
      mockResolvedPdfTest();
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      const result = await service.approvePdf(
        'my-project',
        'my-test',
        'pdf-comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(comparisons.findByIdForTest).toHaveBeenCalledWith(
        'test-1',
        'pdf-comp-1',
      );
      expect(statusService.recomputeStatus).toHaveBeenCalledWith('test-1');
      expect(pdfRenderCache.clearCache).toHaveBeenCalledWith(
        'http://storage/pdf-baseline.png',
      );
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'domain_events_total',
        expect.objectContaining({ event: 'comparison_approved' }),
      );
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'domain_events_total',
        expect.objectContaining({ event: 'baseline_updated' }),
      );
      expect(webhooks.enqueueComparisonApproved).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'pdf',
          comparisonId: 'pdf-comp-1',
          approvedBy: 'reviewer',
        }),
      );

      expect(result).toEqual({
        approved: true,
        newBaselineUrl: 'http://storage/pdf-candidate.png',
        signedNewBaselineUrl: 'http://storage/pdf-candidate.png',
      });
    });

    it('records the pdf approval audit entry, falling back to the candidate page count', async () => {
      testResolver.findTestOfKind.mockResolvedValue(pdfTest);
      comparisons.findByIdForTest.mockResolvedValue(makePdfComparison());
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approvePdf(
        'my-project',
        'my-test',
        'pdf-comp-1',
        'jane.doe',
        undefined,
        options(),
      );

      expect(approvalAudit.record).toHaveBeenCalledTimes(1);
      expect(approvalAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          testKind: 'pdf',
          branchName: null,
          comparisonId: 'pdf-comp-1',
          baselineId: 'pdf-baseline-1',
          candidateId: 'pdf-candidate-1',
          candidateHash: 'new-pdf-hash',
          baselineHash: 'old-pdf-hash',
          mismatchPixelCount: 0,
          pageCount: 5,
          approvedBy: 'jane.doe',
        }),
      );
    });

    it('updates pdf baseline, approves comparison, and deletes the candidate row', async () => {
      mockResolvedPdfTest();
      comparisons.findByIdForTest.mockResolvedValue(makePdfComparison());
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approvePdf(
        'my-project',
        'my-test',
        'pdf-comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(screenshots.updateBaselineScreenshot).toHaveBeenCalledWith(
        'pdf-baseline-1',
        {
          imageHash: 'new-pdf-hash',
          imageUrl: 'http://storage/pdf-candidate.png',
          pageCount: 5,
        },
      );
      expect(screenshots.markBaselineOwned).toHaveBeenCalledWith(
        'pdf-baseline-1',
      );
      expect(comparisons.completePdfApproval).toHaveBeenCalledWith(
        'pdf-comp-1',
        undefined,
      );
      expect(retirement.retireSiblingsAndDeleteCandidate).toHaveBeenCalledWith(
        'test-1',
        variant,
        'pdf-candidate-1',
      );
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/pdf-baseline.png',
      ]);
    });

    it('clears and reclaims the diff pdf file after approval', async () => {
      mockResolvedPdfTest();
      const comparison = makePdfComparison() as any;
      comparison.diffPdfUrl = 'http://storage/pdf-diff.pdf';
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      comparisons.completePdfApproval.mockResolvedValue([
        'http://storage/pdf-diff.pdf',
      ]);
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approvePdf(
        'my-project',
        'my-test',
        'pdf-comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(comparisons.completePdfApproval).toHaveBeenCalledWith(
        'pdf-comp-1',
        'http://storage/pdf-diff.pdf',
      );
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/pdf-baseline.png',
        'http://storage/pdf-diff.pdf',
      ]);
      expect(pdfRenderCache.clearCache).toHaveBeenCalledWith(
        'http://storage/pdf-diff.pdf',
      );
    });

    it('does not clear the diff reference when there is no diff pdf', async () => {
      mockResolvedPdfTest();
      comparisons.findByIdForTest.mockResolvedValue(makePdfComparison());
      statusService.recomputeStatus.mockResolvedValue(undefined);

      await service.approvePdf(
        'my-project',
        'my-test',
        'pdf-comp-1',
        approvedBy,
        undefined,
        options(),
      );

      expect(comparisons.completePdfApproval).toHaveBeenCalledWith(
        'pdf-comp-1',
        undefined,
      );
    });

    it('throws when comparison is not found', async () => {
      mockResolvedPdfTest();
      comparisons.findByIdForTest.mockResolvedValue(null);
      await expect(
        service.approvePdf(
          'my-project',
          'my-test',
          'comp-x',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toThrow(DomainError);
    });

    it('rejects approving an image test through the PDF endpoint', async () => {
      testResolver.findTestOfKind.mockRejectedValue(
        new DomainError('Test "my-test" is not a PDF test', 'BAD_REQUEST'),
      );

      await expect(
        service.approvePdf(
          'my-project',
          'my-test',
          'comp-x',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toThrow(/not a PDF test/);
      expect(comparisons.findByIdForTest).not.toHaveBeenCalled();
      expect(comparisons.completePdfApproval).not.toHaveBeenCalled();
    });

    it('throws when pending comparison missing candidate', async () => {
      mockResolvedPdfTest();
      const comparison = makePdfComparison() as any;
      comparison.candidate = null;
      comparisons.findByIdForTest.mockResolvedValue(comparison);
      await expect(
        service.approvePdf(
          'my-project',
          'my-test',
          'comp-x',
          approvedBy,
          undefined,
          options(),
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  // The pre-branch contract: a client approves by comparisonId only. The
  // comparison identifies its own test (and therefore its branch), so a
  // feature-branch approval must work without the caller learning about branches.
  it('resolves the branch through the comparison when no branch is given', async () => {
    const baseline = makeBaseline();
    const candidate = makeCandidate();
    comparisons.findTestOfComparison.mockResolvedValue({
      id: 'test-1',
      name: 'my-test',
      kind: 'image',
    } as never);
    comparisons.findByIdForTest.mockResolvedValue(
      makeComparison(baseline, candidate),
    );
    comparisons.completeImageApproval.mockResolvedValue([]);
    statusService.recomputeStatus.mockResolvedValue(undefined);

    await service.approveImage(
      'my-project',
      'my-test',
      'cmp-1',
      approvedBy,
      undefined,
      options(),
    );

    expect(comparisons.findTestOfComparison).toHaveBeenCalledWith({
      projectName: 'my-project',
      testName: 'my-test',
      comparisonId: 'cmp-1',
    });
    expect(testResolver.findTestOfKind).not.toHaveBeenCalled();
  });

  describe('approveAllPending', () => {
    function mockPendingImageTargets(ids: string[]) {
      testResolver.findOwnTest.mockResolvedValue(imageTest);
      testResolver.findTestOfKind.mockResolvedValue(imageTest);
      comparisons.findPendingComparisonIdsForTest.mockResolvedValue(ids);
      comparisons.findByIdForTest.mockImplementation(
        (_testId: string, id: string) =>
          Promise.resolve(
            makeComparison(
              makeBaseline({ id: `baseline-${id}` }),
              makeCandidate({ id: `candidate-${id}` }),
              { id },
            ),
          ),
      );
      statusService.recomputeStatus.mockResolvedValue(undefined);
    }

    it('returns a zero result when the test has no pending comparison', async () => {
      testResolver.findOwnTest.mockResolvedValue(imageTest);
      comparisons.findPendingComparisonIdsForTest.mockResolvedValue([]);

      const result = await service.approveAllPending(
        'my-project',
        'my-test',
        approvedBy,
        options(),
        'feature/x',
      );

      expect(testResolver.findOwnTest).toHaveBeenCalledWith(
        'my-project',
        'my-test',
        'feature/x',
      );
      expect(comparisons.findPendingComparisonIdsForTest).toHaveBeenCalledWith(
        'test-1',
      );
      expect(result).toEqual({ approved: 0, pending: [], failed: [] });
      expect(approvalAudit.record).not.toHaveBeenCalled();
    });

    it('approves every pending comparison of the own test and records one audit row each', async () => {
      mockPendingImageTargets(['comp-1', 'comp-2', 'comp-3']);

      const result = await service.approveAllPending(
        'my-project',
        'my-test',
        'jane.doe',
        options(),
        'feature/x',
      );

      expect(result).toEqual({ approved: 3, pending: [], failed: [] });
      expect(
        comparisons.completeImageApproval.mock.calls.map(([, id]) => id),
      ).toEqual(['comp-1', 'comp-2', 'comp-3']);
      expect(approvalAudit.record).toHaveBeenCalledTimes(3);
      expect(
        approvalAudit.record.mock.calls.map(([row]) => [
          row.comparisonId,
          row.approvedBy,
          row.branchName,
        ]),
      ).toEqual([
        ['comp-1', 'jane.doe', 'feature/x'],
        ['comp-2', 'jane.doe', 'feature/x'],
        ['comp-3', 'jane.doe', 'feature/x'],
      ]);
    });

    it('reports a superseded comparison as failed and keeps approving the rest', async () => {
      mockPendingImageTargets(['comp-1', 'comp-2', 'comp-3']);
      // The middle comparison lost the race between the id read and its own
      // approval, so the per-comparison approval fails with a DomainError.
      comparisons.findByIdForTest.mockImplementation(
        (_testId: string, id: string) =>
          Promise.resolve(
            id === 'comp-2'
              ? null
              : makeComparison(
                  makeBaseline({ id: `baseline-${id}` }),
                  makeCandidate({ id: `candidate-${id}` }),
                  { id },
                ),
          ),
      );

      const result = await service.approveAllPending(
        'my-project',
        'my-test',
        approvedBy,
        options(),
      );

      expect(result).toEqual({
        approved: 2,
        pending: [],
        failed: [
          {
            comparisonId: 'comp-2',
            error: 'Comparison not found for approval',
          },
        ],
      });
      expect(
        comparisons.completeImageApproval.mock.calls.map(([, id]) => id),
      ).toEqual(['comp-1', 'comp-3']);
      expect(approvalAudit.record).toHaveBeenCalledTimes(2);
    });

    it('reports a non-domain failure as a generic message without leaking internals', async () => {
      mockPendingImageTargets(['comp-1', 'comp-2']);
      approvalAudit.record.mockImplementation((row) =>
        row.comparisonId === 'comp-1'
          ? Promise.reject(new Error('storage object missing: s3://secret'))
          : Promise.resolve(),
      );

      const result = await service.approveAllPending(
        'my-project',
        'my-test',
        approvedBy,
        options(),
      );

      expect(result).toEqual({
        approved: 1,
        pending: [],
        failed: [{ comparisonId: 'comp-1', error: 'Approval failed' }],
      });
      expect(JSON.stringify(result)).not.toContain('s3://secret');
      expect(comparisons.completeImageApproval).toHaveBeenCalledTimes(2);
    });

    it('approves pending PDF comparisons through the kind of the own test', async () => {
      testResolver.findOwnTest.mockResolvedValue(pdfTest);
      testResolver.findTestOfKind.mockResolvedValue(pdfTest);
      comparisons.findPendingComparisonIdsForTest.mockResolvedValue([
        'pdf-comp-1',
      ]);
      comparisons.findByIdForTest.mockResolvedValue(makePdfComparison());
      statusService.recomputeStatus.mockResolvedValue(undefined);

      const result = await service.approveAllPending(
        'my-project',
        'my-test',
        approvedBy,
        options(),
      );

      expect(result).toEqual({ approved: 1, pending: [], failed: [] });
      expect(comparisons.completePdfApproval).toHaveBeenCalledWith(
        'pdf-comp-1',
        undefined,
      );
      expect(approvalAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          testKind: 'pdf',
          comparisonId: 'pdf-comp-1',
        }),
      );
    });

    it('propagates the inherited-test conflict without starting the batch', async () => {
      testResolver.findOwnTest.mockRejectedValue(
        new DomainError(
          'Test "my-test" is inherited from branch "main" and cannot be modified here',
          'CONFLICT',
        ),
      );

      await expect(
        service.approveAllPending(
          'my-project',
          'my-test',
          approvedBy,
          options(),
          'feature/x',
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(
        comparisons.findPendingComparisonIdsForTest,
      ).not.toHaveBeenCalled();
      expect(comparisons.findByIdForTest).not.toHaveBeenCalled();
      expect(approvalAudit.record).not.toHaveBeenCalled();
    });

    it('propagates an unknown test as not found', async () => {
      testResolver.findOwnTest.mockRejectedValue(
        new DomainError('Test "my-test" not found', 'NOT_FOUND'),
      );

      await expect(
        service.approveAllPending(
          'my-project',
          'my-test',
          approvedBy,
          options(),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(
        comparisons.findPendingComparisonIdsForTest,
      ).not.toHaveBeenCalled();
    });
  });

  describe('listApprovals', () => {
    it('delegates to the audit repository scoped to project, test and branch', async () => {
      const rows = [
        {
          id: 'approval-1',
          approvedBy: 'jane.doe',
          approvedAt: new Date('2025-01-01T00:00:00Z'),
        },
      ] as never;
      approvalAudit.findForTest.mockResolvedValue(rows);

      const result = await service.listApprovals(
        'my-project',
        'my-test',
        'feature/x',
      );

      expect(approvalAudit.findForTest).toHaveBeenCalledWith({
        projectName: 'my-project',
        testName: 'my-test',
        branchName: 'feature/x',
      });
      expect(result).toBe(rows);
    });
  });

  it('keeps the pre-branch error when neither the comparison nor the test resolves', async () => {
    comparisons.findTestOfComparison.mockResolvedValue(null);
    testResolver.findTestOfKind.mockRejectedValue(
      new DomainError('Test "my-test" not found', 'NOT_FOUND'),
    );

    await expect(
      service.approveImage(
        'my-project',
        'my-test',
        'cmp-missing',
        approvedBy,
        undefined,
        options(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
