import { Injectable } from '@nestjs/common';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { change } from '@public/visualTest/core/application/services/state-change-options';
import { decideThresholdAction } from '@public/visualTest/core/domain/policies/threshold-policy';
import { DomainError } from '@common/domain/domain-error';
import type { VariantFilter } from '@public/visualTest/core/domain/value-objects/variant.vo';

// Single owner of the threshold-update recipe, so the caller stops hand-rolling
// executeStateChange. Writes the new value on the matching baselines, then
// auto-accepts (retires) every PENDING_APPROVAL comparison whose mismatch is at
// or below it — all inside one StateChangeWorkflow transaction. The baseline
// rows are mutated even when nothing is auto-accepted, so the change is always
// a `change` (the PersistedChange contract forbids a noop for a mutation that
// changed domain rows), never a noop.
@Injectable()
export class ThresholdUpdateService {
  constructor(
    private readonly workflow: StateChangeWorkflow,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
    private readonly retirement: ComparisonRetirementService,
  ) {}

  async update(
    testId: string,
    testName: string,
    threshold: number,
    filters?: VariantFilter,
    preview = false,
  ): Promise<{ autoAcceptedCount: number }> {
    if (preview) {
      // Server-owned preview of the rule: the frontend asks how many pending
      // comparisons a threshold would auto-accept instead of re-encoding
      // "mismatch <= threshold" on the client. No rows are mutated.
      return {
        autoAcceptedCount: (
          await this.collectAutoAcceptable(testId, testName, threshold, filters)
        ).toDelete.length,
      };
    }

    let autoAcceptedCount = 0;
    await this.workflow.executeStateChange(async () => {
      const { baselineIds, toDelete } = await this.collectAutoAcceptable(
        testId,
        testName,
        threshold,
        filters,
      );

      await this.screenshots.updateThresholdMany(baselineIds, threshold);
      autoAcceptedCount = toDelete.length;

      if (toDelete.length > 0) {
        const stale = await this.retirement.retirePendingComparisons(
          testId,
          toDelete,
        );
        return change([testId], { staleUrls: stale });
      }
      return change([testId]);
    });
    return { autoAcceptedCount };
  }

  // Single implementation of the auto-accept recipe, shared by the preview
  // path and the committed path so "which comparisons would be accepted" and
  // "which comparisons were accepted" are the same rule. Returns the baseline
  // ids (the committed path mutates them) and the pending comparison ids whose
  // mismatch is at or below the threshold (the ids to retire).
  private async collectAutoAcceptable(
    testId: string,
    testName: string,
    threshold: number,
    filters?: VariantFilter,
  ): Promise<{ baselineIds: string[]; toDelete: string[] }> {
    const baselineIds = await this.screenshots.findBaselineIdsByFilters(
      testId,
      filters,
    );
    if (baselineIds.length === 0) {
      throw new DomainError(
        `Baseline for test "${testName}" not found`,
        'NOT_FOUND',
      );
    }
    const pending = await this.comparisons.findPendingForBaselines(
      testId,
      baselineIds,
    );
    const toDelete = pending
      .filter(
        (comparison) =>
          decideThresholdAction(comparison, threshold) === 'DELETE',
      )
      .map((comparison) => comparison.id);
    return { baselineIds, toDelete };
  }
}
