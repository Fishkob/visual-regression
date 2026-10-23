import { Injectable } from '@nestjs/common';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ProjectReadRepository } from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import { ProjectGroupRepository } from '@public/visualTest/review/infrastructure/repositories/project-group.repository';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { DomainError } from '@common/domain/domain-error';
import { PaginationDto } from '@common/dto/pagination.dto';
import { paginatedQuery } from '@common/utils/paginated-query';
import {
  mapProjectDetailToDto,
  mapProjectSummaryToDto,
  mapProjectToDto,
} from '@public/visualTest/review/infrastructure/mappers/project-response.mapper';
import type { ProjectDto } from '@public/visualTest/review/presentation/dto/project.dto';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly projectRead: ProjectReadRepository,
    private readonly testDeletion: TestDeletionService,
    private readonly groups: ProjectGroupRepository,
  ) {}

  async getAllWithPendingFlag(pagination: PaginationDto) {
    return paginatedQuery(
      (args) => this.projectRead.getAllWithPendingFlag(args),
      pagination,
      mapProjectSummaryToDto,
    );
  }

  async findAll(pagination: PaginationDto) {
    return paginatedQuery(
      (args) => this.projects.findAll(args),
      pagination,
      mapProjectToDto,
    );
  }

  async getWithLatestVariantStatuses(projectName: string): Promise<ProjectDto> {
    const project =
      await this.projectRead.getWithLatestVariantStatuses(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }

    return mapProjectDetailToDto(project);
  }

  async create(name: string, groupId?: string): Promise<ProjectDto> {
    const group = groupId ? await this.groups.findById(groupId) : null;
    if (groupId && !group) {
      throw new DomainError(`Group "${groupId}" not found`, 'NOT_FOUND');
    }
    const project = await this.projects.create(name, groupId ?? null);
    return mapProjectSummaryToDto({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
      pendingCount: 0,
      testCount: 0,
      hasPendingComparisons: false,
    });
  }

  async updateProjectGroup(
    projectName: string,
    groupId: string | null | undefined,
  ): Promise<ProjectDto> {
    if (groupId === undefined) {
      throw new DomainError('groupId is required', 'BAD_REQUEST');
    }
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    if (groupId) {
      const group = await this.groups.findById(groupId);
      if (!group) {
        throw new DomainError(`Group "${groupId}" not found`, 'NOT_FOUND');
      }
    }
    await this.projects.updateGroupByName(projectName, groupId);
    const summary = await this.projectRead.getProjectSummary(projectName);
    if (!summary) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    return mapProjectSummaryToDto(summary);
  }

  async deleteProject(projectName: string): Promise<void> {
    // Existence is resolved (and NOT_FOUND thrown) inside the deletion's
    // transaction — TestDeletionService owns the single read of the project.
    await this.testDeletion.deleteProject(projectName);
  }
}
