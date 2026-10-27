import type { Mocked } from 'vitest';
import { DomainError } from '@common/domain/domain-error';
import { TrendsService } from '@public/visualTest/runs/application/trends.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ComparisonOutcomeService } from '@public/visualTest/core/application/services/comparison-outcome.service';
import { createMock } from '@test/utils/create-mock';
import { createMockProjectRepository } from '@test/utils/mocks';

function missingProject(name: string): DomainError {
  return new DomainError(`Project "${name}" not found`, 'NOT_FOUND');
}

describe('TrendsService', () => {
  let service: TrendsService;
  let outcomes: Mocked<ComparisonOutcomeService>;
  let projects: Mocked<ProjectRepository>;

  const trends = {
    daily: [
      { date: '2026-01-01', changed: 1, unchanged: 2, withinThreshold: 0 },
    ],
    pendingReview: { count: 1, avgSeconds: 60, maxSeconds: 120 },
    approvalLatency: { count: 2, avgSeconds: 30 },
    flakeRate: { flakyTests: 1, totalTests: 4, rate: 0.25 },
  };

  beforeEach(() => {
    outcomes = createMock<ComparisonOutcomeService>();
    outcomes.trends.mockResolvedValue(trends);
    projects = createMockProjectRepository();
    projects.findByName.mockResolvedValue({ id: 'p-1', name: 'shop' } as never);
    service = new TrendsService(outcomes, projects);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the trend window with its date bounds', async () => {
    const result = await service.get('shop', 30);

    expect(result).toEqual(
      expect.objectContaining({
        days: 30,
        daily: trends.daily,
        flakeRate: trends.flakeRate,
      }),
    );
    expect(result.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(outcomes.trends).toHaveBeenCalledWith('shop', 30, expect.any(Date));
  });

  it('clamps the window to 1..365 days', async () => {
    await service.get('shop', 0);
    expect(outcomes.trends).toHaveBeenLastCalledWith(
      'shop',
      1,
      expect.any(Date),
    );

    await service.get('shop', 1000);
    expect(outcomes.trends).toHaveBeenLastCalledWith(
      'shop',
      365,
      expect.any(Date),
    );
  });

  it('rejects an unknown project', async () => {
    projects.requireByName.mockRejectedValue(missingProject('missing'));

    await expect(service.get('missing')).rejects.toBeInstanceOf(DomainError);
    expect(outcomes.trends).not.toHaveBeenCalled();
  });
});
