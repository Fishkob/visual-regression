import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectService } from '@public/visualTest/review/application/project.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ProjectReadRepository } from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import { ProjectGroupRepository } from '@public/visualTest/review/infrastructure/repositories/project-group.repository';
import { BranchCommandService } from '@public/visualTest/review/application/branch-command.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { DomainError } from '@common/domain/domain-error';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import { PaginationDto } from '@common/dto/pagination.dto';
import { TestStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { createMock } from '@test/utils/create-mock';

describe('ProjectService', () => {
  let service: ProjectService;
  let projects: Mocked<ProjectRepository>;
  let projectRead: Mocked<ProjectReadRepository>;
  let testDeletion: Mocked<TestDeletionService>;
  let groups: Mocked<ProjectGroupRepository>;
  let branchCommands: Mocked<BranchCommandService>;
  let audit: Mocked<AuditService>;

  beforeEach(async () => {
    projects = createMock<ProjectRepository>();
    projectRead = createMock<ProjectReadRepository>();
    testDeletion = createMock<TestDeletionService>();
    groups = createMock<ProjectGroupRepository>();
    branchCommands = createMock<BranchCommandService>();
    audit = createMock<AuditService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: ProjectRepository, useValue: projects },
        { provide: ProjectReadRepository, useValue: projectRead },
        { provide: TestDeletionService, useValue: testDeletion },
        { provide: ProjectGroupRepository, useValue: groups },
        { provide: BranchCommandService, useValue: branchCommands },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(ProjectService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deleteProject', () => {
    it('delegates to TestDeletionService', async () => {
      testDeletion.deleteProject.mockResolvedValue(undefined);

      await service.deleteProject('my-project');

      expect(testDeletion.deleteProject).toHaveBeenCalledWith(
        'my-project',
        undefined,
      );
    });

    it('propagates the not-found error from the deletion service', async () => {
      testDeletion.deleteProject.mockRejectedValue(
        new DomainError('Project "non-existent" not found', 'NOT_FOUND'),
      );

      await expect(service.deleteProject('non-existent')).rejects.toThrow(
        DomainError,
      );
    });
  });

  describe('create', () => {
    it('delegates project creation to the repository', async () => {
      const created = {
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date(),
      };
      projects.create.mockResolvedValue(created);

      const result = await service.create('my-project');

      expect(projects.create).toHaveBeenCalledWith('my-project', null);
      expect(result).toEqual({
        ...created,
        groupId: null,
        groupName: null,
        pendingCount: 0,
        testCount: 0,
        pending: false,
      });
    });

    it('creates a project in a known group', async () => {
      const createdAt = new Date('2024-01-01');
      groups.findById.mockResolvedValue({
        id: 'group-1',
        name: 'Checkout',
        createdAt,
      });
      projects.create.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
        groupId: 'group-1',
      });

      const result = await service.create('my-project', 'group-1');

      expect(groups.findById).toHaveBeenCalledWith('group-1');
      expect(projects.create).toHaveBeenCalledWith('my-project', 'group-1');
      expect(result).toMatchObject({
        groupId: 'group-1',
        groupName: 'Checkout',
        pendingCount: 0,
        testCount: 0,
        pending: false,
      });
    });

    it('rejects an unknown group without creating the project', async () => {
      groups.findById.mockResolvedValue(null);

      await expect(
        service.create('my-project', 'missing'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(projects.create).not.toHaveBeenCalled();
    });
  });

  describe('updateProjectGroup', () => {
    it('validates and sets the group and returns project counts', async () => {
      const createdAt = new Date('2024-01-01');
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
      });
      groups.findById.mockResolvedValue({
        id: 'group-1',
        name: 'Checkout',
        createdAt,
      });
      projects.updateGroupByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
        groupId: 'group-1',
      });
      projectRead.getProjectSummary.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
        groupId: 'group-1',
        groupName: 'Checkout',
        pendingCount: 3,
        testCount: 4,
        hasPendingComparisons: true,
      });

      const result = await service.updateProjectGroup('my-project', {
        groupId: 'group-1',
      });

      expect(groups.findById).toHaveBeenCalledWith('group-1');
      expect(projects.updateGroupByName).toHaveBeenCalledWith(
        'my-project',
        'group-1',
      );
      expect(result).toEqual({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
        groupId: 'group-1',
        groupName: 'Checkout',
        pendingCount: 3,
        testCount: 4,
        pending: true,
      });
    });

    it('unassigns a project when groupId is null', async () => {
      const createdAt = new Date('2024-01-01');
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
        groupId: 'group-1',
      });
      projects.updateGroupByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
        groupId: null,
      });
      projectRead.getProjectSummary.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
        groupId: null,
        groupName: null,
        pendingCount: 0,
        testCount: 0,
        hasPendingComparisons: false,
      });

      const result = await service.updateProjectGroup('my-project', {
        groupId: null,
      });

      expect(groups.findById).not.toHaveBeenCalled();
      expect(projects.updateGroupByName).toHaveBeenCalledWith(
        'my-project',
        null,
      );
      expect(result).toMatchObject({
        groupId: null,
        groupName: null,
        pending: false,
      });
    });

    it('returns the project when only the name changes', async () => {
      vi.spyOn(service, 'getWithLatestVariantStatuses').mockResolvedValue(
        {} as never,
      );

      await expect(
        service.updateProjectGroup('my-project', { groupId: undefined }),
      ).resolves.toEqual({});
    });

    it('rejects a missing project', async () => {
      projects.findByName.mockResolvedValue(null);

      await expect(
        service.updateProjectGroup('missing', { groupId: 'group-1' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(projects.updateGroupByName).not.toHaveBeenCalled();
    });

    it('rejects an unknown group without updating the project', async () => {
      const createdAt = new Date('2024-01-01');
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
      });
      groups.findById.mockResolvedValue(null);

      await expect(
        service.updateProjectGroup('my-project', { groupId: 'missing' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(projects.updateGroupByName).not.toHaveBeenCalled();
    });

    it('does not change the review policy through the generic update', async () => {
      vi.spyOn(service, 'getWithLatestVariantStatuses').mockResolvedValue(
        {} as never,
      );

      await service.updateProjectGroup('my-project', {
        requiredApprovals: 5,
      } as never);

      expect(projects.updateRequiredApprovals).not.toHaveBeenCalled();
    });
  });

  describe('updateReviewPolicy', () => {
    it('loads the old value, updates the project and audits from/to', async () => {
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date('2024-01-01'),
        requiredApprovals: 1,
      });

      const result = await service.updateReviewPolicy('my-project', 3, 'jane');

      expect(projects.updateRequiredApprovals).toHaveBeenCalledWith(
        'my-project',
        3,
      );
      expect(audit.record).toHaveBeenCalledWith({
        actor: 'jane',
        action: AUDIT_ACTIONS.projectReviewPolicy,
        projectName: 'my-project',
        targetType: 'project',
        targetId: 'proj-1',
        metadata: { from: 1, to: 3 },
      });
      expect(result).toEqual({ requiredApprovals: 3 });
    });

    it('treats a project without a stored value as requiring one approval', async () => {
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date('2024-01-01'),
      });

      await service.updateReviewPolicy('my-project', 2);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: null,
          metadata: { from: 1, to: 2 },
        }),
      );
    });

    it('writes the audit row after the update', async () => {
      const order: string[] = [];
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date('2024-01-01'),
        requiredApprovals: 2,
      });
      projects.updateRequiredApprovals.mockImplementation(async () => {
        order.push('update');
      });
      audit.record.mockImplementation(async () => {
        order.push('audit');
      });

      await service.updateReviewPolicy('my-project', 4);

      expect(order).toEqual(['update', 'audit']);
    });

    it('rejects a missing project without writing or auditing', async () => {
      projects.findByName.mockResolvedValue(null);

      await expect(
        service.updateReviewPolicy('missing', 3),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(projects.updateRequiredApprovals).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('getAllWithPendingFlag', () => {
    it('forwards the search and group filters to the read model', async () => {
      const pagination = new PaginationDto();
      projectRead.getAllWithPendingFlag.mockResolvedValue({
        data: [],
        total: 0,
      });

      await service.getAllWithPendingFlag(pagination, {
        q: 'checkout',
        groupId: 'unassigned',
      });

      expect(projectRead.getAllWithPendingFlag).toHaveBeenCalledWith(
        { skip: 0, take: 20 },
        { q: 'checkout', groupId: 'unassigned' },
      );
    });

    it('returns paginated projects with pending flag', async () => {
      const pagination = new PaginationDto();
      projectRead.getAllWithPendingFlag.mockResolvedValue({
        data: [
          {
            id: 'proj-1',
            name: 'a',
            createdAt: new Date('2024-01-01'),
            groupId: 'group-1',
            groupName: 'Checkout',
            pendingCount: 3,
            testCount: 2,
            hasPendingComparisons: true,
          },
          {
            id: 'proj-2',
            name: 'b',
            createdAt: new Date('2024-01-02'),
            groupId: null,
            groupName: null,
            pendingCount: 0,
            testCount: 1,
            hasPendingComparisons: false,
          },
        ],
        total: 2,
      });

      const result = await service.getAllWithPendingFlag(pagination);

      expect(projectRead.getAllWithPendingFlag).toHaveBeenCalledWith(
        { skip: 0, take: 20 },
        undefined,
      );
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        id: 'proj-1',
        name: 'a',
        createdAt: expect.any(Date),
        groupId: 'group-1',
        groupName: 'Checkout',
        pendingCount: 3,
        testCount: 2,
        pending: true,
      });
      expect(result.data[1].pending).toBe(false);
    });
  });

  describe('findAll', () => {
    it('returns paginated projects mapped to DTO', async () => {
      const pagination = new PaginationDto();
      const createdAt = new Date('2024-01-01');
      projects.findAll.mockResolvedValue({
        data: [{ id: 'proj-1', name: 'my-project', createdAt }],
        total: 1,
      });

      const result = await service.findAll(pagination);

      expect(projects.findAll).toHaveBeenCalledWith({ skip: 0, take: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('proj-1');
      expect(result.data[0].name).toBe('my-project');
      expect(result.data[0].createdAt).toEqual(createdAt);
    });
  });

  describe('getWithLatestVariantStatuses', () => {
    it('returns project with mapped variant statuses', async () => {
      const createdAt = new Date('2024-01-01');
      projectRead.getWithLatestVariantStatuses.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt,
        groupId: null,
        groupName: null,
        branchName: 'main',
        requiredApprovals: 1,
        defaultBranchName: 'main',
        variants: [
          {
            testName: 'test-1',
            kind: 'image',
            viewport: '1920x1080',
            browser: 'chrome',
            environment: 'staging',
            status: TestStatus.PENDING_APPROVAL,
            origin: 'branch',
            inheritedFrom: null,
          },
          {
            testName: 'test-2',
            kind: 'pdf',
            viewport: '800x600',
            browser: '',
            environment: '',
            status: TestStatus.UNCHANGED,
            origin: 'branch',
            inheritedFrom: null,
          },
        ],
        total: 2,
        filterOptions: {
          viewports: ['1920x1080', '800x600'],
          browsers: ['chrome'],
          environments: ['staging'],
          testCount: 2,
          pendingCount: 1,
        },
      });

      const result = await service.getWithLatestVariantStatuses('my-project');

      expect(projectRead.getWithLatestVariantStatuses).toHaveBeenCalledWith(
        'my-project',
        undefined,
        { skip: 0, take: 20 },
        undefined,
      );
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
      expect(result.id).toBe('proj-1');
      expect(result.groupId).toBeNull();
      expect(result.groupName).toBeNull();
      expect(result.visualTests!).toHaveLength(2);
      expect(result.visualTests![0]).toEqual({
        name: 'test-1',
        kind: 'image',
        variant: {
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
        },
        latestStatus: TestStatus.PENDING_APPROVAL,
        origin: 'branch',
        inheritedFrom: null,
      });
      expect(result.visualTests![1].latestStatus).toBe(TestStatus.UNCHANGED);
    });

    it('throws DomainError when project not found', async () => {
      projectRead.getWithLatestVariantStatuses.mockResolvedValue(null);

      await expect(
        service.getWithLatestVariantStatuses('unknown-project'),
      ).rejects.toThrow(DomainError);
    });
  });
});
