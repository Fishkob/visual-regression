import {
  mapProjectDetailToDto,
  mapProjectSummaryToDto,
  mapProjectToDto,
} from '@public/visualTest/catalog/infrastructure/mappers/project-response.mapper';
import { ProjectDto } from '@public/visualTest/catalog/presentation/dto/project.dto';
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
        teamId: 'team-1',
        teamName: 'Storefront',
        isShared: false,
        pendingCount: 3,
        testCount: 4,
        hasPendingComparisons: true,
      });

      expect(dto).toBeInstanceOf(ProjectDto);
      expect(dto).toEqual({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt,
        teamId: 'team-1',
        teamName: 'Storefront',
        isShared: false,
        pendingCount: 3,
        testCount: 4,
        pending: true,
      });
    });

    // Being shared is a flag on top of the owner (ADR-083), so the payload
    // carries both instead of trading one for the other.
    it('carries the owner next to the shared flag', () => {
      const dto = mapProjectSummaryToDto({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt: new Date('2024-01-01'),
        teamId: 'team-1',
        teamName: 'Storefront',
        isShared: true,
        pendingCount: 0,
        testCount: 0,
        hasPendingComparisons: false,
      });

      expect(dto.teamId).toBe('team-1');
      expect(dto.teamName).toBe('Storefront');
      expect(dto.isShared).toBe(true);
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
        teamId: 'team-1',
      });

      expect(dto).toBeInstanceOf(ProjectDto);
      expect(dto).toEqual({
        id: 'proj-1',
        name: 'checkout-ui',
        createdAt,
        teamId: 'team-1',
        isShared: false,
      });
      expect(dto.pendingCount).toBeUndefined();
      expect(dto.testCount).toBeUndefined();
      expect(dto.pending).toBeUndefined();
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
          teamId: 'team-1',
          teamName: 'Storefront',
          isShared: false,
          branchName: 'main',
          pixelDiffThreshold: null,
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
      expect(dto.teamId).toBe('team-1');
      expect(dto.teamName).toBe('Storefront');
      expect(dto.isShared).toBe(false);
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
