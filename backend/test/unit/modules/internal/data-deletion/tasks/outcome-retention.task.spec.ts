import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppConfigService } from '@config/app-config.service';
import { OutcomeRetentionTask } from '@internal/data-deletion/tasks/outcome-retention.task';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { createMock } from '@test/utils/create-mock';

describe('OutcomeRetentionTask', () => {
  let task: OutcomeRetentionTask;
  let mockClient: {
    comparisonOutcomeEvent: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const BATCH_SIZE = 10_000;
  const MAX_BATCHES_PER_RUN = 100;

  function ids(count: number): { id: string }[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `outcome-${index}`,
    }));
  }

  async function createTask(retentionDays: number) {
    mockClient = {
      comparisonOutcomeEvent: { findMany: vi.fn(), deleteMany: vi.fn() },
    };
    mockClient.comparisonOutcomeEvent.findMany.mockResolvedValue([]);
    mockClient.comparisonOutcomeEvent.deleteMany.mockResolvedValue({
      count: 0,
    });

    const connection = createMock<PrismaConnection>();
    Object.defineProperty(connection, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutcomeRetentionTask,
        { provide: PrismaConnection, useValue: connection },
        {
          provide: AppConfigService,
          useValue: { outcomeRetention: { days: retentionDays } },
        },
      ],
    }).compile();

    task = module.get(OutcomeRetentionTask);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes outcomes recorded before the retention window', async () => {
    await createTask(400);
    mockClient.comparisonOutcomeEvent.findMany.mockResolvedValue(ids(2));
    mockClient.comparisonOutcomeEvent.deleteMany.mockResolvedValue({
      count: 2,
    });

    const result = await task.execute();

    const { where } =
      mockClient.comparisonOutcomeEvent.findMany.mock.calls[0][0];
    expect(where.createdAt.lt).toBeInstanceOf(Date);
    const ageDays =
      (Date.now() - (where.createdAt.lt as Date).getTime()) / DAY_MS;
    expect(ageDays).toBeCloseTo(400, 1);
    expect(mockClient.comparisonOutcomeEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['outcome-0', 'outcome-1'] } },
    });
    expect(result.gauges).toEqual(
      expect.arrayContaining([{ name: 'cleanup_outcomes_deleted', value: 2 }]),
    );
  });

  it('keeps the whole history when the window is disabled', async () => {
    await createTask(0);

    const result = await task.execute();

    expect(mockClient.comparisonOutcomeEvent.findMany).not.toHaveBeenCalled();
    expect(mockClient.comparisonOutcomeEvent.deleteMany).not.toHaveBeenCalled();
    expect(result.gauges).toBeUndefined();
  });

  it('does nothing when nothing is older than the window', async () => {
    await createTask(400);

    const result = await task.execute();

    expect(mockClient.comparisonOutcomeEvent.findMany).toHaveBeenCalledTimes(1);
    expect(mockClient.comparisonOutcomeEvent.deleteMany).not.toHaveBeenCalled();
    expect(result.gauges).toEqual(
      expect.arrayContaining([{ name: 'cleanup_outcomes_deleted', value: 0 }]),
    );
  });

  it('sweeps a backlog larger than one batch in batches', async () => {
    await createTask(400);
    mockClient.comparisonOutcomeEvent.findMany
      .mockResolvedValueOnce(ids(BATCH_SIZE))
      .mockResolvedValueOnce(ids(3));
    mockClient.comparisonOutcomeEvent.deleteMany
      .mockResolvedValueOnce({ count: BATCH_SIZE })
      .mockResolvedValueOnce({ count: 3 });

    const result = await task.execute();

    expect(mockClient.comparisonOutcomeEvent.findMany).toHaveBeenCalledTimes(2);
    expect(mockClient.comparisonOutcomeEvent.deleteMany).toHaveBeenCalledTimes(
      2,
    );
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        { name: 'cleanup_outcomes_deleted', value: BATCH_SIZE + 3 },
      ]),
    );
  });

  it('stops at the per-run ceiling and leaves the rest for the next run', async () => {
    await createTask(400);
    mockClient.comparisonOutcomeEvent.findMany.mockResolvedValue(
      ids(BATCH_SIZE),
    );
    mockClient.comparisonOutcomeEvent.deleteMany.mockResolvedValue({
      count: BATCH_SIZE,
    });

    const result = await task.execute();

    expect(mockClient.comparisonOutcomeEvent.findMany).toHaveBeenCalledTimes(
      MAX_BATCHES_PER_RUN,
    );
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        {
          name: 'cleanup_outcomes_deleted',
          value: BATCH_SIZE * MAX_BATCHES_PER_RUN,
        },
      ]),
    );
  });

  it('runs under its own maintenance lock', async () => {
    await createTask(400);

    expect(task.lockId).toBe(MAINTENANCE_LOCK_IDS.outcomeRetention);
  });
});
