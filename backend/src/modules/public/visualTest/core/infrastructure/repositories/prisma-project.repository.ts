import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { findManyWithCount } from '@/prisma/find-many-with-count';
import { DomainError } from '@common/domain/domain-error';
import { PrismaClient } from '@/prisma/client';
import { DEFAULT_BRANCH_NAME } from '@public/visualTest/core/domain/constants/branch.constants';

// The one wording for a missing project. Readers that resolve through a
// different query (the paginated read models) use it too, so "not found" cannot
// drift between endpoints.
export function projectNotFound(projectName: string): DomainError {
  return new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
}

export interface ProjectData {
  id: string;
  name: string;
  createdAt: Date;
  groupId?: string | null;
  baselineRevisionLimit?: number | null;
  runHistoryDays?: number | null;
  orphanGraceHours?: number | null;
  storageQuotaBytes?: bigint | null;
  quotaSoftPercent?: number | null;
  requiredApprovals?: number;
}

@Injectable()
export class ProjectRepository extends BaseRepository {
  async findByTestId(testId: string): Promise<ProjectData | null> {
    return this.client.project.findFirst({
      where: { branches: { some: { tests: { some: { id: testId } } } } },
    });
  }

  async findByName(projectName: string): Promise<ProjectData | null> {
    const result = await this.client.project.findUnique({
      where: { name: projectName },
    });
    return result ?? null;
  }

  // The 404-shaped lookup. Readers that need the project to exist call this
  // instead of re-throwing the same DomainError: the message, the error code and
  // the shape of the query live here, so a new caller cannot word "not found"
  // differently or forget the null check.
  async requireByName(projectName: string): Promise<ProjectData> {
    const project = await this.findByName(projectName);
    if (!project) throw projectNotFound(projectName);
    return project;
  }

  async findAll(pagination?: {
    skip: number;
    take: number;
  }): Promise<{ data: ProjectData[]; total: number }> {
    const { data, total } = await findManyWithCount<ProjectData>(
      this.client.project,
      {
        orderBy: { createdAt: 'desc' },
        skip: pagination?.skip,
        take: pagination?.take,
      },
    );
    return { data, total };
  }

  // Standalone write by design: the project-create endpoint runs outside a
  // StateChangeWorkflow transaction (creating a project mutates no test status),
  // so this primitive deliberately skips assertWritable.
  async create(name: string, groupId?: string | null): Promise<ProjectData> {
    const existing = await this.client.project.findUnique({
      where: { name },
    });
    if (existing) {
      throw new DomainError('"name" already exists', 'E_UNIQUE_CONSTRAINT');
    }
    return (this.client as PrismaClient).$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name,
          ...(groupId ? { groupId } : {}),
          branches: { create: { name: DEFAULT_BRANCH_NAME } },
        },
        include: { branches: { select: { id: true } } },
      });
      return tx.project.update({
        where: { id: project.id },
        data: { defaultBranchId: project.branches[0].id },
      });
    });
  }

  // Standalone write: moving a project between groups does not mutate test
  // state, so it deliberately skips assertWritable like create.
  async updateGroupByName(
    projectName: string,
    groupId: string | null,
  ): Promise<ProjectData> {
    return this.client.project.update({
      where: { name: projectName },
      data: { groupId },
    });
  }

  // Standalone write: renaming does not mutate test state. Historical audit and
  // approval rows keep the old name; the project row is the identity.
  async rename(name: string, newName: string): Promise<ProjectData> {
    return this.client.project.update({
      where: { name },
      data: { name: newName },
    });
  }

  async updateRequiredApprovals(
    name: string,
    requiredApprovals: number,
  ): Promise<void> {
    await this.client.project.update({
      where: { name },
      data: { requiredApprovals },
    });
  }

  async updateRetention(
    name: string,
    data: {
      baselineRevisionLimit?: number | null;
      runHistoryDays?: number | null;
      orphanGraceHours?: number | null;
      storageQuotaBytes?: bigint | null;
      quotaSoftPercent?: number | null;
    },
  ): Promise<void> {
    await this.client.project.update({ where: { name }, data });
  }

  async getOrCreate(name: string): Promise<ProjectData> {
    this.assertWritable();
    return this.client.project.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  async deleteByName(projectName: string): Promise<void> {
    this.assertWritable();
    await this.client.project.delete({ where: { name: projectName } });
  }
}
