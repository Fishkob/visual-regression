import { Test, TestingModule } from '@nestjs/testing';
import { ProjectService } from '@public/visualTest/review/application/project.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ProjectReadRepository } from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { DomainError } from '@common/domain/domain-error';
import { PaginationDto } from '@common/dto/pagination.dto';
import { TestStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { createMock } from '@test/utils/create-mock';

describe('ProjectService', () => {
  let service: ProjectService;
  let projects: jest.Mocked<ProjectRepository>;
  let projectRead: jest.Mocked<ProjectReadRepository>;
  let testDeletion: jest.Mocked<TestDeletionService>;

  beforeEach(async () => {
    projects = createMock<ProjectRepository>();
    projectRead = createMock<ProjectReadRepository>();
    testDeletion = createMock<TestDeletionService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: ProjectRepository, useValue: projects },
        { provide: ProjectReadRepository, useValue: projectRead },
        { provide: TestDeletionService, useValue: testDeletion },
      ],
    }).compile();

    service = module.get(ProjectService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('deleteProject', () => {
    it('delegates to TestDeletionService', async () => {
      testDeletion.deleteProject.mockResolvedValue(undefined);

      await service.deleteProject('my-project');

      expect(testDeletion.deleteProject).toHaveBeenCalledWith('my-project');
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

      expect(projects.create).toHaveBeenCalledWith('my-project');
      expect(result).toEqual(created);
    });
  });

  describe('getAllWithPendingFlag', () => {
    it('returns paginated projects with pending flag', async () => {
      const pagination = new PaginationDto();
      projectRead.getAllWithPendingFlag.mockResolvedValue({
        data: [
          {
            id: 'proj-1',
            name: 'a',
            createdAt: new Date('2024-01-01'),
            hasPendingComparisons: true,
          },
          {
            id: 'proj-2',
            name: 'b',
            createdAt: new Date('2024-01-02'),
            hasPendingComparisons: false,
          },
        ],
        total: 2,
      });

      const result = await service.getAllWithPendingFlag(pagination);

      expect(projectRead.getAllWithPendingFlag).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        id: 'proj-1',
        name: 'a',
        createdAt: expect.any(Date),
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
        variants: [
          {
            testName: 'test-1',
            kind: 'image',
            viewport: '1920x1080',
            browser: 'chrome',
            environment: 'staging',
            status: TestStatus.PENDING_APPROVAL,
          },
          {
            testName: 'test-2',
            kind: 'pdf',
            viewport: '800x600',
            browser: '',
            environment: '',
            status: TestStatus.UNCHANGED,
          },
        ],
      });

      const result = await service.getWithLatestVariantStatuses('my-project');

      expect(projectRead.getWithLatestVariantStatuses).toHaveBeenCalledWith(
        'my-project',
      );
      expect(result.id).toBe('proj-1');
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
