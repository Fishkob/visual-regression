import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { AppConfigService } from '@config/app-config.service';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { change } from '@public/visualTest/core/application/services/state-change-options';
import {
  BaselineRevisionRepository,
  type BaselineRevisionRow,
} from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import {
  Variant,
  type VariantFilter,
} from '@public/visualTest/core/domain/value-objects/variant.vo';
import type { BaselineRevisionReason } from '@public/visualTest/core/domain/types/visual-test.types';
import type { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';

export interface BaselineRevisionView extends BaselineRevisionRow {
  signedImageUrl: string;
}

export interface RestoreBaselineInput {
  projectName: string;
  testName: string;
  revisionId: string;
  branchName?: string;
  restoredBy: string;
}

export interface RestoreBaselineResult {
  baselineUrl: string;
  signedBaselineUrl: string;
}

// Owner of the baseline revision rules. Two shapes live here deliberately:
//
// - recordOutgoingBaseline() is transaction-RIDING: the approval and restore
//   paths call it from inside their StateChangeWorkflow change, so the history
//   row can never commit without the baseline write (or vice versa).
// - restore() owns its StateChangeWorkflow transaction and composes the same
//   record rule with the baseline rewrite and the retirement of pending work.
@Injectable()
export class BaselineHistoryService {
  constructor(
    private readonly revisions: BaselineRevisionRepository,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly variants: VariantStore,
    private readonly retirement: ComparisonRetirementService,
    private readonly workflow: StateChangeWorkflow,
    private readonly testResolver: TestResolver,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async list(
    projectName: string,
    testName: string,
    filters: VariantFilter,
    branchName?: string,
  ): Promise<BaselineRevisionView[]> {
    const test = await this.testResolver.findOwnTest(
      projectName,
      testName,
      branchName,
    );
    const rows = await this.revisions.findForTest(
      test.id,
      filters,
      this.config.baselineHistory.limit,
    );
    return rows.map((row) => ({
      ...row,
      signedImageUrl: this.storage.signUrl(row.imageUrl),
    }));
  }

  // Record the baseline that is about to be overwritten and prune the history
  // beyond the configured limit. Returns the storage URLs the prune made
  // reclaimable (already filtered against every surviving reference).
  //
  // Transaction-riding: call only from inside a StateChangeWorkflow change.
  async recordOutgoingBaseline(input: {
    testId: string;
    variant: Variant;
    baseline: ScreenshotEntity;
    reason: BaselineRevisionReason;
    createdBy?: string;
  }): Promise<string[]> {
    const variantId = await this.variants.findVariantId(
      input.testId,
      input.variant,
    );
    if (!variantId) {
      throw new DomainError(
        'Variant not found for baseline revision',
        'NOT_FOUND',
      );
    }
    const { viewport, browser, environment } = input.variant.toRecord();
    await this.revisions.create({
      testId: input.testId,
      variantId,
      viewport,
      browser,
      environment,
      imageUrl: input.baseline.imageUrl,
      imageHash: input.baseline.imageHash,
      pageCount: input.baseline.pageCount ?? null,
      pixelDiffThreshold: input.baseline.pixelDiffThreshold,
      reason: input.reason,
      createdBy: input.createdBy ?? null,
    });
    const pruned = await this.revisions.pruneBeyond(
      input.testId,
      variantId,
      this.config.baselineHistory.limit,
    );
    return this.screenshots.filterReclaimableUrls(pruned);
  }

  async restore(input: RestoreBaselineInput): Promise<RestoreBaselineResult> {
    const outcome = await this.workflow.executeStateChange(async () => {
      const test = await this.testResolver.findOwnTest(
        input.projectName,
        input.testName,
        input.branchName,
      );
      const revision = await this.revisions.findByIdForTest(
        test.id,
        input.revisionId,
      );
      if (!revision) {
        throw new DomainError('Baseline revision not found', 'NOT_FOUND');
      }

      const variant = Variant.fromRecord(revision);
      const variantRow = await this.variants.findVariantWithBaseline(
        test.id,
        variant,
      );
      if (!variantRow) {
        throw new DomainError('Variant not found', 'NOT_FOUND');
      }
      // An inherited clone reads through to the target branch; restoring it
      // here would silently fork ownership, so the branch must own the
      // baseline first (an upload or approval does that).
      if (variantRow.isInherited) {
        throw new DomainError(
          'Inherited baselines cannot be restored on this branch',
          'CONFLICT',
        );
      }

      const current = await this.screenshots.findBaselineByVariant(
        test.id,
        variant,
      );
      if (!current) {
        throw new DomainError('Baseline not found', 'NOT_FOUND');
      }
      if (
        current.imageUrl === revision.imageUrl &&
        current.imageHash === revision.imageHash
      ) {
        throw new DomainError(
          'That revision is already the current baseline',
          'CONFLICT',
        );
      }

      const staleUrls = await this.recordOutgoingBaseline({
        testId: test.id,
        variant,
        baseline: current,
        reason: 'restore',
        createdBy: input.restoredBy,
      });

      // The baseline row is updated in place, like an approval: the variant's
      // baselineId never changes, and the restored tolerance travels with the
      // restored image.
      await this.screenshots.updateBaselineScreenshot(current.id, {
        imageHash: revision.imageHash,
        imageUrl: revision.imageUrl,
        pageCount: revision.pageCount,
        pixelDiffThreshold: revision.pixelDiffThreshold,
      });

      await this.audit.record({
        actor: input.restoredBy,
        action: AUDIT_ACTIONS.baselineRestore,
        projectName: input.projectName,
        testName: input.testName,
        branchName: input.branchName ?? null,
        targetType: 'test',
        targetId: test.id,
        metadata: {
          revisionId: revision.id,
          viewport: revision.viewport,
          browser: revision.browser,
          environment: revision.environment,
          imageHash: revision.imageHash,
        },
      });

      // Any pending comparison was computed against the replaced baseline, and
      // a queued job would do the same — retire both through the single owner.
      staleUrls.push(
        ...(await this.retirement.supersedeForVariant(test.id, variant)),
      );

      return {
        change: change([test.id], {
          staleUrls,
          events: [
            {
              kind: 'baseline_updated',
              visualTestId: test.id,
              baselineId: current.id,
            },
          ],
        }),
        result: { baselineUrl: revision.imageUrl },
      };
    });

    return {
      baselineUrl: outcome.result.baselineUrl,
      signedBaselineUrl: this.storage.signUrl(outcome.result.baselineUrl),
    };
  }
}
