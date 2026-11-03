import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { SessionCleanupTask } from '@internal/data-deletion/tasks/session-cleanup.task';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    session: { deleteMany: vi.fn() },
    twoFactorChallenge: { deleteMany: vi.fn() },
  };
}

describe('SessionCleanupTask', () => {
  let task: SessionCleanupTask;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionCleanupTask,
        { provide: PrismaConnection, useValue: mockConnection },
      ],
    }).compile();

    task = module.get(SessionCleanupTask);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes sessions whose window has closed and reports the deleted count', async () => {
    mockClient.session.deleteMany.mockResolvedValue({ count: 4 });
    mockClient.twoFactorChallenge.deleteMany.mockResolvedValue({ count: 0 });

    const result = await task.execute();

    expect(mockClient.session.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
    expect(result.gauges?.[0]).toEqual({
      name: expect.stringContaining('cleanup_sessions_deleted'),
      value: 4,
    });
  });

  it('also drops abandoned two-factor challenges', async () => {
    mockClient.session.deleteMany.mockResolvedValue({ count: 0 });
    mockClient.twoFactorChallenge.deleteMany.mockResolvedValue({ count: 3 });

    const result = await task.execute();

    expect(mockClient.twoFactorChallenge.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        {
          name: expect.stringContaining(
            'cleanup_two_factor_challenges_deleted',
          ),
          value: 3,
        },
      ]),
    );
  });

  it('emits a zero delete gauge and a last-run gauge when nothing was deleted', async () => {
    mockClient.session.deleteMany.mockResolvedValue({ count: 0 });
    mockClient.twoFactorChallenge.deleteMany.mockResolvedValue({ count: 0 });

    const result = await task.execute();

    expect(result.gauges?.[0]?.value).toBe(0);
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        {
          name: expect.stringContaining('cleanup_sessions_last_run'),
          value: expect.any(Number),
        },
      ]),
    );
  });

  it('runs under the dedicated session-cleanup lock', () => {
    expect(task.lockId).toBe(MAINTENANCE_LOCK_IDS.sessionCleanup);
  });
});
