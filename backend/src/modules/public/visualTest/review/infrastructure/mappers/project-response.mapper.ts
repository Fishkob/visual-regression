import { plainToInstance } from 'class-transformer';
import { ProjectDto } from '@public/visualTest/review/presentation/dto/project.dto';
import type {
  ProjectPendingFlag,
  ProjectWithVariants,
} from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
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
      groupId: project.groupId,
      groupName: project.groupName,
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
      groupId: project.groupId ?? null,
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
      groupId: project.groupId,
      groupName: project.groupName,
      branchName: project.branchName,
      defaultBranchName: project.defaultBranchName,
      requiredApprovals: project.requiredApprovals,
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
