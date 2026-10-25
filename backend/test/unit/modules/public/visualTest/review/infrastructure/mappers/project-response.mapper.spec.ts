import {
  mapProjectDetailToDto,
  mapProjectSummaryToDto,
  mapProjectToDto,
} from '@public/visualTest/review/infrastructure/mappers/project-response.mapper';
import { ProjectDto } from '@public/visualTest/review/presentation/dto/project.dto';
import { TestStatus } from '@public/visualTest/core/domain/types/visual-test.types';

describe('project-response.mapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('mapProjectSummaryToDto', () => {
    it('maps the pending flag to the DTO field name', () => {
      const createdAt = new Date('2024-01-01');

      const dto = mapProjectSummaryToDto({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt,
        groupId: 'group-1',
        groupName: 'Checkout',
        pendingCount: 3,
        testCount: 4,
        hasPendingComparisons: true,
      });

      expect(dto).toBeInstanceOf(ProjectDto);
      expect(dto).toEqual({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt,
        groupId: 'group-1',
        groupName: 'Checkout',
        pendingCount: 3,
        testCount: 4,
        pending: true,
      });
    });

    it('keeps an unassigned project unassigned', () => {
      const dto = mapProjectSummaryToDto({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt: new Date('2024-01-01'),
        groupId: null,
        groupName: null,
        pendingCount: 0,
        testCount: 0,
        hasPendingComparisons: false,
      });

      expect(dto.groupId).toBeNull();
      expect(dto.groupName).toBeNull();
      expect(dto.pending).toBe(false);
    });
  });

  describe('mapProjectToDto', () => {
    it('maps the base project shape without summary fields', () => {
      const createdAt = new Date('2024-01-01');

      const dto = mapProjectToDto({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt,
      });

      expect(dto).toBeInstanceOf(ProjectDto);
      expect(dto).toEqual({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt,
        groupId: null,
      });
      expect(dto.pendingCount).toBeUndefined();
      expect(dto.testCount).toBeUndefined();
      expect(dto.pending).toBeUndefined();
    });

    it('keeps an assigned group id', () => {
      const dto = mapProjectToDto({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt: new Date('2024-01-01'),
        groupId: 'group-1',
      });

      expect(dto.groupId).toBe('group-1');
    });
  });

  describe('mapProjectDetailToDto', () => {
    it('maps variants to visual test DTOs', () => {
      const createdAt = new Date('2024-01-01');

      const dto = mapProjectDetailToDto(
        {
          id: 'proj-1',
          name: 'checkout-ui',
          createdAt,
          groupId: null,
          groupName: null,
          branchName: 'main',
          requiredApprovals: 1,
      defaultBranchName: 'main',
          variants: [
            {
              testName: 'login-form',
              kind: 'image',
              viewport: '1920x1080',
              browser: 'chrome',
              environment: 'production',
              status: TestStatus.PENDING_APPROVAL,
              origin: 'branch',
              inheritedFrom: null,
            },
          ],
          total: 1,
          filterOptions: {
            viewports: ['1920x1080'],
            browsers: ['chrome'],
            environments: ['staging'],
            testCount: 1,
            pendingCount: 1,
          },
        },
        {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      );

      expect(dto).toBeInstanceOf(ProjectDto);
      expect(dto.meta).toMatchObject({ page: 1, total: 1 });
      expect(dto.filterOptions).toEqual({
        viewports: ['1920x1080'],
        browsers: ['chrome'],
        environments: ['staging'],
      });
      expect(dto.pendingCount).toBe(1);
      expect(dto.testCount).toBe(1);
      expect(dto.visualTests).toEqual([
        {
          name: 'login-form',
          kind: 'image',
          variant: {
            viewport: '1920x1080',
            browser: 'chrome',
            environment: 'production',
          },
          latestStatus: TestStatus.PENDING_APPROVAL,
          origin: 'branch',
          inheritedFrom: null,
        },
      ]);
    });
  });
});
