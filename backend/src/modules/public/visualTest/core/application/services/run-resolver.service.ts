import { Injectable } from '@nestjs/common';
import { ComparisonOutcome } from '@common/domain/upload-outcome';
import type { Run } from '@/prisma/client';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';

export interface ResolveRunInput {
  projectId: string;
  branchId: string;
  runKey?: string;
  commitSha?: string;
  commitMessage?: string;
  ciUrl?: string;
}

// Single owner of "which run does this upload belong to": no key means no run
// (the pre-run behavior), a key upserts activity inside the upload's
// transaction. The run row never changes comparison semantics — it only groups.
@Injectable()
export class RunResolver {
  constructor(private readonly runs: RunRepository) {}

  async resolveForUpload(input: ResolveRunInput): Promise<Run | null> {
    if (!input.runKey) return null;
    return this.runs.upsertActivity({
      projectId: input.projectId,
      branchId: input.branchId,
      runKey: input.runKey,
      commitSha: input.commitSha ?? null,
      commitMessage: input.commitMessage ?? null,
      ciUrl: input.ciUrl ?? null,
    });
  }

  // The durable "this run touched that test/variant" record. Baseline-only
  // uploads have no job/comparison, and approvals delete comparisons, so the
  // upload row is what makes run grouping survive.
  async recordUpload(input: {
    runId: string;
    testId: string;
    kind: 'image' | 'pdf';
    viewport: string;
    browser: string;
    environment: string;
    contentHash: string;
    outcome: ComparisonOutcome;
  }): Promise<void> {
    await this.runs.recordUpload(input);
  }
}
