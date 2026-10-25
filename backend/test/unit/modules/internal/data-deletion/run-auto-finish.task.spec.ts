import type { Mocked } from 'vitest';
import { RunAutoFinishTask } from '@internal/data-deletion/tasks/run-auto-finish.task';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import type { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

describe('RunAutoFinishTask', () => {
  let task: RunAutoFinishTask;
  let runs: Mocked<RunRepository>;
  let logger: Mocked<AppLoggerService>;

  beforeEach(() => {
    runs = createMock<RunRepository>();
    logger = createMockLogger() as unknown as Mocked<AppLoggerService>;
    task = new RunAutoFinishTask(runs, logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finishes runs idle for more than a day', async () => {
    runs.finishIdleBefore.mockResolvedValue(2);

    const result = await task.execute();

    expect(runs.finishIdleBefore).toHaveBeenCalledWith(expect.any(Date));
    const cutoff = runs.finishIdleBefore.mock.calls[0]![0] as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(
      24 * 60 * 60 * 1000,
    );
    expect(result.counters).toEqual([
      { name: 'cleanup_runs_auto_finished', value: 2 },
    ]);
    expect(logger.log).toHaveBeenCalled();
  });

  it('does not log when no run was idle', async () => {
    runs.finishIdleBefore.mockResolvedValue(0);

    await task.execute();

    expect(logger.log).not.toHaveBeenCalled();
  });
});
