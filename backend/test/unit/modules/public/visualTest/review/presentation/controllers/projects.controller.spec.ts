import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from '@public/visualTest/review/presentation/controllers/projects.controller';
import { ProjectService } from '@public/visualTest/review/application/project.service';
import { DomainError } from '@common/domain/domain-error';
import { CreateProjectDto } from '@public/visualTest/review/presentation/dto/project.dto';
import { PaginationDto } from '@common/dto/pagination.dto';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';
describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectService: jest.Mocked<ProjectService>;

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
      } as any);

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

      const result = await controller.deleteProject('checkout-ui');

      expect(result).toEqual({ success: true });
      expect(projectService.deleteProject).toHaveBeenCalledWith('checkout-ui');
    });
  });

  describe('create', () => {
    it('creates a project and returns the DTO', async () => {
      const dto: CreateProjectDto = { name: 'new-project' };
      const expected = {
        id: 'proj-3',
        name: 'new-project',
        createdAt: new Date(),
      };
      projectService.create.mockResolvedValue(expected);

      const result = await controller.create(dto);

      expect(result).toEqual(expected);
      expect(projectService.create).toHaveBeenCalledWith('new-project');
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
      } as any);

      const result = await controller.getAllProjects(new PaginationDto());

      expect(result).toMatchObject({
        data: [expect.objectContaining({ id: 'proj-1' })],
      });
    });
  });

  describe('getOneProject', () => {
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
      } as any);

      const result = await controller.getOneProject('checkout-ui');

      expect(result).toMatchObject({
        id: 'proj-1',
        visualTests: [{ name: 'login-form' }],
      });
    });

    it('throws not found when project does not exist', async () => {
      projectService.getWithLatestVariantStatuses.mockRejectedValue(
        new DomainError('Project "nonexistent" not found', 'NOT_FOUND'),
      );

      await expect(controller.getOneProject('nonexistent')).rejects.toThrow(
        DomainError,
      );
    });
  });
});
