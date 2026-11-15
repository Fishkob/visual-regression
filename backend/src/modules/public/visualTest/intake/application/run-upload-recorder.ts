import { Injectable } from '@nestjs/common';
import type { Run } from '@/prisma/client';
import type { ComparisonOutcome } from '@common/domain/upload-outcome';
import type { TestKind } from '@common/domain/test-kind';
import type { ResolvedBranch } from '@public/visualTest/core/application/services/branch-resolver.service';
import { RunResolver } from '@public/visualTest/core/application/services/run-resolver.service';
import type { UploadParams } from '@public/visualTest/intake/application/upload-params';

// One owner of "which run does this upload belong to, and how is the upload
// recorded on it". The identical fast path and the stored path both resolve and
// record, so the argument mapping lives here instead of twice in UploadIntake —
// and the intake no longer needs the RunResolver itself.
@Injectable()
export class RunUploadRecorder {
  constructor(private readonly runs: RunResolver) {}

  resolveForUpload(
    branch: ResolvedBranch,
    params: UploadParams,
  ): Promise<Run | null> {
    return this.runs.resolveForUpload({
      projectId: branch.projectId,
      branchId: branch.branchId,
      runKey: params.runKey,
      commitSha: params.commitSha,
      commitMessage: params.commitMessage,
      ciUrl: params.ciUrl,
    });
  }

  recordUpload(
    runId: string,
    testId: string,
    kind: TestKind,
    params: UploadParams,
    contentHash: string,
    outcome: ComparisonOutcome,
  ): Promise<void> {
    return this.runs.recordUpload({
      runId,
      testId,
      kind,
      viewport: params.viewport,
      browser: params.browser,
      environment: params.environment,
      contentHash,
      outcome,
    });
  }
}
