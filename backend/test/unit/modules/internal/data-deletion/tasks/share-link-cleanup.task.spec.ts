import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ShareLinkCleanupTask } from '@internal/data-deletion/tasks/share-link-cleanup.task';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { createMock } from '@test/utils/create-mock';

describe('ShareLinkCleanupTask', () => {
  let task: ShareLinkCleanupTask;
  let mockClient: { $executeRaw: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockClient = { $executeRaw: vi.fn() };
    mockClient.$executeRaw.mockResolvedValue(0);

    const connection = createMock<PrismaConnection>();
    Object.defineProperty(connection, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShareLinkCleanupTask,
        { provide: PrismaConnection, useValue: connection },
      ],
    }).compile();

    task = module.get(ShareLinkCleanupTask);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes expired, revoked and orphaned share links in one statement', async () => {
    mockClient.$executeRaw.mockResolvedValue(5);

    const result = await task.execute();

    const [query] = mockClient.$executeRaw.mock.calls[0];
    const sql = (query as { strings: string[] }).strings.join('?');
    expect(sql).toContain('DELETE FROM "ShareLink"');
    expect(sql).toContain('"expiresAt"');
    expect(sql).toContain('"revokedAt"');
    expect(sql).toContain('NOT EXISTS');
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        { name: 'cleanup_share_links_deleted', value: 5 },
      ]),
    );
  });

  it('runs under its own maintenance lock', () => {
    expect(task.lockId).toBe(MAINTENANCE_LOCK_IDS.shareLinkCleanup);
  });
});
