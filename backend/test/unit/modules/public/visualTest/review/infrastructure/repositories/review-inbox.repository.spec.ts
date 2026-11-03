import type { Mocked } from 'vitest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ReviewInboxRepository } from '@public/visualTest/review/infrastructure/repositories/review-inbox.repository';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    unifiedComparison: { findMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

describe('ReviewInboxRepository', () => {
  let repository: ReviewInboxRepository;
  let connection: Mocked<PrismaConnection>;
  let mockClient: ReturnType<typeof makeMockClient>;

  const createdAt = new Date('2026-10-20T10:00:00Z');

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'cmp-1',
      mismatchPixelCount: 12,
      mismatchPageCount: null,
      createdAt,
      test: {
        name: 'login',
        kind: 'image',
        branch: {
          id: 'br-feature',
          name: 'feature/x',
          project: {
            name: 'checkout-ui',
            defaultBranchId: 'br-main',
            group: { id: 'g-1', name: 'Shop' },
          },
        },
      },
      baseline: {
        imageUrl: 'http://storage/base.png',
        imageHash: 'hash',
        pageCount: null,
        pixelDiffThreshold: 0,
        createdAt,
        asBaseline: {
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
        },
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    mockClient = makeMockClient();
    connection = createMock<PrismaConnection>();
    Object.defineProperty(connection, 'client', { get: () => mockClient });
    repository = new ReviewInboxRepository(connection);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps rows with their owning branch and default flag', async () => {
    mockClient.unifiedComparison.findMany.mockResolvedValue([row()]);
    mockClient.unifiedComparison.count.mockResolvedValue(1);
    mockClient.$queryRaw.mockResolvedValue([
      { projectName: 'checkout-ui', branchName: 'feature/x', count: 2n },
    ]);

    const result = await repository.findPending();

    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual({
      comparisonId: 'cmp-1',
      projectName: 'checkout-ui',
      groupId: 'g-1',
      groupName: 'Shop',
      testName: 'login',
      kind: 'image',
      branchName: 'feature/x',
      runKey: null,
      isDefaultBranch: false,
      variant: {
        viewport: '1920x1080',
        browser: 'chrome',
        environment: 'staging',
      },
      mismatchPixelCount: 12,
      mismatchPageCount: null,
      createdAt,
      projectPendingCount: 2,
      projectBranchCount: 1,
    });
  });

  it('marks the default branch as such', async () => {
    mockClient.unifiedComparison.findMany.mockResolvedValue([
      row({
        test: {
          name: 'login',
          kind: 'image',
          branch: {
            id: 'br-main',
            name: 'main',
            project: {
              name: 'checkout-ui',
              defaultBranchId: 'br-main',
              group: null,
            },
          },
        },
      }),
    ]);
    mockClient.unifiedComparison.count.mockResolvedValue(1);
    mockClient.$queryRaw.mockResolvedValue([
      { projectName: 'checkout-ui', branchName: 'main', count: 1n },
    ]);

    const result = await repository.findPending();

    expect(result.data[0]).toMatchObject({
      branchName: 'main',
      isDefaultBranch: true,
      groupId: null,
      groupName: null,
      projectPendingCount: 1,
      projectBranchCount: 1,
    });
  });

  it('filters to non-archived branches by default', async () => {
    mockClient.unifiedComparison.findMany.mockResolvedValue([]);
    mockClient.unifiedComparison.count.mockResolvedValue(0);

    await repository.findPending(undefined, { projectName: 'checkout-ui' });

    expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PENDING_APPROVAL',
          test: expect.objectContaining({
            branch: { isArchived: false, project: { name: 'checkout-ui' } },
          }),
        },
      }),
    );
  });

  it('addresses an archived branch when it is named explicitly', async () => {
    mockClient.unifiedComparison.findMany.mockResolvedValue([]);
    mockClient.unifiedComparison.count.mockResolvedValue(0);

    await repository.findPending(undefined, { branchName: 'feature/old' });

    expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PENDING_APPROVAL',
          test: expect.objectContaining({
            branch: { name: 'feature/old' },
          }),
        },
      }),
    );
  });

  it('counts the named archived branch with the same scope it lists', async () => {
    mockClient.unifiedComparison.findMany.mockResolvedValue([row()]);
    mockClient.$queryRaw.mockResolvedValue([
      { projectName: 'checkout-ui', branchName: 'feature/x', count: 1n },
    ]);

    await repository.findPending(undefined, { branchName: 'feature/old' });

    // The page narrowed to the named branch; the count has to narrow the same
    // way instead of applying the archived exclusion — otherwise the project
    // section reports "Review N" 0 above rows it is showing.
    const sql = (
      mockClient.$queryRaw.mock.calls[0]![0] as { strings: readonly string[] }
    ).strings.join('?');
    expect(sql).toContain('b.name =');
    expect(sql).not.toContain('b."isArchived"');
  });

  it('excludes archived branches from the count when no branch is named', async () => {
    mockClient.unifiedComparison.findMany.mockResolvedValue([row()]);
    mockClient.$queryRaw.mockResolvedValue([]);

    await repository.findPending();

    const sql = (
      mockClient.$queryRaw.mock.calls[0]![0] as { strings: readonly string[] }
    ).strings.join('?');
    expect(sql).toContain('b."isArchived" = false');
  });

  it('applies the kind, group and search filters to the same query', async () => {
    mockClient.unifiedComparison.findMany.mockResolvedValue([]);
    mockClient.unifiedComparison.count.mockResolvedValue(0);

    await repository.findPending(undefined, {
      kind: 'pdf',
      groupId: 'unassigned',
      q: 'login',
    });

    expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PENDING_APPROVAL',
          test: expect.objectContaining({
            branch: { isArchived: false, project: { groupId: null } },
            kind: 'pdf',
            OR: [
              { name: { contains: 'login', mode: 'insensitive' } },
              {
                branch: {
                  project: {
                    name: { contains: 'login', mode: 'insensitive' },
                  },
                },
              },
            ],
          }),
        },
      }),
    );
  });

  it('lists the distinct pending branch names', async () => {
    mockClient.$queryRaw.mockResolvedValue([
      { name: 'feature/x' },
      { name: 'main' },
    ]);

    await expect(repository.findPendingBranchNames()).resolves.toEqual([
      'feature/x',
      'main',
    ]);
  });

  it('applies pagination', async () => {
    mockClient.unifiedComparison.findMany.mockResolvedValue([]);
    mockClient.unifiedComparison.count.mockResolvedValue(0);

    await repository.findPending({ skip: 10, take: 5 });

    expect(mockClient.unifiedComparison.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
  });
});
