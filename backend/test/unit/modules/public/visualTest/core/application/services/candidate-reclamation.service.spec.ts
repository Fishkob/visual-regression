import { CandidateReclamationService } from '@public/visualTest/core/application/services/candidate-reclamation.service';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { createMock } from '@test/utils/create-mock';

describe('CandidateReclamationService', () => {
  let service: CandidateReclamationService;
  let screenshots: jest.Mocked<UnifiedScreenshotRepository>;
  let workflow: jest.Mocked<StateChangeWorkflow>;

  beforeEach(() => {
    screenshots = createMock<UnifiedScreenshotRepository>();
    workflow = createMock<StateChangeWorkflow>();
    workflow.executeStateChange.mockImplementation(
      async (fn: () => Promise<unknown>) => fn() as Promise<never>,
    );
    service = new CandidateReclamationService(screenshots, workflow);
  });

  describe('reclaimCandidateInChange (single-candidate worker reclamation)', () => {
    it('reclaims through the guarded owner and reports a change when a candidate was deleted', async () => {
      screenshots.deleteCandidatesAndCollectUrls.mockResolvedValue([
        'http://storage/candidate.png',
      ]);

      const result = await service.reclaimCandidateInChange({
        testId: 'test-1',
        candidateId: 'cand-1',
      });

      expect(workflow.executeStateChange).toHaveBeenCalled();
      expect(screenshots.deleteCandidatesAndCollectUrls).toHaveBeenCalledWith([
        'cand-1',
      ]);
      expect(result).toEqual(
        expect.objectContaining({
          kind: 'change',
          affectedTestIds: ['test-1'],
          staleUrls: ['http://storage/candidate.png'],
        }),
      );
    });

    it('guards the delete by the expected content URL via deleteCandidateIfCurrent', async () => {
      screenshots.deleteCandidateIfCurrent.mockResolvedValue([
        'http://storage/candidate.png',
      ]);

      const result = await service.reclaimCandidateInChange({
        testId: 'test-1',
        candidateId: 'cand-1',
        expectedUrl: 'http://storage/candidate.png',
      });

      expect(screenshots.deleteCandidateIfCurrent).toHaveBeenCalledWith(
        'cand-1',
        'http://storage/candidate.png',
      );
      expect(screenshots.deleteCandidatesAndCollectUrls).not.toHaveBeenCalled();
      expect(result.kind).toBe('change');
    });

    it('reports a noop when nothing was reclaimed and no events are emitted', async () => {
      screenshots.deleteCandidateIfCurrent.mockResolvedValue([]);

      const result = await service.reclaimCandidateInChange({
        testId: 'test-1',
        candidateId: 'cand-1',
        expectedUrl: 'http://storage/candidate.png',
      });

      expect(result).toEqual({ kind: 'noop' });
    });

    it('reports a change carrying the events even when no rows were reclaimed', async () => {
      screenshots.deleteCandidatesAndCollectUrls.mockResolvedValue([]);

      const result = await service.reclaimCandidateInChange({
        testId: 'test-1',
        candidateId: 'cand-1',
        events: [
          {
            kind: 'comparison_completed',
            testKind: 'image',
            visualTestId: 'test-1',
            comparisonId: undefined,
            newStatus: 'UNCHANGED',
            diffMetric: 0,
          },
        ],
      });

      expect(result).toEqual(
        expect.objectContaining({
          kind: 'change',
          affectedTestIds: ['test-1'],
          events: [expect.objectContaining({ kind: 'comparison_completed' })],
        }),
      );
    });

    it('resolves the candidate in-transaction via resolveCandidate when provided', async () => {
      screenshots.deleteCandidatesAndCollectUrls.mockResolvedValue([]);
      const resolveCandidate = jest.fn().mockResolvedValue({ id: 'cand-live' });

      await service.reclaimCandidateInChange({
        testId: 'test-1',
        events: [],
        resolveCandidate,
      });

      expect(resolveCandidate).toHaveBeenCalled();
      expect(screenshots.deleteCandidatesAndCollectUrls).toHaveBeenCalledWith([
        'cand-live',
      ]);
    });
  });
});
