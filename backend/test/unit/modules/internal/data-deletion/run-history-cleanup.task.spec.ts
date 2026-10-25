import type { Mocked } from 'vitest';
import { RunHistoryCleanupTask } from '@internal/data-deletion/tasks/run-history-cleanup.task';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import type { AppConfigService } from '@config/app-config.service';
import type { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('RunHistoryCleanupTask', () => {
  let task: RunHistoryCleanupTask;
  let runs: Mocked<RunRepository>;
  let logger: Mocked<AppLoggerService>;

  beforeEach(() => {
    runs = createMock<RunRepository>();
    logger = createMockLogger() as unknown as Mocked<AppLoggerService>;
    task = new RunHistoryCleanupTask(
      runs,
      { retention: { runHistoryDays: 365 } } as AppConfigService,
      logger,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the per-project days when set and the global default otherwise', async () => {
    runs.listRetentionProjects.mockResolvedValue([
      { id: 'p1', runHistoryDays: 7 },
      { id: 'p2', runHistoryDays: null },
    ]);
    runs.deleteFinishedBefore.mockResolvedValue(2);

    const result = await task.execute();

    expect(runs.deleteFinishedBefore).toHaveBeenCalledTimes(2);
    const firstCutoff = runs.deleteFinishedBefore.mock.calls[0]![1] as Date;
    const secondCutoff = runs.deleteFinishedBefore.mock.calls[1]![1] as Date;
    expect(Date.now() - firstCutoff.getTime()).toBeGreaterThan(6 * 86_400_000);
    expect(Date.now() - secondCutoff.getTime()).toBeGreaterThan(
      364 * 86_400_000,
    );
    expect(result.counters).toEqual([
      { name: 'cleanup_runs_retained_total', value: 4 },
    ]);
  });
});
