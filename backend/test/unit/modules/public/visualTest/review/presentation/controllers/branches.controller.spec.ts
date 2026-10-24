import type { Mocked } from 'vitest';
import { BranchesController } from '@public/visualTest/review/presentation/controllers/branches.controller';
import { BranchReadRepository } from '@public/visualTest/review/infrastructure/repositories/branch-read.repository';
import { BranchCommandService } from '@public/visualTest/review/application/branch-command.service';
import { BadRequestException } from '@nestjs/common';
import { createMock } from '@test/utils/create-mock';

describe('BranchesController', () => {
  let controller: BranchesController;
  let read: Mocked<BranchReadRepository>;
  let commands: Mocked<BranchCommandService>;

  beforeEach(() => {
    read = createMock<BranchReadRepository>();
    commands = createMock<BranchCommandService>();
    controller = new BranchesController(read, commands);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the branches of a project', async () => {
    read.list.mockResolvedValue([]);

    await expect(controller.list('app')).resolves.toEqual([]);
    expect(read.list).toHaveBeenCalledWith('app', false);
  });

  it('includes archived branches when asked', async () => {
    read.list.mockResolvedValue([]);

    await controller.list('app', 'true');

    expect(read.list).toHaveBeenCalledWith('app', true);
  });

  it('treats "false" as hiding archived branches', async () => {
    read.list.mockResolvedValue([]);

    await controller.list('app', 'false');

    expect(read.list).toHaveBeenCalledWith('app', false);
  });

  it('rejects a non-boolean includeArchived value', async () => {
    read.list.mockResolvedValue([]);

    await expect(controller.list('app', '1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(read.list).not.toHaveBeenCalled();
  });

  it('defaults includeArchived to false when the parameter is absent', async () => {
    read.list.mockResolvedValue([]);

    await controller.list('app', undefined);

    expect(read.list).toHaveBeenCalledWith('app', false);
  });

  it('applies an update to a branch', async () => {
    commands.apply.mockResolvedValue({ success: true });

    await expect(
      controller.update('app', 'feature/x', {
        isArchived: true,
        targetBranch: 'main',
      }),
    ).resolves.toEqual({ success: true });
    expect(commands.apply).toHaveBeenCalledWith('app', 'feature/x', {
      isArchived: true,
      targetBranch: 'main',
    });
  });

  it('deletes a branch', async () => {
    commands.delete.mockResolvedValue(undefined);

    await expect(controller.remove('app', 'feature/x')).resolves.toEqual({
      success: true,
    });
    expect(commands.delete).toHaveBeenCalledWith('app', 'feature/x');
  });
});
