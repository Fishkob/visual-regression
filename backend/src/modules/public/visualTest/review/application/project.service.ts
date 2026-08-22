import { Injectable } from '@nestjs/common';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ProjectReadRepository } from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { DomainError } from '@common/domain/domain-error';
import { PaginationDto } from '@common/dto/pagination.dto';
import { paginatedQuery } from '@common/utils/paginated-query';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly projectRead: ProjectReadRepository,
    private readonly testDeletion: TestDeletionService,
  ) {}

  async getAllWithPendingFlag(pagination: PaginationDto) {
    return paginatedQuery(
      (args) => this.projectRead.getAllWithPendingFlag(args),
      pagination,
      (p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        pending: p.hasPendingComparisons,
      }),
    );
  }

  async findAll(pagination: PaginationDto) {
    return paginatedQuery((args) => this.projects.findAll(args), pagination);
  }

  async getWithLatestVariantStatuses(projectName: string) {
    const project =
      await this.projectRead.getWithLatestVariantStatuses(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }

    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      visualTests: project.variants.map((v) => ({
        name: v.testName,
        kind: v.kind,
        variant: {
          viewport: v.viewport,
          browser: v.browser,
          environment: v.environment,
        },
        latestStatus: v.status,
      })),
    };
  }

  async create(
    name: string,
  ): Promise<{ id: string; name: string; createdAt: Date }> {
    return this.projects.create(name);
  }

  async deleteProject(projectName: string): Promise<void> {
    // Existence is resolved (and NOT_FOUND thrown) inside the deletion's
    // transaction — TestDeletionService owns the single read of the project.
    await this.testDeletion.deleteProject(projectName);
  }
}
