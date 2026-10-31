import type { Mocked } from 'vitest';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { IJobProducer } from '@common/domain/job-queue.interface';
import { TransactionContext } from '@/prisma/transaction-context';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { createMock } from '@test/utils/create-mock';

describe('ComparisonRetirementService', () => {
  let service: ComparisonRetirementService;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let jobQueue: Mocked<IJobProducer>;
  let txCtx: Mocked<TransactionContext>;

  const variant = Variant.fromStrings('1920x1080', 'chrome', 'staging');

  beforeEach(() => {
    comparisons = createMock<UnifiedComparisonsRepository>();
    screenshots = createMock<UnifiedScreenshotRepository>();
    jobQueue = createMock<IJobProducer>();
    txCtx = createMock<TransactionContext>();
    txCtx.assertInTransaction.mockImplementation(() => undefined);
    service = new ComparisonRetirementService(
      comparisons,
      screenshots,
      jobQueue,
      txCtx,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('transaction boundary', () => {
    it('fails loudly when a transaction-riding recipe is called outside a workflow transaction', async () => {
      txCtx.assertInTransaction.mockImplementation(() => {
        throw new Error(
          'Operation requires an active StateChangeWorkflow transaction',
        );
      });

      await expect(
        service.supersedeForVariant('test-1', variant),
      ).rejects.toThrow(/requires an active StateChangeWorkflow transaction/);
      expect(comparisons.retirePendingForVariant).not.toHaveBeenCalled();
    });
  });

  describe('supersedeForVariant (upload)', () => {
    it('retires every pending comparison, reclaims its candidates, and cancels queued jobs for the variant', async () => {
      comparisons.retirePendingForVariant.mockResolvedValue({
        staleDiffUrls: ['http://storage/stale-diff.png'],
        candidateIds: ['cand-retired'],
      });
      screenshots.deleteCandidatesAndCollectUrls.mockResolvedValue([
        'http://storage/retired-candidate.png',
      ]);

      const result = await service.supersedeForVariant('test-1', variant);

      expect(comparisons.retirePendingForVariant).toHaveBeenCalledWith(
        'test-1',
        variant,
      );
      expect(screenshots.deleteCandidatesAndCollectUrls).toHaveBeenCalledWith([
        'cand-retired',
      ]);
      expect(jobQueue.cancelPendingForVariant).toHaveBeenCalledWith(
        'test-1',
        variant.toRecord(),
      );
      expect(result).toEqual([
        'http://storage/retired-candidate.png',
        'http://storage/stale-diff.png',
      ]);
    });
  });

  describe('supersedeIdenticalForVariant (identical upload)', () => {
    it('supersedes the variant AND reclaims the CURRENT candidate row in one recipe', async () => {
      comparisons.retirePendingForVariant.mockResolvedValue({
        staleDiffUrls: ['http://storage/stale-diff.png'],
        candidateIds: ['cand-retired'],
      });
      screenshots.findCurrentByVariant.mockResolvedValue({
        id: 'cand-current',
        imageHash: 'hash',
      });
      screenshots.deleteCandidatesAndCollectUrls.mockResolvedValue([
        'http://storage/retired-candidate.png',
        'http://storage/current-candidate.png',
      ]);

      const result = await service.supersedeIdenticalForVariant(
        'test-1',
        variant,
      );

      expect(comparisons.retirePendingForVariant).toHaveBeenCalledWith(
        'test-1',
        variant,
      );
      expect(jobQueue.cancelPendingForVariant).toHaveBeenCalledWith(
        'test-1',
        variant.toRecord(),
      );
      expect(screenshots.findCurrentByVariant).toHaveBeenCalledWith(
        'test-1',
        variant,
      );
      expect(screenshots.deleteCandidatesAndCollectUrls).toHaveBeenCalledWith([
        'cand-retired',
        'cand-current',
      ]);
      expect(result).toEqual([
        'http://storage/retired-candidate.png',
        'http://storage/current-candidate.png',
        'http://storage/stale-diff.png',
      ]);
    });

    it('reclaims nothing when there is no CURRENT candidate row', async () => {
      comparisons.retirePendingForVariant.mockResolvedValue({
        staleDiffUrls: ['http://storage/stale-diff.png'],
        candidateIds: ['cand-retired'],
      });
      screenshots.findCurrentByVariant.mockResolvedValue(null);
      screenshots.deleteCandidatesAndCollectUrls.mockResolvedValue([
        'http://storage/retired-candidate.png',
      ]);

      const result = await service.supersedeIdenticalForVariant(
        'test-1',
        variant,
      );

      expect(screenshots.deleteCandidatesAndCollectUrls).toHaveBeenCalledWith([
        'cand-retired',
      ]);
      expect(result).toEqual([
        'http://storage/retired-candidate.png',
        'http://storage/stale-diff.png',
      ]);
    });
  });

  describe('retireSiblingsAndDeleteCandidate (approval)', () => {
    it('retires siblings, reclaims their candidates and the approved candidate, and cancels jobs', async () => {
      comparisons.retirePendingForVariant.mockResolvedValue({
        staleDiffUrls: ['http://storage/stale-diff.png'],
        candidateIds: ['cand-sibling'],
      });
      screenshots.deleteCandidatesAndCollectUrls.mockResolvedValue([
        'http://storage/sibling-candidate.png',
        'http://storage/approved-candidate.png',
      ]);

      const result = await service.retireSiblingsAndDeleteCandidate(
        'test-1',
        variant,
        'cand-approved',
      );

      expect(comparisons.retirePendingForVariant).toHaveBeenCalledWith(
        'test-1',
        variant,
      );
      expect(screenshots.deleteCandidatesAndCollectUrls).toHaveBeenCalledWith([
        'cand-sibling',
        'cand-approved',
      ]);
      expect(jobQueue.cancelPendingForVariant).toHaveBeenCalledWith(
        'test-1',
        variant.toRecord(),
      );
      expect(result).toEqual([
        'http://storage/sibling-candidate.png',
        'http://storage/approved-candidate.png',
        'http://storage/stale-diff.png',
      ]);
    });
  });

  describe('createPendingForVariant (worker)', () => {
    it('creates the pending comparison and retires siblings keeping the new one', async () => {
      comparisons.createPending.mockResolvedValue({ id: 'comp-1' });
      comparisons.retirePendingForVariant.mockResolvedValue({
        staleDiffUrls: ['http://storage/stale-diff.png'],
        candidateIds: [],
      });

      const result = await service.createPendingForVariant({
        testId: 'test-1',
        variant,
        baselineId: 'baseline-1',
        candidateId: 'cand-1',
        diffUrl: 'http://storage/diff.png',
        result: {
          kind: 'image',
          mismatchPixelCount: 10,
          changedRegions: [],
          diffOutput: Buffer.from('diff'),
        },
      });

      expect(comparisons.createPending).toHaveBeenCalledWith({
        testId: 'test-1',
        baselineId: 'baseline-1',
        candidateId: 'cand-1',
        diffUrl: 'http://storage/diff.png',
        result: {
          kind: 'image',
          mismatchPixelCount: 10,
          changedRegions: [],
          diffOutput: Buffer.from('diff'),
        },
      });
      expect(comparisons.retirePendingForVariant).toHaveBeenCalledWith(
        'test-1',
        variant,
        'comp-1',
      );
      expect(jobQueue.cancelPendingForVariant).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'comp-1',
        staleUrls: ['http://storage/stale-diff.png'],
      });
    });
  });

  describe('retirePendingComparisons (threshold)', () => {
    it('deletes the auto-accepted comparisons, reclaims their candidates, and cancels jobs', async () => {
      comparisons.deletePendingByIds.mockResolvedValue({
        staleDiffUrls: ['http://storage/diff.png'],
        candidateIds: ['cand-1'],
      });
      screenshots.deleteCandidatesAndCollectUrls.mockResolvedValue([
        'http://storage/candidate.png',
      ]);

      const result = await service.retirePendingComparisons('test-1', [
        'comp-1',
      ]);

      expect(comparisons.deletePendingByIds).toHaveBeenCalledWith('test-1', [
        'comp-1',
      ]);
      expect(screenshots.deleteCandidatesAndCollectUrls).toHaveBeenCalledWith([
        'cand-1',
      ]);
      expect(jobQueue.cancelPendingByCandidateIds).toHaveBeenCalledWith([
        'cand-1',
      ]);
      expect(result).toEqual([
        'http://storage/candidate.png',
        'http://storage/diff.png',
      ]);
    });

    it('cancels queued jobs before reclaiming candidates (same order as retireVariant)', async () => {
      comparisons.deletePendingByIds.mockResolvedValue({
        staleDiffUrls: [],
        candidateIds: ['cand-1'],
      });
      const order: string[] = [];
      jobQueue.cancelPendingByCandidateIds.mockImplementation(async () => {
        order.push('cancel');
        return 1;
      });
      screenshots.deleteCandidatesAndCollectUrls.mockImplementation(
        async () => {
          order.push('reclaim');
          return [];
        },
      );

      await service.retirePendingComparisons('test-1', ['comp-1']);

      expect(order).toEqual(['cancel', 'reclaim']);
    });

    it('cancels nothing and reclaims nothing when no comparisons were deleted', async () => {
      comparisons.deletePendingByIds.mockResolvedValue({
        staleDiffUrls: [],
        candidateIds: [],
      });

      await service.retirePendingComparisons('test-1', []);

      expect(screenshots.deleteCandidatesAndCollectUrls).not.toHaveBeenCalled();
      expect(jobQueue.cancelPendingByCandidateIds).toHaveBeenCalledWith([]);
    });
  });

  describe('retireComparisonsForScreenshots (variant teardown)', () => {
    it('deletes the referenced comparisons, cancels jobs for the screenshot ids, and reclaims their candidates', async () => {
      comparisons.deleteComparisonsForScreenshots.mockResolvedValue({
        staleDiffUrls: ['http://storage/stale-diff.png'],
        candidateIds: ['cand-retired'],
      });
      screenshots.deleteCandidatesAndCollectUrls.mockResolvedValue([
        'http://storage/retired-candidate.png',
      ]);

      const result = await service.retireComparisonsForScreenshots('test-1', [
        'ss-1',
        'ss-2',
      ]);

      expect(comparisons.deleteComparisonsForScreenshots).toHaveBeenCalledWith(
        'test-1',
        ['ss-1', 'ss-2'],
      );
      expect(jobQueue.cancelPendingByCandidateIds).toHaveBeenCalledWith([
        'ss-1',
        'ss-2',
      ]);
      expect(screenshots.deleteCandidatesAndCollectUrls).toHaveBeenCalledWith([
        'cand-retired',
      ]);
      expect(result).toEqual({
        staleUrls: [
          'http://storage/retired-candidate.png',
          'http://storage/stale-diff.png',
        ],
        candidateIds: ['cand-retired'],
      });
    });

    it('cancels nothing and reclaims nothing when no comparisons referenced the screenshots', async () => {
      comparisons.deleteComparisonsForScreenshots.mockResolvedValue({
        staleDiffUrls: [],
        candidateIds: [],
      });

      const result = await service.retireComparisonsForScreenshots('test-1', [
        'ss-1',
      ]);

      expect(jobQueue.cancelPendingByCandidateIds).toHaveBeenCalledWith([
        'ss-1',
      ]);
      expect(screenshots.deleteCandidatesAndCollectUrls).not.toHaveBeenCalled();
      expect(result).toEqual({ staleUrls: [], candidateIds: [] });
    });
  });
});
