import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { DEFAULT_BRANCH_NAME } from '@public/visualTest/core/domain/constants/branch.constants';

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
}
