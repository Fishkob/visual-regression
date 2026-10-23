import { plainToInstance } from 'class-transformer';
import { ProjectDto } from '@public/visualTest/review/presentation/dto/project.dto';
import type {
  ProjectPendingFlag,
  ProjectWithVariants,
} from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import type { ProjectData } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';

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
): ProjectDto {
  return plainToInstance(
    ProjectDto,
    {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      groupId: project.groupId,
      groupName: project.groupName,
      visualTests: project.variants.map((variant) => ({
        name: variant.testName,
        kind: variant.kind,
        variant: {
          viewport: variant.viewport,
          browser: variant.browser,
          environment: variant.environment,
        },
        latestStatus: variant.status,
      })),
    },
    { excludeExtraneousValues: true },
  );
}
