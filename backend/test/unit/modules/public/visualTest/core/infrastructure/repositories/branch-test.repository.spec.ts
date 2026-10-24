import type { Mocked } from 'vitest';
import { BranchTestRepository } from '@public/visualTest/core/infrastructure/repositories/branch-test.repository';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { createMock } from '@test/utils/create-mock';

describe('BranchTestRepository', () => {
  let repository: BranchTestRepository;
  let connection: Mocked<PrismaConnection>;
  let mockClient: any;

  beforeEach(() => {
    mockClient = { $queryRaw: vi.fn() };
    connection = createMock<PrismaConnection>();
    Object.defineProperty(connection, 'client', { get: () => mockClient });
    repository = new BranchTestRepository(connection);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps effective test rows and marks the nearest ancestor as inherited', async () => {
    mockClient.$queryRaw.mockResolvedValue([
      {
        id: 'test-1',
        name: 'login',
        kind: 'image',
        status: 'UNCHANGED',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        branchId: 'br-main',
        branchName: 'main',
        isOwn: false,
        total: 1n,
      },
    ]);

    const result = await repository.findEffectiveTests('br-feature', {
      skip: 0,
      take: 50,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual({
      id: 'test-1',
      name: 'login',
      kind: 'image',
      status: 'UNCHANGED',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      origin: 'inherited',
      inheritedFrom: 'main',
    });
  });

  it('returns a single effective test', async () => {
    mockClient.$queryRaw.mockResolvedValue([
      {
        id: 'test-2',
        name: 'checkout',
        kind: 'image',
        status: 'PENDING',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        branchId: 'br-feature',
        branchName: 'feature/x',
        isOwn: true,
      },
    ]);

    const result = await repository.findEffectiveTest('br-feature', 'checkout');

    expect(result).toMatchObject({
      id: 'test-2',
      origin: 'branch',
      inheritedFrom: null,
    });
  });

  it('reports the real total for a page past the end', async () => {
    // The page query returns no rows, so it carries no window count; the
    // repository must ask for the size explicitly instead of reporting 0.
    mockClient.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 3n }]);

    const result = await repository.findEffectiveTests('br-feature', {
      skip: 200,
      take: 50,
    });

    expect(result).toEqual({ data: [], total: 3 });
    expect(mockClient.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('does not run a second count for an unpaginated empty result', async () => {
    mockClient.$queryRaw.mockResolvedValue([]);

    await expect(repository.findEffectiveTests('br-feature')).resolves.toEqual({
      data: [],
      total: 0,
    });
    expect(mockClient.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('scopes the query to the branch and applies the kind filter after ranking', async () => {
    mockClient.$queryRaw.mockResolvedValue([]);

    await repository.findEffectiveTests(
      'br-feature',
      { skip: 0, take: 10 },
      'pdf',
    );

    const query = mockClient.$queryRaw.mock.calls[0][0];
    // The ranking (nearest ancestor wins) is part of the emitted SQL and the
    // kind filter is applied to the ranked set, not inside the chain.
    expect(query.sql).toContain('ROW_NUMBER() OVER (PARTITION BY t."name"');
    expect(query.sql).toContain('r."kind" =');
    expect(query.values).toContain('br-feature');
    expect(query.values).toContain('pdf');
  });

  it('returns null when the chain has no such test', async () => {
    mockClient.$queryRaw.mockResolvedValue([]);

    await expect(
      repository.findEffectiveTest('br-feature', 'missing'),
    ).resolves.toBeNull();
  });

  it('rejects materializing a name with a different kind than the target', async () => {
    mockClient.$queryRaw.mockResolvedValue([
      {
        id: 'test-1',
        name: 'login',
        kind: 'pdf',
        status: 'PENDING',
        createdAt: new Date(),
        branchId: 'br-main',
        branchName: 'main',
        isOwn: false,
      },
    ]);

    await expect(
      repository.assertKindMatchesChain('br-feature', 'login', 'image'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
