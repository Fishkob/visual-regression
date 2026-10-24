import type { Mocked } from 'vitest';
import { BranchCommandService } from '@public/visualTest/review/application/branch-command.service';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchDeletionService } from '@public/visualTest/core/application/services/branch-deletion.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { createMock } from '@test/utils/create-mock';

describe('BranchCommandService', () => {
  let service: BranchCommandService;
  let projects: Mocked<ProjectRepository>;
  let branches: Mocked<BranchRepository>;
  let branchResolver: Mocked<BranchResolver>;
  let deletion: Mocked<BranchDeletionService>;
  let workflow: Mocked<StateChangeWorkflow>;

  const main = {
    id: 'br-main',
    projectId: 'proj-1',
    name: 'main',
    targetBranchId: null,
    isArchived: false,
    createdAt: new Date(),
  };
  const feature = {
    id: 'br-1',
    projectId: 'proj-1',
    name: 'feature/x',
    targetBranchId: null,
    isArchived: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    projects = createMock<ProjectRepository>();
    branches = createMock<BranchRepository>();
    branchResolver = createMock<BranchResolver>();
    deletion = createMock<BranchDeletionService>();
    workflow = createMock<StateChangeWorkflow>();
    workflow.executeStateChange.mockImplementation(async (fn: any) => ({
      change: await fn(),
      result: undefined,
    }));
    service = new BranchCommandService(
      projects,
      branches,
      branchResolver,
      deletion,
      workflow,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses to delete the default branch', async () => {
    branchResolver.resolveRead.mockResolvedValue({
      projectId: 'proj-1',
      branchId: 'br-main',
      branchName: 'main',
      isDefault: true,
      isArchived: false,
    });

    await expect(service.delete('app', 'main')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(deletion.delete).not.toHaveBeenCalled();
  });

  it('archives a feature branch', async () => {
    branchResolver.resolveRead.mockResolvedValue({
      projectId: 'proj-1',
      branchId: 'br-1',
      branchName: 'feature/x',
      isDefault: false,
      isArchived: false,
    });
    branches.findByProjectAndName.mockResolvedValue(feature);
    branches.findDefault.mockResolvedValue(main);

    await service.setArchived('app', 'feature/x', true);

    expect(branches.setArchived).toHaveBeenCalledWith('br-1', true);
  });

  it('normalizes the default branch as the target', async () => {
    projects.findByName.mockResolvedValue({
      id: 'proj-1',
      name: 'app',
      createdAt: new Date(),
    });
    branchResolver.resolveRead.mockResolvedValue({
      projectId: 'proj-1',
      branchId: 'br-1',
      branchName: 'feature/x',
      isDefault: false,
      isArchived: false,
    });
    branches.findByProjectAndName.mockResolvedValue(feature);
    branches.findDefault.mockResolvedValue(main);

    await service.setTarget('app', 'feature/x', 'main');

    expect(branches.setTarget).toHaveBeenCalledWith('br-1', null);
  });

  it('rejects a target that does not exist', async () => {
    projects.findByName.mockResolvedValue({
      id: 'proj-1',
      name: 'app',
      createdAt: new Date(),
    });
    branchResolver.resolveRead.mockResolvedValue({
      projectId: 'proj-1',
      branchId: 'br-1',
      branchName: 'feature/x',
      isDefault: false,
      isArchived: false,
    });
    branches.findByProjectAndName
      .mockResolvedValueOnce(feature)
      .mockResolvedValueOnce(null);
    branches.findDefault.mockResolvedValue(main);

    await expect(
      service.setTarget('app', 'feature/x', 'missing'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('promotes a branch to default and pins its variants', async () => {
    projects.findByName.mockResolvedValue({
      id: 'proj-1',
      name: 'app',
      createdAt: new Date(),
    });
    branches.findByProjectAndName.mockResolvedValue(feature);
    branches.findById.mockResolvedValue(feature);

    await service.setDefault('app', 'feature/x');

    expect(branches.setTarget).toHaveBeenCalledWith('br-1', null);
    expect(branches.setDefault).toHaveBeenCalledWith('proj-1', 'br-1');
    expect(branches.markAllOwned).toHaveBeenCalledWith('br-1');
  });

  it('rejects promoting an archived branch', async () => {
    projects.findByName.mockResolvedValue({
      id: 'proj-1',
      name: 'app',
      createdAt: new Date(),
    });
    branches.findByProjectAndName.mockResolvedValue({
      ...feature,
      isArchived: true,
    });

    await expect(service.setDefault('app', 'feature/x')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  // One request is one transaction: a failing retarget must not leave the branch
  // archived with an error returned to the caller.
  it('applies archive and retarget in a single state change', async () => {
    projects.findByName.mockResolvedValue({
      id: 'proj-1',
      name: 'app',
      createdAt: new Date(),
    });
    branchResolver.resolveRead.mockResolvedValue({
      projectId: 'proj-1',
      branchId: 'br-1',
      branchName: 'feature/x',
      isDefault: false,
      isArchived: false,
    });
    branches.findByProjectAndName.mockImplementation(async (_p, name) =>
      name === 'feature/x'
        ? feature
        : { ...feature, id: 'br-2', name: 'release/2' },
    );
    branches.findDefault.mockResolvedValue(main);
    branchResolver.assertValidTarget.mockResolvedValue();

    await service.apply('app', 'feature/x', {
      isArchived: true,
      targetBranch: 'release/2',
    });

    expect(workflow.executeStateChange).toHaveBeenCalledTimes(1);
    expect(branches.setArchived).toHaveBeenCalledWith('br-1', true);
    expect(branches.setTarget).toHaveBeenCalledWith('br-1', 'br-2');
    expect(branchResolver.assertValidTarget).toHaveBeenCalledWith(
      'proj-1',
      'br-1',
      'br-2',
    );
  });

  it('rejects an update that carries neither field', async () => {
    await expect(service.apply('app', 'feature/x', {})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(workflow.executeStateChange).not.toHaveBeenCalled();
  });

  // The validation runs inside the write transaction, so two concurrent retargets
  // cannot both validate against the pre-write graph and persist a cycle.
  // The ordering is asserted explicitly: a mock that merely runs the callback
  // would pass even if the validation moved before executeStateChange.
  it('validates a target inside the write transaction', async () => {
    projects.findByName.mockResolvedValue({
      id: 'proj-1',
      name: 'app',
      createdAt: new Date(),
    });
    branchResolver.resolveRead.mockResolvedValue({
      projectId: 'proj-1',
      branchId: 'br-1',
      branchName: 'feature/x',
      isDefault: false,
      isArchived: false,
    });
    branches.findByProjectAndName.mockResolvedValue({
      ...feature,
      id: 'br-2',
      name: 'release/2',
    });
    branches.findDefault.mockResolvedValue(main);
    let transactionOpen = false;
    workflow.executeStateChange.mockImplementation(async (fn: any) => {
      transactionOpen = true;
      try {
        return { change: await fn(), result: undefined };
      } finally {
        transactionOpen = false;
      }
    });
    let validatedInsideTransaction: boolean | undefined;
    branchResolver.assertValidTarget.mockImplementation(async () => {
      validatedInsideTransaction = transactionOpen;
      throw new Error('cycle');
    });

    await expect(
      service.setTarget('app', 'feature/x', 'release/2'),
    ).rejects.toThrow('cycle');

    expect(validatedInsideTransaction).toBe(true);
    expect(workflow.executeStateChange).toHaveBeenCalledTimes(1);
    expect(branches.setTarget).not.toHaveBeenCalled();
  });
});
