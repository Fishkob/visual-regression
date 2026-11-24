import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { projectIdFilter } from '@/prisma/project-scope-filter';
import type { ProjectScope } from '@common/domain/project-scope';
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
  teamId?: string;
  isShared?: boolean;
  baselineRevisionLimit?: number | null;
  runHistoryDays?: number | null;
  branchRetentionDays?: number | null;
  orphanGraceHours?: number | null;
  storageQuotaBytes?: bigint | null;
  quotaSoftPercent?: number | null;
  storageUsedBytes?: bigint | null;
  storageUsageComputedAt?: Date | null;
  pixelDiffThreshold?: number | null;
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

  // Scoped read (ADR-082): the caller's own projects plus the shared ones. The
  // scope is a required argument so a list endpoint cannot be written without
  // deciding who may see it.
  async findAll(
    pagination: { skip: number; take: number } | undefined,
    scope: ProjectScope,
  ): Promise<{ data: ProjectData[]; total: number }> {
    const { data, total } = await findManyWithCount<ProjectData>(
      this.client.project,
      {
        where: projectIdFilter(scope),
        orderBy: { createdAt: 'desc' },
        skip: pagination?.skip,
        take: pagination?.take,
      },
    );
    return { data, total };
  }

  // Standalone write by design: the project-create endpoint runs outside a
  // StateChangeWorkflow transaction (creating a project mutates no test status),
  // so this primitive deliberately skips assertWritable. The owner is a required
  // argument because the column is `NOT NULL` (ADR-083): a project without a
  // team is not a state the database allows, so it is not a parameter here
  // either.
  async create(name: string, teamId: string): Promise<ProjectData> {
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
          teamId,
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

  // The one writer of `Project.teamId` (ADR-082). The owner is mandatory
  // (ADR-083), so moving a project is always "from one team to another"; the
  // shared state is a separate column and a separate route.
  async updateTeamByName(
    projectName: string,
    teamId: string,
  ): Promise<ProjectData> {
    return this.client.project.update({
      where: { name: projectName },
      data: { teamId },
    });
  }

  // The one writer of `Project.isShared` (ADR-083). Widening the read is a
  // governance decision, which is why it is its own audited route and not a
  // field on the generic project patch.
  async updateVisibilityByName(
    projectName: string,
    isShared: boolean,
  ): Promise<ProjectData> {
    return this.client.project.update({
      where: { name: projectName },
      data: { isShared },
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

  async updatePixelDiffThreshold(
    name: string,
    pixelDiffThreshold: number | null,
  ): Promise<void> {
    await this.client.project.update({
      where: { name },
      data: { pixelDiffThreshold },
    });
  }

  async updateRetention(
    name: string,
    data: {
      baselineRevisionLimit?: number | null;
      runHistoryDays?: number | null;
      branchRetentionDays?: number | null;
      orphanGraceHours?: number | null;
      storageQuotaBytes?: bigint | null;
      quotaSoftPercent?: number | null;
    },
  ): Promise<void> {
    await this.client.project.update({ where: { name }, data });
  }

  // The branch sweep's project list: every project with the override it stored.
  // The sweep skips the ones whose effective window is 0, which is the default
  // (opt-in — see ADR-067). `select` keeps the read to the two columns the sweep
  // needs; a project row carries quota and storage bytes that no sweep reads.
  async listBranchRetentionProjects(): Promise<
    { id: string; branchRetentionDays: number | null }[]
  > {
    return this.client.project.findMany({
      select: { id: true, branchRetentionDays: true },
      orderBy: { name: 'asc' },
    });
  }

  // Standalone write by design: the cached usage is derived state, so it is
  // written on the bare connection by the quota check that just recomputed it —
  // never inside the upload's transaction, where the Project row would serialize
  // every concurrent upload of the same project. See ADR-060.
  async recordStorageUsage(
    projectId: string,
    bytes: bigint,
    computedAt: Date,
  ): Promise<void> {
    await this.client.project.update({
      where: { id: projectId },
      data: { storageUsedBytes: bytes, storageUsageComputedAt: computedAt },
    });
  }

  // Integral charge for bytes the quota check just admitted. A single statement
  // outside the upload's transaction: the row lock is held for microseconds,
  // not for the length of the upload, so concurrent uploads of one project are
  // not serialized. `increment` keeps two concurrent charges from overwriting
  // each other. Null is never incremented into: the check derives and records a
  // value before it charges.
  async addStorageUsage(projectId: string, bytes: bigint): Promise<void> {
    await this.client.project.updateMany({
      where: { id: projectId },
      data: { storageUsedBytes: { increment: bytes } },
    });
  }

  async deleteByName(projectName: string): Promise<void> {
    this.assertWritable();
    await this.client.project.delete({ where: { name: projectName } });
  }
}
