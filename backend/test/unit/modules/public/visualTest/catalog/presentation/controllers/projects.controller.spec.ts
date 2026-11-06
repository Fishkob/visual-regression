import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ProjectDetailQueryDto,
  type ProjectDto,
} from '@public/visualTest/catalog/presentation/dto/project.dto';
import { ProjectsController } from '@public/visualTest/catalog/presentation/controllers/projects.controller';
import { ProjectService } from '@public/visualTest/catalog/application/project.service';
import { DomainError } from '@common/domain/domain-error';
import {
  CreateProjectDto,
  UpdateProjectDto,
} from '@public/visualTest/catalog/presentation/dto/project.dto';
import { PaginationDto } from '@common/dto/pagination.dto';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';
describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectService: Mocked<ProjectService>;

  beforeEach(async () => {
    projectService = createMock<ProjectService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectService, useValue: projectService },
        { provide: AppLoggerService, useValue: createMockLogger() },
      ],
    }).compile();

    controller = module.get(ProjectsController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getProjectsWithPendingFlag', () => {
    it('returns paginated projects with pending flag', async () => {
      projectService.getAllWithPendingFlag.mockResolvedValue({
        data: [
          {
            id: 'proj-1',
            name: 'checkout-ui',
            createdAt: new Date(),
            pending: true,
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

      const result = await controller.getProjectsWithPendingFlag(
        new PaginationDto(),
      );

      expect(result).toMatchObject({
        data: [{ id: 'proj-1', name: 'checkout-ui', pending: true }],
      });
    });
  });

  describe('deleteProject', () => {
    it('deletes project and returns success', async () => {
      projectService.deleteProject.mockResolvedValue(undefined);

      const result = await controller.deleteProject('checkout-ui', {
        auth: { username: 'jane', userId: 'user-1' },
      } as never);

      expect(result).toEqual({ success: true });
      expect(projectService.deleteProject).toHaveBeenCalledWith(
        'checkout-ui',
        'jane',
      );
    });
  });

  describe('create', () => {
    it('creates a project and returns the DTO', async () => {
      const dto: CreateProjectDto = { name: 'new-project' };
      const expected = {
        id: 'proj-3',
        name: 'new-project',
        createdAt: new Date(),
        groupId: null,
        groupName: null,
        pendingCount: 0,
        testCount: 0,
        pending: false,
      };
      projectService.create.mockResolvedValue(expected);

      const result = await controller.create(dto);

      expect(result).toEqual(expected);
      expect(projectService.create).toHaveBeenCalledWith(
        'new-project',
        undefined,
      );
    });
  });

  describe('updateProject', () => {
    it('moves a project to a group and returns group fields', async () => {
      const dto: UpdateProjectDto = { groupId: 'group-1' };
      const expected = {
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt: new Date(),
        groupId: 'group-1',
        groupName: 'Checkout',
        pendingCount: 3,
        testCount: 4,
        pending: true,
      };
      projectService.updateProjectGroup.mockResolvedValue(expected);

      const result = await controller.updateProject('checkout-ui', dto, {
        auth: { username: 'ada', userId: 'user-1' },
      } as never);

      expect(result).toEqual(expected);
      expect(projectService.updateProjectGroup).toHaveBeenCalledWith(
        'checkout-ui',
        dto,
      );
    });
  });

  describe('getAllProjects', () => {
    it('returns paginated projects', async () => {
      projectService.findAll.mockResolvedValue({
        data: [{ id: 'proj-1', name: 'checkout-ui', createdAt: new Date() }],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

      const result = await controller.getAllProjects(new PaginationDto());

      expect(result).toMatchObject({
        data: [expect.objectContaining({ id: 'proj-1' })],
      });
    });
  });

  describe('getOneProject', () => {
    it('forwards the server-side filters and trims the search', async () => {
      projectService.getWithLatestVariantStatuses.mockResolvedValue({
        id: 'proj-1',
        name: 'checkout-ui',
      });
      const query = Object.assign(new ProjectDetailQueryDto(), {
        q: '  login  ',
        kind: 'pdf',
        status: 'pending',
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'ci',
      });

      await controller.getOneProject('checkout-ui', query, 'feature/x');

      expect(projectService.getWithLatestVariantStatuses).toHaveBeenCalledWith(
        'checkout-ui',
        'feature/x',
        query,
        {
          q: 'login',
          kind: 'pdf',
          status: 'pending',
          viewport: '1920x1080',
          browser: 'Chrome',
          environment: 'ci',
        },
      );
    });

    it('returns project with variant statuses', async () => {
      projectService.getWithLatestVariantStatuses.mockResolvedValue({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt: new Date(),
        visualTests: [
          {
            name: 'login-form',
            viewport: '1920x1080',
            browser: 'Chrome',
            environment: 'ci',
            latestStatus: 'UNCHANGED',
          },
        ],
      } as unknown as ProjectDto);

      const result = await controller.getOneProject(
        'checkout-ui',
        new ProjectDetailQueryDto(),
      );

      expect(result).toMatchObject({
        id: 'proj-1',
        visualTests: [{ name: 'login-form' }],
      });
    });

    it('throws not found when project does not exist', async () => {
      projectService.getWithLatestVariantStatuses.mockRejectedValue(
        new DomainError('Project "nonexistent" not found', 'NOT_FOUND'),
      );

      await expect(
        controller.getOneProject('nonexistent', new ProjectDetailQueryDto()),
      ).rejects.toThrow(DomainError);
    });
  });
});
