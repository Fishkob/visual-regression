import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectGroupService } from '@public/visualTest/catalog/application/project-group.service';
import { ProjectGroupRepository } from '@public/visualTest/catalog/infrastructure/repositories/project-group.repository';
import { createMock } from '@test/utils/create-mock';

describe('ProjectGroupService', () => {
  let service: ProjectGroupService;
  let groups: Mocked<ProjectGroupRepository>;

  beforeEach(async () => {
    groups = createMock<ProjectGroupRepository>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectGroupService,
        { provide: ProjectGroupRepository, useValue: groups },
      ],
    }).compile();
    service = module.get(ProjectGroupService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('lists groups', async () => {
    const rows = [
      { id: 'g1', name: 'Checkout', createdAt: new Date(), projectCount: 2 },
    ];
    groups.findAll.mockResolvedValue(rows);
    await expect(service.findAll()).resolves.toEqual(rows);
  });

  it('creates a group', async () => {
    const row = {
      id: 'g1',
      name: 'Checkout',
      createdAt: new Date(),
      projectCount: 0,
    };
    groups.create.mockResolvedValue(row);
    await expect(service.create('Checkout')).resolves.toEqual(row);
    expect(groups.create).toHaveBeenCalledWith('Checkout');
  });

  it('renames a group', async () => {
    const row = {
      id: 'g1',
      name: 'Storefront',
      createdAt: new Date(),
      projectCount: 1,
    };
    groups.rename.mockResolvedValue(row);
    await expect(service.rename('g1', 'Storefront')).resolves.toEqual(row);
  });

  it('deletes a group and returns success', async () => {
    groups.delete.mockResolvedValue(undefined);
    await expect(service.delete('g1')).resolves.toEqual({ success: true });
  });
});
