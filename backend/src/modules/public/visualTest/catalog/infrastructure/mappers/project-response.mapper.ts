import { plainToInstance } from 'class-transformer';
import { ProjectDto } from '@public/visualTest/catalog/presentation/dto/project.dto';
import type {
  ProjectPendingFlag,
  ProjectWithVariants,
} from '@public/visualTest/catalog/infrastructure/repositories/project-read.repository';
import type { ProjectData } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import type { PaginationMetaDto } from '@common/dto/paginated-response.dto';

export function mapProjectSummaryToDto(
  project: ProjectPendingFlag,
): ProjectDto {
  return plainToInstance(
    ProjectDto,
    {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      teamId: project.teamId,
      teamName: project.teamName,
      isShared: project.isShared,
      pendingCount: project.pendingCount,
      testCount: project.testCount,
      pending: project.hasPendingComparisons,
    },
    { excludeExtraneousValues: true },
  );
}

export function mapProjectToDto(project: ProjectData): ProjectDto {
  return plainToInstance(
    ProjectDto,
    {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      teamId: project.teamId,
      isShared: project.isShared ?? false,
    },
    { excludeExtraneousValues: true },
  );
}

export function mapProjectDetailToDto(
  project: ProjectWithVariants,
  meta: PaginationMetaDto,
): ProjectDto {
  return plainToInstance(
    ProjectDto,
    {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      teamId: project.teamId,
      teamName: project.teamName,
      isShared: project.isShared,
      branchName: project.branchName,
      defaultBranchName: project.defaultBranchName,
      pixelDiffThreshold: project.pixelDiffThreshold,
      visualTests: project.variants.map((variant) => ({
        name: variant.testName,
        kind: variant.kind,
        variant: {
          viewport: variant.viewport,
          browser: variant.browser,
          environment: variant.environment,
        },
        latestStatus: variant.status,
        origin: variant.origin,
        inheritedFrom: variant.inheritedFrom,
      })),
      pendingCount: project.filterOptions.pendingCount,
      testCount: project.filterOptions.testCount,
      meta,
      filterOptions: project.filterOptions,
    },
    { excludeExtraneousValues: true },
  );
}
