import { Injectable } from '@nestjs/common';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import {
  decideOutcome,
  type BaselineInfo,
  type UploadDecision,
} from '@public/visualTest/core/domain/policies/upload-decision-policy';
import { ComparisonOutcome } from '@common/domain/upload-outcome';
import type { TestKind } from '@common/domain/test-kind';
import {
  UploadParams,
  toVariant,
} from '@public/visualTest/intake/application/upload-params';

// Single owner of "what is this upload's decision": the read-only gate
// resolution (identical fast path) and the stored-path resolution (after the
// file is written) both funnel through one baseline-hash comparison. The two
// shapes differ only in the test lookup — the gate must never ensureTest (a
// failed upload leaves no rows), the stored path must — so the side-effect-free
// contract is structural here, not a comment in the orchestrator.
@Injectable()
export class UploadDecisionResolver {
  constructor(
    private readonly tests: UnifiedTestRepository,
    private readonly screenshots: UnifiedScreenshotRepository,
  ) {}

  // Read-only gate resolution: finds the test without creating it and reports
  // only when the upload is genuinely identical (hash === baseline hash). A
  // concurrent approval that replaces the baseline between the gate and the
  // caller's transaction resolves to null here, so the stored path re-resolves
  // atomically and wins.
  async resolveIdentical(
    params: UploadParams,
    fileHash: string,
  ): Promise<{ testId: string } | null> {
    const test = await this.tests.findByProjectNameAndTestName(
      params.projectName,
      params.testName,
    );
    if (!test) return null;
    const decision = await this.resolveDecision(test.id, params, fileHash);
    if (decision.status !== ComparisonOutcome.IDENTICAL) return null;
    return { testId: test.id };
  }

  // Stored-path resolution: ensures the project/test row, then decides. Runs
  // inside the workflow transaction so a concurrent baseline replacement
  // between gate and transaction resolves to its new state atomically.
  async resolveStored(
    kind: TestKind,
    params: UploadParams,
    fileHash: string,
  ): Promise<UploadDecision> {
    const { testId } = await this.tests.ensureTest(
      params.projectName,
      params.testName,
      kind,
    );
    return this.resolveDecision(testId, params, fileHash);
  }

  // The baseline→decision computation both resolution sites share: find the
  // variant's baseline screenshot and decide the upload outcome from the hash.
  private async resolveDecision(
    testId: string,
    params: UploadParams,
    fileHash: string,
  ): Promise<UploadDecision> {
    const screenshotEntity = await this.screenshots.findBaselineByVariant(
      testId,
      toVariant(params),
    );
    return decideOutcome(
      testId,
      fileHash,
      screenshotEntity ? this.toBaseline(screenshotEntity) : null,
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
