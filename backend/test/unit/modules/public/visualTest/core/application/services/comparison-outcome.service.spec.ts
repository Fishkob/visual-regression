import type { Mocked } from 'vitest';
import { ComparisonOutcomeService } from '@public/visualTest/core/application/services/comparison-outcome.service';
import { ComparisonOutcomeRepository } from '@public/visualTest/core/infrastructure/repositories/comparison-outcome.repository';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';

describe('ComparisonOutcomeService', () => {
  let service: ComparisonOutcomeService;
  let repository: Mocked<ComparisonOutcomeRepository>;
  let logger: Mocked<AppLoggerService>;

  beforeEach(() => {
    repository = createMock<ComparisonOutcomeRepository>();
    logger = createMock<AppLoggerService>();
    service = new ComparisonOutcomeService(repository, logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records an outcome entry with its project', async () => {
    const entry = {
      projectName: 'shop',
      testId: 't-1',
      testName: 'checkout',
      kind: 'image' as const,
      viewport: '1920x1080',
      browser: 'chrome',
      environment: 'staging',
      outcome: 'changed' as const,
      mismatchMetric: 10,
    };

    await service.record(entry);

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'shop', testId: 't-1' }),
    );
  });

  it('swallows and logs a failed write instead of failing the job', async () => {
    repository.record.mockRejectedValue(new Error('analytics table is gone'));

    // A report, not the work: the comparison has already committed, so the job
    // must not be failed by its analytics row.
    await expect(
      service.record({
        projectName: 'shop',
        testId: 't-1',
        testName: 'checkout',
        kind: 'image' as const,
        viewport: '1920x1080',
        browser: 'chrome',
        environment: 'staging',
        outcome: 'unchanged' as const,
        mismatchMetric: 0,
      }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      'Dropped a comparison outcome row',
      expect.objectContaining({ testId: 't-1', outcome: 'unchanged' }),
    );
  });

  it('derives the trend window from the requested days', async () => {
    const now = new Date('2026-01-31T12:00:00Z');
    repository.trends.mockResolvedValue({
      daily: [],
      pendingReview: { count: 0, avgSeconds: 0, maxSeconds: 0 },
      approvalLatency: { count: 0, avgSeconds: 0 },
      flakeRate: { flakyTests: 0, totalTests: 0, rate: 0 },
      reviewReasons: {
        intendedChange: 0,
        flake: 0,
        infra: 0,
        noReason: 0,
        withReason: 0,
        knownNoise: 0,
        knownNoiseRate: 0,
      },
    });

    await service.trends('shop', 7, now);

    expect(repository.trends).toHaveBeenCalledWith(
      'shop',
      new Date('2026-01-24T12:00:00Z'),
    );
  });
});
