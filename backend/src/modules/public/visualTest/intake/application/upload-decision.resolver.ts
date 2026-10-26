import { Injectable } from '@nestjs/common';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { BranchTestRepository } from '@public/visualTest/core/infrastructure/repositories/branch-test.repository';
import { BranchBaselineResolver } from '@public/visualTest/core/application/services/branch-baseline-resolver.service';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import {
  decideOutcome,
  type BaselineInfo,
  type UploadDecision,
} from '@public/visualTest/core/domain/policies/upload-decision-policy';
import {
  BranchResolver,
  type ResolvedBranch,
} from '@public/visualTest/core/application/services/branch-resolver.service';
import type { TestKind } from '@common/domain/test-kind';
import {
  UploadParams,
  toVariant,
} from '@public/visualTest/intake/application/upload-params';

// Single owner of "what is this upload's decision": the read-only gate
// resolution (identical fast path) and the stored-path resolution (after the
// file is written) both compare the upload's hash against the *effective*
// baseline. The two shapes differ in one respect only: the gate peeks (it never
// clones, refreshes or pins) and therefore declines whenever the branch-local
// clone still needs the refresh the stored path would perform, so the
// side-effect-free contract is structural here, not a comment in the
// orchestrator.
@Injectable()
export class UploadDecisionResolver {
  constructor(
    private readonly tests: UnifiedTestRepository,
    private readonly branches: BranchResolver,
    private readonly baselines: BranchBaselineResolver,
    private readonly branchTests: BranchTestRepository,
  ) {}

  // Read-only *peek*, not a decision: it answers "does this look identical right
  // now?" without creating a branch, test, variant or clone, and its answer is
  // allowed to be stale. The authoritative answer comes from `resolveStored`
  // inside the workflow transaction, which is why the upload path calls the peek
  // once to decide whether to store at all and then re-resolves — the name says
  // which of the two a reader is looking at.
  async peekIdentical(
    params: UploadParams,
    fileHash: string,
  ): Promise<{ testId: string; branch: ResolvedBranch } | null> {
    const branch = await this.branches.findReadOrNull(
      params.projectName,
      params.branch,
    );
    if (!branch || branch.isArchived) return null;
    const test = await this.tests.findByBranchAndTestName(
      branch.branchId,
      params.testName,
    );
    if (!test) return null;
    // The gate is read-only: it must never create a branch, test, variant or
    // clone. But it compares against the *effective* baseline (the clone follows
    // its target chain), and it declines while the clone still needs a refresh —
    // the stored path owns that write, so short-circuiting here would skip it.
    const effective = await this.baselines.peekEffectiveBaseline({
      testId: test.id,
      testName: params.testName,
      branchId: branch.branchId,
      variant: toVariant(params),
    });
    if (
      !effective ||
      effective.needsRefresh ||
      effective.imageHash !== fileHash
    ) {
      return null;
    }
    return { testId: test.id, branch };
  }

  // Stored-path resolution: ensures the project/test row, resolves the effective
  // (owned or inherited) baseline and decides. Runs inside the workflow
  // transaction so a concurrent baseline replacement between gate and
  // transaction resolves to its new state atomically, and so the inherited-clone
  // refresh is atomic with the enqueue.
  async resolveStored(
    kind: TestKind,
    params: UploadParams,
    fileHash: string,
  ): Promise<{ decision: UploadDecision; branch: ResolvedBranch }> {
    const branch = await this.branches.resolveForUpload(
      params.projectName,
      params.branch,
      params.targetBranch,
    );
    await this.branchTests.assertKindMatchesChain(
      branch.branchId,
      params.testName,
      kind,
    );
    const { testId } = await this.tests.ensureTest(
      branch.branchId,
      params.testName,
      kind,
    );
    const baseline = await this.baselines.resolveForVariant({
      testId,
      testName: params.testName,
      branchId: branch.branchId,
      variant: toVariant(params),
    });
    return {
      decision: this.decide(testId, baseline, fileHash),
      branch,
    };
  }

  private decide(
    testId: string,
    baseline: ScreenshotEntity | null,
    fileHash: string,
  ): UploadDecision {
    return decideOutcome(
      testId,
      fileHash,
      baseline ? this.toBaseline(baseline) : null,
    );
  }

  private toBaseline(entity: ScreenshotEntity): BaselineInfo {
    return {
      id: entity.id,
      contentHash: entity.imageHash,
      fileUrl: entity.imageUrl,
    };
  }
}
