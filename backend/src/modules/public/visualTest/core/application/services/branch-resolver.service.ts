import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { normalizeBranchName } from '@public/visualTest/core/domain/value-objects/branch-name.vo';
import { MAX_BRANCH_CHAIN_DEPTH } from '@public/visualTest/core/domain/constants/branch.constants';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';

export interface ResolvedBranch {
  projectId: string;
  branchId: string;
  branchName: string;
  isDefault: boolean;
  isArchived: boolean;
}

@Injectable()
export class BranchResolver {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly branches: BranchRepository,
  ) {}

  async resolveRead(
    projectName: string,
    branchName?: string,
  ): Promise<ResolvedBranch> {
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    const defaultBranch = await this.branches.findDefault(project.id);
    if (!defaultBranch) {
      throw new DomainError(
        `Project "${projectName}" has no default branch`,
        'NOT_FOUND',
      );
    }
    // Normalise here as well as in the pipe: the upload path resolves a raw
    // multipart field, and a name that is created must be a name that can be
    // read back. A malformed name is a 400, not a confusing 404.
    const wantedName = normalizeBranchName(branchName);
    if (!wantedName || wantedName === defaultBranch.name) {
      return {
        projectId: project.id,
        branchId: defaultBranch.id,
        branchName: defaultBranch.name,
        isDefault: true,
        isArchived: defaultBranch.isArchived,
      };
    }
    const branch = await this.branches.findByProjectAndName(
      project.id,
      wantedName,
    );
    if (!branch) {
      throw new DomainError(
        `Branch "${wantedName}" not found in project "${projectName}"`,
        'NOT_FOUND',
      );
    }
    return {
      projectId: project.id,
      branchId: branch.id,
      branchName: branch.name,
      isDefault: false,
      isArchived: branch.isArchived,
    };
  }

  async findReadOrNull(
    projectName: string,
    branchName?: string,
  ): Promise<ResolvedBranch | null> {
    try {
      return await this.resolveRead(projectName, branchName);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  async resolveForUpload(
    projectName: string,
    branchName?: string,
    targetBranchName?: string,
  ): Promise<ResolvedBranch> {
    const project = await this.projects.getOrCreate(projectName);
    let defaultBranch = await this.branches.findDefault(project.id);
    defaultBranch ??= await this.branches.createDefault(project.id);

    const name = normalizeBranchName(branchName) ?? defaultBranch.name;
    if (name === defaultBranch.name) {
      return {
        projectId: project.id,
        branchId: defaultBranch.id,
        branchName: defaultBranch.name,
        isDefault: true,
        isArchived: defaultBranch.isArchived,
      };
    }

    const existing = await this.branches.findByProjectAndName(project.id, name);
    if (existing) {
      if (existing.isArchived) {
        throw new DomainError(
          `Branch "${name}" is archived — unarchive it before uploading`,
          'CONFLICT',
        );
      }
      // `targetBranch` only applies when the branch is created. Accepting a
      // different target here would silently ignore it (the CI keeps uploading
      // against an inheritance it did not get), so a mismatch is a conflict the
      // caller has to resolve through the round branches endpoint.
      const requestedTarget = normalizeBranchName(targetBranchName);
      if (requestedTarget !== undefined) {
        const requestedTargetId =
          requestedTarget === defaultBranch.name
            ? null
            : await this.requireTargetId(project.id, requestedTarget);
        if (requestedTargetId !== existing.targetBranchId) {
          throw new DomainError(
            `Branch "${name}" already exists with a different target — change it with PATCH /projects/:projectName/branches`,
            'CONFLICT',
          );
        }
      }
      return {
        projectId: project.id,
        branchId: existing.id,
        branchName: existing.name,
        isDefault: false,
        isArchived: false,
      };
    }

    const requestedTarget = normalizeBranchName(targetBranchName);
    const targetBranchId =
      requestedTarget && requestedTarget !== defaultBranch.name
        ? await this.requireTargetId(project.id, requestedTarget)
        : null;
    // A new branch must not create a chain the read path would truncate. The
    // Branch View CTE stops after MAX_BRANCH_CHAIN_DEPTH hops, so a branch
    // created on a deeper chain would silently miss the deepest ancestors'
    // baselines while the write path (findTargetChainIds) still walks them.
    if (targetBranchId) {
      await this.assertTargetChainDepth(targetBranchId);
    }

    const created = await this.branches.create(
      project.id,
      name,
      targetBranchId,
    );
    return {
      projectId: project.id,
      branchId: created.id,
      branchName: created.name,
      isDefault: false,
      isArchived: false,
    };
  }

  // The project's default branch name, for callers that already hold the
  // project row and only need the label (a full resolveRead would re-query the
  // project for nothing).
  async resolveDefaultName(projectId: string): Promise<string> {
    const defaultBranch = await this.branches.findDefault(projectId);
    if (!defaultBranch) {
      throw new DomainError('Project has no default branch', 'NOT_FOUND');
    }
    return defaultBranch.name;
  }

  // The branch this resolved branch inherits from right now (null for the
  // default branch, which has no target). The "default means no target" rule
  // stays in the resolver so reads do not re-derive it.
  async resolveEffectiveTargetName(
    resolved: ResolvedBranch,
  ): Promise<string | null> {
    if (resolved.isDefault) return null;
    return this.branches.findEffectiveTargetName(resolved.branchId);
  }

  // Lookup + the "usable target" rule (exists, not archived) in one place, so a
  // new branch and a retarget accept exactly the same targets.
  private async requireTargetId(
    projectId: string,
    targetName: string,
  ): Promise<string> {
    const target = await this.branches.findByProjectAndName(
      projectId,
      targetName,
    );
    if (!target) {
      throw new DomainError(
        `Target branch "${targetName}" not found`,
        'NOT_FOUND',
      );
    }
    if (target.isArchived) {
      throw new DomainError(
        `Target branch "${targetName}" is archived`,
        'CONFLICT',
      );
    }
    return target.id;
  }

  async assertValidTarget(
    projectId: string,
    branchId: string,
    targetBranchId: string,
  ): Promise<void> {
    if (branchId === targetBranchId) {
      throw new DomainError('A branch cannot target itself', 'CONFLICT');
    }
    const target = await this.branches.findById(targetBranchId);
    if (target?.projectId !== projectId) {
      throw new DomainError('Target branch not found', 'NOT_FOUND');
    }
    if (target.isArchived) {
      throw new DomainError('Target branch is archived', 'CONFLICT');
    }

    let cursor: string | null = targetBranchId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === branchId) {
        throw new DomainError('Branch target creates a cycle', 'CONFLICT');
      }
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const row = await this.branches.findById(cursor);
      cursor = row?.targetBranchId ?? null;
    }

    // Same depth bound as creation (and the one the Branch View CTE enforces).
    await this.assertTargetChainDepth(targetBranchId);
  }

  // The effective ancestors of a target, resolved exactly like the Branch View
  // CTE (explicit target, else the project default). `findTargetChainIds` is
  // cycle-guarded, and a cycle cannot reach here on the retarget path because
  // the walk above already threw.
  private async assertTargetChainDepth(targetBranchId: string): Promise<void> {
    const ancestors = await this.branches.findTargetChainIds(targetBranchId);
    if (ancestors.length > MAX_BRANCH_CHAIN_DEPTH) {
      throw new DomainError(
        `Branch target chain is too deep (max ${MAX_BRANCH_CHAIN_DEPTH})`,
        'CONFLICT',
      );
    }
  }
}
