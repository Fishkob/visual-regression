import { Injectable } from '@nestjs/common';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ProjectReadRepository } from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import { ProjectGroupRepository } from '@public/visualTest/review/infrastructure/repositories/project-group.repository';
import { BranchCommandService } from '@public/visualTest/review/application/branch-command.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { DomainError } from '@common/domain/domain-error';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import { PaginationDto } from '@common/dto/pagination.dto';
import { paginatedQuery } from '@common/utils/paginated-query';
import { createPaginatedResponse } from '@common/dto/paginated-response.dto';
import type { TestKind } from '@common/domain/test-kind';
import {
  mapProjectDetailToDto,
  mapProjectSummaryToDto,
  mapProjectToDto,
} from '@public/visualTest/review/infrastructure/mappers/project-response.mapper';
import type {
  ProjectDto,
  UpdateProjectDto,
} from '@public/visualTest/review/presentation/dto/project.dto';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly projectRead: ProjectReadRepository,
    private readonly testDeletion: TestDeletionService,
    private readonly groups: ProjectGroupRepository,
    private readonly branchCommands: BranchCommandService,
    private readonly audit: AuditService,
  ) {}

  async getAllWithPendingFlag(
    pagination: PaginationDto,
    filters?: { q?: string; groupId?: string },
  ) {
    return paginatedQuery(
      (args) => this.projectRead.getAllWithPendingFlag(args, filters),
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

  async getWithLatestVariantStatuses(
    projectName: string,
    branchName?: string,
    pagination: PaginationDto = new PaginationDto(),
    filters?: {
      q?: string;
      kind?: TestKind;
      status?: 'pending' | 'ok';
      viewport?: string;
      browser?: string;
      environment?: string;
    },
  ): Promise<ProjectDto> {
    const project = await this.projectRead.getWithLatestVariantStatuses(
      projectName,
      branchName,
      { skip: pagination.skip, take: pagination.take },
      filters,
    );
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }

    // The project payload carries its own pagination meta instead of the
    // { data, meta } envelope, so derive the same truthful page the shared
    // paginatedQuery helper would report.
    const page = pagination.skipProvided
      ? Math.floor(pagination.skip / pagination.take) + 1
      : (pagination.page ?? 1);
    const meta = createPaginatedResponse(
      [],
      page,
      pagination.take,
      project.total,
    ).meta;

    return mapProjectDetailToDto(project, meta);
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

  async updateRetention(
    projectName: string,
    data: {
      baselineRevisionLimit?: number | null;
      runHistoryDays?: number | null;
      orphanGraceHours?: number | null;
      storageQuotaBytes?: bigint | null;
      quotaSoftPercent?: number | null;
    },
  ): Promise<void> {
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    await this.projects.updateRetention(projectName, data);
  }

  async rename(
    projectName: string,
    newName: string,
    actor?: string,
  ): Promise<void> {
    const trimmed = newName.trim();
    if (trimmed === projectName) return;
    const existing = await this.projects.findByName(projectName);
    if (!existing) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    try {
      await this.projects.rename(projectName, trimmed);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError(
          `Project "${trimmed}" already exists`,
          'CONFLICT',
        );
      }
      throw error;
    }
    await this.audit.record({
      actor: actor ?? null,
      action: AUDIT_ACTIONS.projectRename,
      projectName: trimmed,
      targetType: 'project',
      targetId: existing.id,
      metadata: { renamedFrom: projectName },
    });
  }

  async updateProjectGroup(
    projectName: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    if (dto.groupId === undefined && dto.defaultBranchName === undefined) {
      return this.getWithLatestVariantStatuses(projectName);
    }
    if (dto.defaultBranchName !== undefined) {
      await this.branchCommands.setDefault(projectName, dto.defaultBranchName);
    }
    if (dto.groupId === undefined) {
      return this.getWithLatestVariantStatuses(projectName);
    }
    const groupId = dto.groupId;
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

  async deleteProject(projectName: string, actor?: string): Promise<void> {
    // Existence is resolved (and NOT_FOUND thrown) inside the deletion's
    // transaction — TestDeletionService owns the single read of the project.
    await this.testDeletion.deleteProject(projectName, actor);
  }
}
