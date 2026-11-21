import type { Mocked } from 'vitest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { SearchRepository } from '@public/visualTest/catalog/infrastructure/repositories/search.repository';
import { ALL_PROJECTS } from '@common/domain/project-scope';
import { createMock } from '@test/utils/create-mock';

function makeMockClient() {
  return {
    project: { findMany: vi.fn().mockResolvedValue([]) },
    unifiedTest: { findMany: vi.fn().mockResolvedValue([]) },
    branch: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

// Policy, not mechanism (ADR-059): what each of the three queries is allowed to
// return is the leak surface, so that is what this spec pins.
describe('SearchRepository', () => {
  let repository: SearchRepository;
  let connection: Mocked<PrismaConnection>;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    mockClient = makeMockClient();
    connection = createMock<PrismaConnection>();
    Object.defineProperty(connection, 'client', { get: () => mockClient });
    repository = new SearchRepository(connection);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds only what the caller may open', async () => {
    await repository.search('checkout', 8, {
      kind: 'ids',
      ids: new Set(['p-1', 'p-shared']),
    });

    const inScope = { id: { in: ['p-1', 'p-shared'] } };
    expect(mockClient.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(inScope),
      }),
    );
    expect(mockClient.unifiedTest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branch: expect.objectContaining({ project: inScope }),
        }),
      }),
    );
    expect(mockClient.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ project: inScope }),
      }),
    );
  });

  it('answers a scoped search with nothing when the scope is empty', async () => {
    await repository.search('checkout', 8, { kind: 'ids', ids: new Set() });

    expect(mockClient.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [] } }),
      }),
    );
  });

  it('leaves the queries unfiltered for an unrestricted caller', async () => {
    await repository.search('checkout', 8, ALL_PROJECTS);

    expect(mockClient.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'checkout', mode: 'insensitive' } },
      }),
    );
    expect(mockClient.unifiedTest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branch: { isArchived: false, project: {} },
        }),
      }),
    );
  });

  it('maps the hits with the branch each one lives on', async () => {
    mockClient.project.findMany.mockResolvedValue([{ name: 'checkout-ui' }]);
    mockClient.unifiedTest.findMany.mockResolvedValue([
      {
        name: 'login',
        kind: 'image',
        status: 'UNCHANGED',
        branch: { name: 'main', project: { name: 'checkout-ui' } },
      },
    ]);
    mockClient.branch.findMany.mockResolvedValue([
      {
        name: 'main',
        project: {
          name: 'checkout-ui',
          defaultBranch: { name: 'main' },
        },
      },
    ]);

    await expect(repository.search('check', 8, ALL_PROJECTS)).resolves.toEqual({
      projects: [{ name: 'checkout-ui' }],
      tests: [
        {
          projectName: 'checkout-ui',
          branchName: 'main',
          testName: 'login',
          kind: 'image',
          status: 'UNCHANGED',
        },
      ],
      branches: [
        { projectName: 'checkout-ui', branchName: 'main', isDefault: true },
      ],
    });
  });
});
