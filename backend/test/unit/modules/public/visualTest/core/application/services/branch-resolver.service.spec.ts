import type { Mocked } from 'vitest';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { createMock } from '@test/utils/create-mock';
import { MAX_BRANCH_CHAIN_DEPTH } from '@public/visualTest/core/domain/constants/branch.constants';

describe('BranchResolver', () => {
  let resolver: BranchResolver;
  let projects: Mocked<ProjectRepository>;
  let branches: Mocked<BranchRepository>;

  const project = { id: 'proj-1', name: 'app', createdAt: new Date() };
  const main = {
    id: 'br-main',
    projectId: 'proj-1',
    name: 'main',
    targetBranchId: null,
    isArchived: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    projects = createMock<ProjectRepository>();
    branches = createMock<BranchRepository>();
    // Default-branch resolution asks for the target chain once; tests that care
    // about depth override this.
    branches.findTargetChainIds.mockResolvedValue([]);
    resolver = new BranchResolver(projects, branches);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveRead', () => {
    it('returns the default branch when no branch is given', async () => {
      projects.findByName.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);

      await expect(resolver.resolveRead('app')).resolves.toEqual({
        projectId: 'proj-1',
        branchId: 'br-main',
        branchName: 'main',
        isDefault: true,
        isArchived: false,
      });
    });

    it('returns a named branch', async () => {
      projects.findByName.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue({
        ...main,
        id: 'br-feature',
        name: 'feature/x',
      });

      await expect(resolver.resolveRead('app', 'feature/x')).resolves.toEqual({
        projectId: 'proj-1',
        branchId: 'br-feature',
        branchName: 'feature/x',
        isDefault: false,
        isArchived: false,
      });
    });

    it('throws NOT_FOUND for an unknown project', async () => {
      projects.findByName.mockResolvedValue(null);

      await expect(resolver.resolveRead('missing')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('throws NOT_FOUND for an unknown branch', async () => {
      projects.findByName.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue(null);

      await expect(
        resolver.resolveRead('app', 'feature/missing'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('resolveForUpload', () => {
    it('creates a missing branch targeting the default branch', async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue(null);
      branches.create.mockResolvedValue({
        ...main,
        id: 'br-feature',
        name: 'feature/x',
      });

      await resolver.resolveForUpload('app', 'feature/x');

      expect(branches.create).toHaveBeenCalledWith('proj-1', 'feature/x', null);
    });

    it('treats an absent or empty branch name as the default branch', async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);

      const expected = {
        projectId: 'proj-1',
        branchId: 'br-main',
        branchName: 'main',
        isDefault: true,
        isArchived: false,
      };
      await expect(
        resolver.resolveForUpload('app', undefined),
      ).resolves.toEqual(expected);
      await expect(resolver.resolveForUpload('app', '')).resolves.toEqual(
        expected,
      );
      expect(branches.create).not.toHaveBeenCalled();
    });

    // A whitespace-only name is not "no branch": the read path rejects it with a
    // 400, so the upload path must not silently land it on the default branch.
    it('rejects a whitespace-only branch name', async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);

      await expect(
        resolver.resolveForUpload('app', '   '),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('rejects uploads to an archived branch', async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue({
        ...main,
        id: 'br-old',
        name: 'old',
        isArchived: true,
      });

      await expect(
        resolver.resolveForUpload('app', 'old'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rejects an explicit target that does not exist', async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockResolvedValue(null);

      await expect(
        resolver.resolveForUpload('app', 'feature/x', 'nope'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('creates a branch with an explicit non-default target', async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockImplementation(async (_p, name) =>
        name === 'release/2'
          ? { ...main, id: 'br-release', name: 'release/2' }
          : null,
      );
      branches.create.mockResolvedValue({
        ...main,
        id: 'br-feature',
        name: 'feature/x',
        targetBranchId: 'br-release',
      });

      await resolver.resolveForUpload('app', 'feature/x', 'release/2');

      expect(branches.create).toHaveBeenCalledWith(
        'proj-1',
        'feature/x',
        'br-release',
      );
    });

    // The Branch View CTE stops after MAX_BRANCH_CHAIN_DEPTH hops, so a branch
    // created on a deeper chain would silently miss the deepest ancestors.
    it('rejects a creation whose target chain is too deep', async () => {
      projects.getOrCreate.mockResolvedValue(project);
      branches.findDefault.mockResolvedValue(main);
      branches.findByProjectAndName.mockImplementation(async (_p, name) =>
        name === 'release/2'
          ? { ...main, id: 'br-release', name: 'release/2' }
          : null,
      );
      branches.findTargetChainIds.mockResolvedValue(
        Array.from(
          { length: MAX_BRANCH_CHAIN_DEPTH + 1 },
          (_unused, index) => `br-ancestor-${index}`,
        ),
      );

      await expect(
        resolver.resolveForUpload('app', 'feature/x', 'release/2'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(branches.create).not.toHaveBeenCalled();
    });
  });

  describe('assertValidTarget', () => {
    it('rejects self-targeting', async () => {
      await expect(
        resolver.assertValidTarget('proj-1', 'br-1', 'br-1'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rejects a cycle', async () => {
      branches.findById.mockResolvedValue({
        ...main,
        id: 'br-2',
        name: 'feature/y',
        targetBranchId: 'br-1',
      });

      await expect(
        resolver.assertValidTarget('proj-1', 'br-1', 'br-2'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rejects a retarget onto a target whose chain is too deep', async () => {
      branches.findById.mockResolvedValue({
        ...main,
        id: 'br-2',
        name: 'feature/y',
        targetBranchId: null,
      });
      branches.findTargetChainIds.mockResolvedValue(
        Array.from(
          { length: MAX_BRANCH_CHAIN_DEPTH + 1 },
          (_unused, index) => `br-ancestor-${index}`,
        ),
      );

      await expect(
        resolver.assertValidTarget('proj-1', 'br-1', 'br-2'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  // `targetBranch` only applies at creation. Accepting a different one silently
  // would leave CI uploading against an inheritance it did not get.
  it('rejects an upload whose targetBranch disagrees with the existing branch', async () => {
    projects.getOrCreate.mockResolvedValue(project);
    branches.findDefault.mockResolvedValue(main);
    branches.findByProjectAndName.mockImplementation(async (_p, name) =>
      name === 'feature/x'
        ? { ...main, id: 'br-1', name: 'feature/x', targetBranchId: null }
        : { ...main, id: 'br-2', name: 'release/2' },
    );

    await expect(
      resolver.resolveForUpload('app', 'feature/x', 'release/2'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('accepts an upload whose targetBranch matches the existing branch', async () => {
    projects.getOrCreate.mockResolvedValue(project);
    branches.findDefault.mockResolvedValue(main);
    branches.findByProjectAndName.mockImplementation(async (_p, name) =>
      name === 'feature/x'
        ? {
            ...main,
            id: 'br-1',
            name: 'feature/x',
            targetBranchId: 'br-2',
          }
        : { ...main, id: 'br-2', name: 'release/2' },
    );

    await expect(
      resolver.resolveForUpload('app', 'feature/x', 'release/2'),
    ).resolves.toMatchObject({ branchId: 'br-1', branchName: 'feature/x' });
  });
});
