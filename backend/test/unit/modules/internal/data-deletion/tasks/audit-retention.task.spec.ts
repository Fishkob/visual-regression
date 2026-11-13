import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppConfigService } from '@config/app-config.service';
import { AuditRetentionTask } from '@internal/data-deletion/tasks/audit-retention.task';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { createMock } from '@test/utils/create-mock';

describe('AuditRetentionTask', () => {
  let task: AuditRetentionTask;
  let mockClient: {
    auditEvent: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const BATCH_SIZE = 10_000;
  const MAX_BATCHES_PER_RUN = 100;

  function ids(count: number): { id: string }[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `event-${index}`,
    }));
  }

  async function createTask(retentionDays: number) {
    mockClient = {
      auditEvent: { findMany: vi.fn(), deleteMany: vi.fn() },
    };
    mockClient.auditEvent.findMany.mockResolvedValue([]);
    mockClient.auditEvent.deleteMany.mockResolvedValue({ count: 0 });

    const connection = createMock<PrismaConnection>();
    Object.defineProperty(connection, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditRetentionTask,
        { provide: PrismaConnection, useValue: connection },
        {
          provide: AppConfigService,
          useValue: { auditRetention: { days: retentionDays } },
        },
      ],
    }).compile();

    task = module.get(AuditRetentionTask);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes rows older than the retention window', async () => {
    await createTask(90);
    mockClient.auditEvent.findMany.mockResolvedValue(ids(2));
    mockClient.auditEvent.deleteMany.mockResolvedValue({ count: 2 });

    const result = await task.execute();

    const { where } = mockClient.auditEvent.findMany.mock.calls[0][0];
    expect(where.createdAt.lt).toBeInstanceOf(Date);
    const ageDays =
      (Date.now() - (where.createdAt.lt as Date).getTime()) / DAY_MS;
    expect(ageDays).toBeCloseTo(90, 1);
    expect(mockClient.auditEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['event-0', 'event-1'] } },
    });
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        { name: 'cleanup_audit_events_deleted', value: 2 },
      ]),
    );
  });

  it('deletes nothing when the window is disabled', async () => {
    await createTask(0);

    const result = await task.execute();

    expect(mockClient.auditEvent.findMany).not.toHaveBeenCalled();
    expect(mockClient.auditEvent.deleteMany).not.toHaveBeenCalled();
    expect(result.gauges).toBeUndefined();
  });

  it('does nothing when nothing is older than the window', async () => {
    await createTask(90);

    const result = await task.execute();

    expect(mockClient.auditEvent.findMany).toHaveBeenCalledTimes(1);
    expect(mockClient.auditEvent.deleteMany).not.toHaveBeenCalled();
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        { name: 'cleanup_audit_events_deleted', value: 0 },
      ]),
    );
  });

  it('sweeps a backlog larger than one batch in batches', async () => {
    await createTask(90);
    mockClient.auditEvent.findMany
      .mockResolvedValueOnce(ids(BATCH_SIZE))
      .mockResolvedValueOnce(ids(3));
    mockClient.auditEvent.deleteMany
      .mockResolvedValueOnce({ count: BATCH_SIZE })
      .mockResolvedValueOnce({ count: 3 });

    const result = await task.execute();

    expect(mockClient.auditEvent.findMany).toHaveBeenCalledTimes(2);
    expect(mockClient.auditEvent.deleteMany).toHaveBeenCalledTimes(2);
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        { name: 'cleanup_audit_events_deleted', value: BATCH_SIZE + 3 },
      ]),
    );
  });

  it('stops at the per-run ceiling and leaves the rest for the next run', async () => {
    await createTask(90);
    mockClient.auditEvent.findMany.mockResolvedValue(ids(BATCH_SIZE));
    mockClient.auditEvent.deleteMany.mockResolvedValue({ count: BATCH_SIZE });

    const result = await task.execute();

    expect(mockClient.auditEvent.findMany).toHaveBeenCalledTimes(
      MAX_BATCHES_PER_RUN,
    );
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        {
          name: 'cleanup_audit_events_deleted',
          value: BATCH_SIZE * MAX_BATCHES_PER_RUN,
        },
      ]),
    );
  });

  it('runs under its own maintenance lock', async () => {
    await createTask(90);

    expect(task.lockId).toBe(MAINTENANCE_LOCK_IDS.auditRetention);
  });
});
