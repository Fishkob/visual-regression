import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ReviewArtifactCleanupTask } from '@internal/data-deletion/tasks/review-artifact-cleanup.task';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';

function makeMockClient() {
  return { $executeRaw: vi.fn() };
}

describe('ReviewArtifactCleanupTask', () => {
  let task: ReviewArtifactCleanupTask;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: ReturnType<typeof makeMockClient>;
  let logger: Mocked<AppLoggerService>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, 'client', { get: () => mockClient });
    logger = createMockLogger() as unknown as Mocked<AppLoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewArtifactCleanupTask,
        { provide: PrismaConnection, useValue: mockConnection },
        { provide: AppLoggerService, useValue: logger },
      ],
    }).compile();

    task = module.get(ReviewArtifactCleanupTask);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function executedSql(call: number): { sql: string; values: unknown[] } {
    return mockClient.$executeRaw.mock.calls[call][0];
  }

  it('deletes only comments whose test row no longer exists', async () => {
    mockClient.$executeRaw.mockResolvedValue(0);

    await task.execute();

    const comments = executedSql(0);
    expect(comments.sql).toContain('DELETE FROM "ReviewComment"');
    expect(comments.sql).toContain('NOT EXISTS');
    expect(comments.sql).toContain('FROM "UnifiedTest"');
    expect(comments.sql).toContain('LIMIT ?');
    expect(comments.values).toEqual([10_000]);
  });

  it('never deletes approval votes: they are the durable 4-eyes trail', async () => {
    mockClient.$executeRaw.mockResolvedValue(0);

    await task.execute();

    expect(mockClient.$executeRaw).toHaveBeenCalledTimes(1);
    expect(executedSql(0).sql).not.toContain('ApprovalVote');
  });

  it('reports the deleted comment count as a gauge', async () => {
    mockClient.$executeRaw.mockResolvedValueOnce(3);

    const result = await task.execute();

    expect(result.gauges).toEqual([
      { name: 'cleanup_review_comments_deleted', value: 3 },
      { name: 'cleanup_review_artifacts_last_run', value: expect.any(Number) },
    ]);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('3 orphaned review comment(s)'),
    );
  });

  it('emits zero gauges and logs nothing when nothing was orphaned', async () => {
    mockClient.$executeRaw.mockResolvedValue(0);

    const result = await task.execute();

    expect(result.gauges?.[0]?.value).toBe(0);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('runs under the dedicated review-artifact-cleanup lock', () => {
    expect(task.lockId).toBe(MAINTENANCE_LOCK_IDS.reviewArtifactCleanup);
  });
});
