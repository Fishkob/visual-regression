import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import {
  BranchRepository,
  type BranchRow,
} from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchDeletionService } from '@public/visualTest/core/application/services/branch-deletion.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { noop } from '@public/visualTest/core/application/services/state-change-options';
import type { UpdateBranchDto } from '@public/visualTest/review/presentation/dto/branch.dto';
import { normalizeBranchName } from '@public/visualTest/core/domain/value-objects/branch-name.vo';

// Owns the branch lifecycle mutations: archive/unarchive, retarget, set default
// and delete. Every write goes through the state-change workflow (the same
// transaction the status recompute rides) so a promotion flips the branch's
// variants to owned atomically with the default switch.
//
// The validation reads live INSIDE that transaction. Validating a target before
// opening the write transaction is a time-of-check/time-of-use hole: two
// concurrent retargets (A→B, B→A) both validate against the old graph and both
// commit, persisting a cycle nothing detects afterwards. Inside the transaction
// the second one aborts on the serialization conflict, retries, and sees the
// committed edge — and one request is one transaction, so a failing retarget
// cannot leave the archive half applied.
@Injectable()
export class BranchCommandService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly branches: BranchRepository,
    private readonly resolver: BranchResolver,
    private readonly deletion: BranchDeletionService,
    private readonly workflow: StateChangeWorkflow,
  ) {}

  async apply(
    projectName: string,
    branchName: string,
    body: UpdateBranchDto,
  ): Promise<{ success: boolean }> {
    const hasArchive = body.isArchived !== undefined;
    const hasTarget = body.targetBranch !== undefined;
    if (!hasArchive && !hasTarget) {
      throw new DomainError(
        'Nothing to update — supply isArchived and/or targetBranch',
        'BAD_REQUEST',
      );
    }
    const project = await this.resolveProject(projectName);
    const branch = await this.resolveFeatureBranch(projectName, branchName);
    const wantedTarget = hasTarget
      ? normalizeBranchName(body.targetBranch)
      : undefined;
    const isArchived = body.isArchived;

    await this.workflow.executeStateChange(async () => {
      if (isArchived !== undefined) {
        await this.branches.setArchived(branch.id, isArchived);
      }
      if (hasTarget) {
        await this.writeTarget(project.id, branch, wantedTarget);
      }
      return noop();
    });
    return { success: true };
  }

  async setArchived(
    projectName: string,
    branchName: string,
    isArchived: boolean,
  ): Promise<void> {
    const branch = await this.resolveFeatureBranch(projectName, branchName);
    await this.workflow.executeStateChange(async () => {
      await this.branches.setArchived(branch.id, isArchived);
      return noop();
    });
  }

  async setTarget(
    projectName: string,
    branchName: string,
    targetBranchName: string | null,
  ): Promise<void> {
    const project = await this.resolveProject(projectName);
    const branch = await this.resolveFeatureBranch(projectName, branchName);
    // `targetBranch` arrives in a request body, so it never passed the query
    // pipe: normalise it here or a stray space turns into a confusing 404.
    const wantedTarget = normalizeBranchName(targetBranchName);
    await this.workflow.executeStateChange(async () => {
      await this.writeTarget(project.id, branch, wantedTarget);
      return noop();
    });
  }

  async setDefault(projectName: string, branchName: string): Promise<void> {
    const project = await this.resolveProject(projectName);
    const wantedName = normalizeBranchName(branchName);
    if (!wantedName) {
      throw new DomainError('Branch name is required', 'BAD_REQUEST');
    }
    const branch = await this.branches.findByProjectAndName(
      project.id,
      wantedName,
    );
    if (!branch) {
      throw new DomainError(`Branch "${wantedName}" not found`, 'NOT_FOUND');
    }
    if (branch.isArchived) {
      throw new DomainError(
        'An archived branch cannot be the default',
        'CONFLICT',
      );
    }
    await this.workflow.executeStateChange(async () => {
      // Re-read inside the transaction: an archive racing the promotion must not
      // leave an archived branch as the project default.
      const fresh = await this.branches.findById(branch.id);
      if (!fresh) {
        throw new DomainError(`Branch "${wantedName}" not found`, 'NOT_FOUND');
      }
      if (fresh.isArchived) {
        throw new DomainError(
          'An archived branch cannot be the default',
          'CONFLICT',
        );
      }
      await this.branches.setTarget(branch.id, null);
      await this.branches.setDefault(project.id, branch.id);
      await this.branches.markAllOwned(branch.id);
      return noop();
    });
  }

  async delete(projectName: string, branchName: string): Promise<void> {
    const branch = await this.resolveFeatureBranch(projectName, branchName);
    await this.deletion.delete(branch.projectId, branch.id);
  }

  // Resolve + validate + write a target, all inside the caller's transaction, so
  // the "exists / same project / not archived / no cycle" checks cannot go stale
  // between validation and write.
  private async writeTarget(
    projectId: string,
    branch: BranchRow,
    wantedTarget?: string,
  ): Promise<void> {
    if (!wantedTarget) {
      await this.branches.setTarget(branch.id, null);
      return;
    }
    const defaultBranch = await this.branches.findDefault(projectId);
    if (wantedTarget === defaultBranch?.name) {
      await this.branches.setTarget(branch.id, null);
      return;
    }
    const target = await this.branches.findByProjectAndName(
      projectId,
      wantedTarget,
    );
    if (!target) {
      throw new DomainError(
        `Target branch "${wantedTarget}" not found`,
        'NOT_FOUND',
      );
    }
    await this.resolver.assertValidTarget(projectId, branch.id, target.id);
    await this.branches.setTarget(branch.id, target.id);
  }

  private async resolveProject(projectName: string): Promise<{ id: string }> {
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    return project;
  }

  private async resolveFeatureBranch(projectName: string, branchName: string) {
    const resolved = await this.resolver.resolveRead(projectName, branchName);
    if (resolved.isDefault) {
      throw new DomainError(
        'The default branch cannot be modified this way',
        'CONFLICT',
      );
    }
    const branch = await this.branches.findByProjectAndName(
      resolved.projectId,
      branchName,
    );
    if (!branch) {
      throw new DomainError(`Branch "${branchName}" not found`, 'NOT_FOUND');
    }
    return branch;
  }
}
