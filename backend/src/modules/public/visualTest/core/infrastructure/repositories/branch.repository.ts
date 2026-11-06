import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { Prisma, ComparisonStatus } from '@/prisma/client';
import { DEFAULT_BRANCH_NAME } from '@public/visualTest/core/domain/constants/branch.constants';
import { normalizeBranchName } from '@public/visualTest/core/domain/value-objects/branch-name.vo';

// At most one activity write per branch per window. The touch runs on the
// upload path, so the guard turns it into a no-op statement (no row lock) for
// every upload but the first in the window; the sweep's cutoff is measured in
// days, so minutes of imprecision are irrelevant.
const ACTIVITY_TOUCH_WINDOW_MS = 5 * 60 * 1000;

export interface BranchRow {
  id: string;
  projectId: string;
  name: string;
  targetBranchId: string | null;
  isArchived: boolean;
  createdAt: Date;
}

const BRANCH_SELECT = {
  id: true,
  projectId: true,
  name: true,
  targetBranchId: true,
  isArchived: true,
  createdAt: true,
} as const;

@Injectable()
export class BranchRepository extends BaseRepository {
  async findDefault(projectId: string): Promise<BranchRow | null> {
    return this.client.branch.findFirst({
      where: { projectId, defaultFor: { id: projectId } },
      select: BRANCH_SELECT,
    });
  }

  async findByProjectAndName(
    projectId: string,
    name: string,
  ): Promise<BranchRow | null> {
    return this.client.branch.findUnique({
      where: { projectId_name: { projectId, name } },
      select: BRANCH_SELECT,
    });
  }

  async findById(id: string): Promise<BranchRow | null> {
    return this.client.branch.findUnique({
      where: { id },
      select: BRANCH_SELECT,
    });
  }

  async createDefault(projectId: string): Promise<BranchRow> {
    this.assertWritable();
    const branch = await this.client.branch.create({
      data: { projectId, name: DEFAULT_BRANCH_NAME },
      select: BRANCH_SELECT,
    });
    await this.client.project.update({
      where: { id: projectId },
      data: { defaultBranchId: branch.id },
    });
    return branch;
  }

  async create(
    projectId: string,
    name: string,
    targetBranchId: string | null,
  ): Promise<BranchRow> {
    this.assertWritable();
    return this.client.branch.create({
      data: { projectId, name, targetBranchId },
      select: BRANCH_SELECT,
    });
  }

  async setArchived(id: string, isArchived: boolean): Promise<void> {
    this.assertWritable();
    await this.client.branch.update({ where: { id }, data: { isArchived } });
  }

  async setTarget(id: string, targetBranchId: string | null): Promise<void> {
    this.assertWritable();
    await this.client.branch.update({
      where: { id },
      data: { targetBranchId },
    });
  }

  async setDefault(projectId: string, branchId: string): Promise<void> {
    this.assertWritable();
    await this.client.project.update({
      where: { id: projectId },
      data: { defaultBranchId: branchId },
    });
  }

  async list(
    projectId: string,
    includeArchived: boolean,
  ): Promise<BranchRow[]> {
    return this.client.branch.findMany({
      where: { projectId, ...(includeArchived ? {} : { isArchived: false }) },
      select: BRANCH_SELECT,
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
  }

  async findTargetChainIds(branchId: string): Promise<string[]> {
    const chain: string[] = [];
    let cursor: string | null = branchId;
    const visited = new Set<string>();
    while (cursor) {
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const row = await this.findById(cursor);
      if (!row) break;
      if (row.targetBranchId) {
        chain.push(row.targetBranchId);
        cursor = row.targetBranchId;
        continue;
      }
      const defaultBranch = await this.findDefault(row.projectId);
      if (defaultBranch && defaultBranch.id !== row.id) {
        chain.push(defaultBranch.id);
      }
      break;
    }
    return chain;
  }

  // The branch this one inherits from right now: its explicit target, else the
  // project's current default (null for the default branch itself, which has no
  // target). Used to label an inherited baseline with the branch it follows.
  async findEffectiveTargetName(branchId: string): Promise<string | null> {
    const row = await this.findById(branchId);
    if (!row?.targetBranchId) {
      if (!row) return null;
      const defaultBranch = await this.findDefault(row.projectId);
      return defaultBranch && defaultBranch.id !== row.id
        ? defaultBranch.name
        : null;
    }
    const target = await this.findById(row.targetBranchId);
    return target?.name ?? null;
  }

  async markAllOwned(branchId: string): Promise<void> {
    this.assertWritable();
    await this.client.unifiedVariant.updateMany({
      where: { test: { branchId } },
      data: { isInherited: false },
    });
  }

  async deleteById(id: string): Promise<void> {
    this.assertWritable();
    await this.client.branch.delete({ where: { id } });
  }

  // Branches that explicitly inherit from this one. Deleting the target would
  // silently re-point them at the project default (`onDelete: SetNull`), which is
  // exactly the automatic re-targeting the design rules out — so deletion asks
  // the caller to retarget them first.
  async findDependentNames(branchId: string): Promise<string[]> {
    const rows = await this.client.branch.findMany({
      where: { targetBranchId: branchId },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => row.name);
  }

  async findIdsByProjectId(projectId: string): Promise<string[]> {
    const rows = await this.client.branch.findMany({
      where: { projectId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  // A standalone write by design: no domain row changes, so it must not join (or
  // open) a state-change transaction. The upload path calls it after the upload
  // committed, and a failure there must not turn a stored upload into a 500 —
  // the caller swallows it.
  //
  // One statement, because resolving the branch first would add three reads to
  // the hottest endpoint: `branchName` absent means "the project's default
  // branch", and the default is read from the project row in the same statement.
  async touchActivity(projectName: string, branchName?: string): Promise<void> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - ACTIVITY_TOUCH_WINDOW_MS);
    const name = normalizeBranchName(branchName) ?? null;
    await this.client.$executeRaw(Prisma.sql`
      UPDATE "Branch" b
      SET "lastActivityAt" = ${now}
      FROM "Project" p
      WHERE p."id" = b."projectId"
        AND p."name" = ${projectName}
        AND b."lastActivityAt" < ${cutoff}
        AND (
          (${name}::text IS NULL AND p."defaultBranchId" = b."id")
          OR (${name}::text IS NOT NULL AND b."name" = ${name}::text)
        )
    `);
  }

  // The branch-retention candidate set. Archived branches are deliberately out:
  // archiving is the explicit "keep this one", and the sweep is destructive, so
  // the reversible action must be able to shield a branch from the irreversible
  // one. A branch that another branch names as its target is out too — the
  // deletion service refuses it, and its dependants are the ones that decide
  // when it may go. Any unreviewed comparison keeps the branch alive: the sweep
  // must never destroy review work the user did not see.
  async findInactive(projectId: string, cutoff: Date): Promise<BranchRow[]> {
    const where = await this.inactiveWhere(projectId, cutoff);
    if (!where) return [];
    return this.client.branch.findMany({
      where,
      select: BRANCH_SELECT,
      orderBy: [{ lastActivityAt: 'asc' }, { name: 'asc' }],
    });
  }

  // The dry run's number: the same predicate, so the preview cannot promise a
  // different set than the sweep deletes.
  async countInactive(projectId: string, cutoff: Date): Promise<number> {
    const where = await this.inactiveWhere(projectId, cutoff);
    if (!where) return 0;
    return this.client.branch.count({ where });
  }

  private async inactiveWhere(
    projectId: string,
    cutoff: Date,
  ): Promise<Prisma.BranchWhereInput | null> {
    const defaultBranch = await this.findDefault(projectId);
    if (!defaultBranch) return null;
    return {
      projectId,
      isArchived: false,
      id: { not: defaultBranch.id },
      // Older than the window as well: an upload writes `lastActivityAt` only
      // every few minutes, so a branch created a minute ago must not rely on it
      // to look young.
      createdAt: { lt: cutoff },
      lastActivityAt: { lt: cutoff },
      derivedBranches: { none: {} },
      tests: {
        none: {
          comparisons: { some: { status: ComparisonStatus.PENDING_APPROVAL } },
        },
      },
    };
  }
}
