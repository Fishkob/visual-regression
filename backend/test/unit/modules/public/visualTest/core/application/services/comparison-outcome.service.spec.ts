import type { Mocked } from 'vitest';
import { ComparisonOutcomeService } from '@public/visualTest/core/application/services/comparison-outcome.service';
import { ComparisonOutcomeRepository } from '@public/visualTest/core/infrastructure/repositories/comparison-outcome.repository';
import { createMock } from '@test/utils/create-mock';

describe('ComparisonOutcomeService', () => {
  let service: ComparisonOutcomeService;
  let repository: Mocked<ComparisonOutcomeRepository>;

  beforeEach(() => {
    repository = createMock<ComparisonOutcomeRepository>();
    service = new ComparisonOutcomeService(repository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records an outcome entry', async () => {
    const entry = {
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

    expect(repository.record).toHaveBeenCalledWith(entry);
  });

  it('derives the trend window from the requested days', async () => {
    const now = new Date('2026-01-31T12:00:00Z');
    repository.trends.mockResolvedValue({
      daily: [],
      pendingReview: { count: 0, avgSeconds: 0, maxSeconds: 0 },
      approvalLatency: { count: 0, avgSeconds: 0 },
      flakeRate: { flakyTests: 0, totalTests: 0, rate: 0 },
    });

    await service.trends('shop', 7, now);

    expect(repository.trends).toHaveBeenCalledWith(
      'shop',
      new Date('2026-01-24T12:00:00Z'),
    );
  });
});
