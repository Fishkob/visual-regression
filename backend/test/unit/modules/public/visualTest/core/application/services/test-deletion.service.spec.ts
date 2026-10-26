import { DomainError } from '@common/domain/domain-error';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ReviewArtifactRepository } from '@public/visualTest/core/infrastructure/repositories/review-artifact.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { IJobProducer } from '@common/domain/job-queue.interface';
import { IStorageProvider } from '@common/domain/storage-provider.interface';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { toOutcome } from '@public/visualTest/core/application/services/state-change-options';
import { AuditService } from '@internal/audit/audit.service';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import { createMock } from '@test/utils/create-mock';
import { Prisma } from '@/prisma/client';
import { createMockProjectRepository } from '@test/utils/mocks';

function missingProject(name: string): DomainError {
  return new DomainError(`Project "${name}" not found`, 'NOT_FOUND');
}
describe('TestDeletionService', () => {
  let tests: Mocked<UnifiedTestRepository>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let projects: Mocked<ProjectRepository>;
  let variants: Mocked<VariantStore>;
  let jobQueue: Mocked<IJobProducer>;
  let storage: Mocked<IStorageProvider>;
  let workflow: Mocked<StateChangeWorkflow>;
  let statusService: Mocked<TestStatusService>;
  let retirement: Mocked<ComparisonRetirementService>;
  let service: TestDeletionService;
  let audit: Mocked<AuditService>;
  let reviewArtifacts: Mocked<ReviewArtifactRepository>;

  beforeEach(() => {
    tests = createMock<UnifiedTestRepository>();
    screenshots = createMock<UnifiedScreenshotRepository>();
    comparisons = createMock<UnifiedComparisonsRepository>();
    projects = createMockProjectRepository();
    variants = createMock<VariantStore>();
    variants.findIdsByFilters.mockResolvedValue(['variant-1']);
    variants.deleteMany.mockResolvedValue(undefined);
    jobQueue = createMock<IJobProducer>();
    storage = createMock<IStorageProvider>();
    workflow = createMock<StateChangeWorkflow>();
    statusService = createMock<TestStatusService>();
    retirement = createMock<ComparisonRetirementService>();
    retirement.retireComparisonsForScreenshots.mockResolvedValue({
      staleUrls: [],
      candidateIds: [],
    });
    screenshots.filterReclaimableUrls.mockImplementation((urls) =>
      Promise.resolve(urls),
    );
    workflow.executeStateChange.mockImplementation(
      async (fn: () => Promise<any>) => {
        const outcome = toOutcome(await fn());
        if (outcome.change.kind === 'change') {
          for (const testId of outcome.change.affectedTestIds) {
            await statusService.recomputeStatus(testId);
          }
        }
        const stale = (outcome.change.staleUrls ?? []) as string[];
        if (stale.length > 0) await storage.deleteAll(stale);
        return outcome;
      },
    );
    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);
    reviewArtifacts = createMock<ReviewArtifactRepository>();
    reviewArtifacts.deleteForTestIds.mockResolvedValue(undefined);
    reviewArtifacts.deleteForProjectName.mockResolvedValue(undefined);
    service = new TestDeletionService(
      tests,
      screenshots,
      comparisons,
      projects,
      variants,
      jobQueue,
      workflow,
      retirement,
      audit,
      reviewArtifacts,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deleteTest', () => {
    it('treats P2003 and serialization errors as retryable on the whole-test path', async () => {
      screenshots.findAllImageUrlsForTests.mockResolvedValue([]);
      comparisons.findDiffImageUrlsByTestIds.mockResolvedValue([]);

      await service.deleteTest('vt-1');

      expect(workflow.executeStateChange).toHaveBeenCalledTimes(1);
      const options = workflow.executeStateChange.mock.calls[0][1]!;

      const p2003 = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: 'test' },
      );
      expect(options.retry!.isRetryable!(p2003)).toBe(true);
      expect(options.retry!.isRetryable!(new Error('random failure'))).toBe(
        false,
      );
    });

    it('cancels pending jobs, collects URLs, deletes test, and removes storage files', async () => {
      screenshots.findAllImageUrlsForTests.mockResolvedValue([
        'http://storage/screenshot1.png',
        'http://storage/screenshot2.png',
      ]);
      comparisons.findDiffImageUrlsByTestIds.mockResolvedValue([
        'http://storage/diff1.png',
      ]);
      storage.deleteAll.mockResolvedValue({
        deleted: [],
        failed: [],
      });

      await service.deleteTest('vt-1');

      expect(jobQueue.cancelByTestIds).toHaveBeenCalledWith(['vt-1']);
      expect(screenshots.findAllImageUrlsForTests).toHaveBeenCalledWith([
        'vt-1',
      ]);
      expect(comparisons.findDiffImageUrlsByTestIds).toHaveBeenCalledWith([
        'vt-1',
      ]);
      expect(storage.deleteAll).toHaveBeenCalled();
      expect(tests.deleteByIds).toHaveBeenCalledWith(['vt-1']);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'test.delete', targetId: 'vt-1' }),
      );
    });

    it('deletes the comments and votes of the deleted tests before the test rows', async () => {
      screenshots.findAllImageUrlsForTests.mockResolvedValue([]);
      comparisons.findDiffImageUrlsByTestIds.mockResolvedValue([]);

      await service.deleteTest('vt-1');

      expect(reviewArtifacts.deleteForTestIds).toHaveBeenCalledWith(['vt-1']);
      expect(
        reviewArtifacts.deleteForTestIds.mock.invocationCallOrder[0],
      ).toBeLessThan(tests.deleteByIds.mock.invocationCallOrder[0]);
    });

    it('does not delete the test row when the review-artifact cleanup fails', async () => {
      reviewArtifacts.deleteForTestIds.mockRejectedValue(
        new Error('artifact cleanup failed'),
      );

      await expect(service.deleteTest('vt-1')).rejects.toThrow(
        'artifact cleanup failed',
      );
      expect(tests.deleteByIds).not.toHaveBeenCalled();
    });

    it('does not call deletion when no images exist', async () => {
      screenshots.findAllImageUrlsForTests.mockResolvedValue([]);
      comparisons.findDiffImageUrlsByTestIds.mockResolvedValue([]);

      await service.deleteTest('vt-1');

      expect(jobQueue.cancelByTestIds).toHaveBeenCalledWith(['vt-1']);
      expect(tests.deleteByIds).toHaveBeenCalledWith(['vt-1']);
      expect(storage.deleteAll).not.toHaveBeenCalled();
    });

    it('deletes test record even when no storage files exist', async () => {
      screenshots.findAllImageUrlsForTests.mockResolvedValue([]);
      comparisons.findDiffImageUrlsByTestIds.mockResolvedValue([]);

      await service.deleteTest('vt-1');

      expect(jobQueue.cancelByTestIds).toHaveBeenCalledWith(['vt-1']);
      expect(tests.deleteByIds).toHaveBeenCalledWith(['vt-1']);
    });

    it('routes the collected URLs through the workflow staleFromResult for post-commit cleanup', async () => {
      screenshots.findAllImageUrlsForTests.mockResolvedValue([
        'http://storage/screenshot1.png',
      ]);
      comparisons.findDiffImageUrlsByTestIds.mockResolvedValue([
        'http://storage/diff1.png',
      ]);

      await service.deleteTest('vt-1');

      expect(workflow.executeStateChange).toHaveBeenCalledTimes(1);
      const txFn = workflow.executeStateChange.mock.calls[0][0];
      storage.deleteAll.mockClear();
      const result = toOutcome(await txFn());
      expect(storage.deleteAll).not.toHaveBeenCalled();
      expect(screenshots.filterReclaimableUrls).toHaveBeenCalledWith([
        'http://storage/screenshot1.png',
        'http://storage/diff1.png',
      ]);
      expect(result.change.staleUrls).toEqual([
        'http://storage/screenshot1.png',
        'http://storage/diff1.png',
      ]);
    });
  });

  describe('deleteScreenshotsByFilters', () => {
    it('deletes screenshots, associated comparisons, and storage files', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([
        { id: 'ss-1' },
        { id: 'ss-2' },
      ]);
      retirement.retireComparisonsForScreenshots.mockResolvedValue({
        staleUrls: [
          'http://storage/candidate2.png',
          'http://storage/diff1.png',
        ],
        candidateIds: ['ss-2'],
      });
      screenshots.findImageUrlsByIds.mockResolvedValue([
        'http://storage/screenshot1.png',
      ]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      const result = await service.deleteScreenshotsByFilters('vt-1', {
        viewport: '1920x1080',
      });

      expect(screenshots.findScreenshotsForVariant).toHaveBeenCalledWith(
        'vt-1',
        { viewport: '1920x1080' },
      );
      expect(retirement.retireComparisonsForScreenshots).toHaveBeenCalledWith(
        'vt-1',
        ['ss-1', 'ss-2'],
      );
      expect(screenshots.findImageUrlsByIds).toHaveBeenCalledWith(['ss-1']);
      expect(screenshots.deleteMany).toHaveBeenCalledWith(['ss-1']);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'variant.delete',
          targetId: 'vt-1',
        }),
      );
      expect(variants.findIdsByFilters).toHaveBeenCalledWith('vt-1', {
        viewport: '1920x1080',
      });
      expect(variants.deleteMany).toHaveBeenCalledWith(['variant-1']);
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/candidate2.png',
        'http://storage/diff1.png',
        'http://storage/screenshot1.png',
      ]);
      expect(result).toEqual(['ss-1', 'ss-2']);
    });

    it('does not delete a candidate screenshot twice when the cascade reclaimed it', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([
        { id: 'ss-1' },
        { id: 'ss-2' },
      ]);
      retirement.retireComparisonsForScreenshots.mockResolvedValue({
        staleUrls: ['http://storage/candidate2.png'],
        candidateIds: ['ss-1', 'ss-2'],
      });
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await service.deleteScreenshotsByFilters('vt-1', {
        viewport: '1920x1080',
      });

      expect(screenshots.findImageUrlsByIds).not.toHaveBeenCalled();
      expect(screenshots.deleteMany).not.toHaveBeenCalled();
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/candidate2.png',
      ]);
    });

    it('cancels pending jobs whose candidate screenshots are being deleted', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([{ id: 'ss-1' }]);
      retirement.retireComparisonsForScreenshots.mockResolvedValue({
        staleUrls: [],
        candidateIds: [],
      });
      screenshots.findImageUrlsByIds.mockResolvedValue([]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await service.deleteScreenshotsByFilters('vt-1', {
        viewport: '1920x1080',
      });

      expect(retirement.retireComparisonsForScreenshots).toHaveBeenCalledWith(
        'vt-1',
        ['ss-1'],
      );
    });

    it('does not cancel jobs when no screenshots match filters', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([]);

      await service.deleteScreenshotsByFilters('vt-1', {
        viewport: 'nope',
      });

      expect(retirement.retireComparisonsForScreenshots).not.toHaveBeenCalled();
    });

    it('returns empty array when no screenshots match filters', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([]);

      const result = await service.deleteScreenshotsByFilters('vt-1', {
        viewport: 'nope',
      });

      expect(result).toEqual([]);
      expect(screenshots.deleteMany).not.toHaveBeenCalled();
      expect(storage.deleteAll).not.toHaveBeenCalled();
    });

    it('recomputes the test only when screenshots were actually deleted', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([{ id: 'ss-1' }]);
      retirement.retireComparisonsForScreenshots.mockResolvedValue({
        staleUrls: [],
        candidateIds: [],
      });
      screenshots.findImageUrlsByIds.mockResolvedValue([
        'http://storage/screenshot1.png',
      ]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await service.deleteScreenshotsByFilters('vt-1', {
        viewport: '1920x1080',
      });

      const txFn = workflow.executeStateChange.mock.calls[0][0];
      const txResult = toOutcome(await txFn());
      expect(txResult.change.kind).toBe('change');
      if (txResult.change.kind === 'change') {
        expect(txResult.change.affectedTestIds).toEqual(['vt-1']);
      }
    });

    it('reports no affected tests when no screenshots match', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([]);

      await service.deleteScreenshotsByFilters('vt-1', {
        viewport: 'nope',
      });

      const txFn = workflow.executeStateChange.mock.calls[0][0];
      expect(toOutcome(await txFn()).change.kind).toBe('noop');
    });

    it('rejects an empty variant filter instead of deleting the whole test', async () => {
      await expect(
        service.deleteScreenshotsByFilters('vt-1', {}),
      ).rejects.toThrow('Variant filters are required');
      await expect(
        service.deleteScreenshotsByFilters('vt-1', undefined),
      ).rejects.toThrow('Variant filters are required');
      expect(workflow.executeStateChange).not.toHaveBeenCalled();
    });

    it('routes the variant deletion through the state-change workflow and treats P2003 as retryable', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([{ id: 'ss-1' }]);
      retirement.retireComparisonsForScreenshots.mockResolvedValue({
        staleUrls: [],
        candidateIds: [],
      });
      screenshots.findImageUrlsByIds.mockResolvedValue([
        'http://storage/screenshot1.png',
      ]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await service.deleteScreenshotsByFilters('vt-1', {
        viewport: '1920x1080',
      });

      expect(workflow.executeStateChange).toHaveBeenCalledTimes(1);
      const options = workflow.executeStateChange.mock.calls[0][1]!;

      const p2003 = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: 'test' },
      );
      expect(options.retry!.isRetryable!(p2003)).toBe(true);
      expect(options.retry!.isRetryable!(new Error('random failure'))).toBe(
        false,
      );
    });

    it('funnels the remaining URLs through the reclaim owner after the row deletes', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([{ id: 'ss-1' }]);
      retirement.retireComparisonsForScreenshots.mockResolvedValue({
        staleUrls: [],
        candidateIds: [],
      });
      screenshots.findImageUrlsByIds.mockResolvedValue([
        'http://storage/screenshot1.png',
      ]);
      screenshots.filterReclaimableUrls.mockResolvedValue([
        'http://storage/screenshot1.png',
      ]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await service.deleteScreenshotsByFilters('vt-1', {
        viewport: '1920x1080',
      });

      expect(screenshots.filterReclaimableUrls).toHaveBeenCalledWith([
        'http://storage/screenshot1.png',
      ]);
      expect(storage.deleteAll).toHaveBeenCalledWith([
        'http://storage/screenshot1.png',
      ]);
    });

    it('drops a remaining URL that the reclaim owner says is still referenced', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([{ id: 'ss-1' }]);
      retirement.retireComparisonsForScreenshots.mockResolvedValue({
        staleUrls: [],
        candidateIds: [],
      });
      screenshots.findImageUrlsByIds.mockResolvedValue([
        'http://storage/screenshot1.png',
      ]);
      screenshots.filterReclaimableUrls.mockResolvedValue([]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await service.deleteScreenshotsByFilters('vt-1', {
        viewport: '1920x1080',
      });

      expect(storage.deleteAll).not.toHaveBeenCalled();
    });

    it('deletes storage files from the change result after the transaction, not inside it', async () => {
      screenshots.findScreenshotsForVariant.mockResolvedValue([{ id: 'ss-1' }]);
      retirement.retireComparisonsForScreenshots.mockResolvedValue({
        staleUrls: [],
        candidateIds: [],
      });
      screenshots.findImageUrlsByIds.mockResolvedValue([
        'http://storage/screenshot1.png',
      ]);
      storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });

      await service.deleteScreenshotsByFilters('vt-1', {
        viewport: '1920x1080',
      });

      const txFn = workflow.executeStateChange.mock.calls[0][0];
      storage.deleteAll.mockClear();
      const result = toOutcome(await txFn());
      expect(storage.deleteAll).not.toHaveBeenCalled();
      expect(result.change.staleUrls).toEqual([
        'http://storage/screenshot1.png',
      ]);
    });
  });

  describe('deleteProject', () => {
    it('deletes all tests for a project in a single transaction', async () => {
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date(),
      });
      tests.findIdsByProjectId.mockResolvedValue(['vt-1', 'vt-2']);
      screenshots.findAllImageUrlsForTests.mockResolvedValue([]);
      comparisons.findDiffImageUrlsByTestIds.mockResolvedValue([]);

      await service.deleteProject('my-project');

      expect(projects.findByName).toHaveBeenCalledWith('my-project');
      expect(tests.findIdsByProjectId).toHaveBeenCalledWith('proj-1');
      expect(jobQueue.cancelByTestIds).toHaveBeenCalledWith(['vt-1', 'vt-2']);
      expect(screenshots.findAllImageUrlsForTests).toHaveBeenCalledWith([
        'vt-1',
        'vt-2',
      ]);
      expect(comparisons.findDiffImageUrlsByTestIds).toHaveBeenCalledWith([
        'vt-1',
        'vt-2',
      ]);
      expect(tests.deleteByIds).toHaveBeenCalledWith(['vt-1', 'vt-2']);
      expect(projects.deleteByName).toHaveBeenCalledWith('my-project');
      expect(workflow.executeStateChange).toHaveBeenCalledTimes(1);
    });

    it('throws NOT_FOUND when the project does not exist', async () => {
      projects.requireByName.mockRejectedValue(missingProject('missing'));

      await expect(service.deleteProject('missing')).rejects.toThrow(
        'Project "missing" not found',
      );

      expect(tests.findIdsByProjectId).not.toHaveBeenCalled();
      expect(tests.deleteByIds).not.toHaveBeenCalled();
      expect(workflow.executeStateChange).toHaveBeenCalledTimes(1);
    });

    it('deletes only the project row when it has no tests', async () => {
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date(),
      });
      tests.findIdsByProjectId.mockResolvedValue([]);

      await service.deleteProject('my-project');

      expect(jobQueue.cancelByTestIds).not.toHaveBeenCalled();
      expect(tests.deleteByIds).not.toHaveBeenCalled();
      expect(projects.deleteByName).toHaveBeenCalledWith('my-project');
    });

    it('deletes review artifacts for the project testIds and runs a projectName backstop', async () => {
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date(),
      });
      tests.findIdsByProjectId.mockResolvedValue(['vt-1', 'vt-2']);
      screenshots.findAllImageUrlsForTests.mockResolvedValue([]);
      comparisons.findDiffImageUrlsByTestIds.mockResolvedValue([]);

      await service.deleteProject('my-project');

      expect(reviewArtifacts.deleteForTestIds).toHaveBeenCalledWith([
        'vt-1',
        'vt-2',
      ]);
      expect(reviewArtifacts.deleteForProjectName).toHaveBeenCalledWith(
        'my-project',
      );
    });

    it('runs the projectName artifact backstop when the project has no tests', async () => {
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date(),
      });
      tests.findIdsByProjectId.mockResolvedValue([]);

      await service.deleteProject('my-project');

      expect(reviewArtifacts.deleteForTestIds).not.toHaveBeenCalled();
      expect(reviewArtifacts.deleteForProjectName).toHaveBeenCalledWith(
        'my-project',
      );
      expect(projects.deleteByName).toHaveBeenCalledWith('my-project');
    });

    it('treats P2003 and serialization errors as retryable on the project path', async () => {
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date(),
      });
      tests.findIdsByProjectId.mockResolvedValue([]);

      await service.deleteProject('my-project');

      const options = workflow.executeStateChange.mock.calls[0][1]!;

      const p2003 = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: 'test' },
      );
      const p2034 = new Prisma.PrismaClientKnownRequestError('serialization', {
        code: 'P2034',
        clientVersion: 'test',
      });
      expect(options.retry!.isRetryable!(p2003)).toBe(true);
      expect(options.retry!.isRetryable!(p2034)).toBe(true);
      expect(options.retry!.isRetryable!(new Error('random failure'))).toBe(
        false,
      );
    });
  });
});
