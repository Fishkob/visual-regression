import { Inject, Injectable } from '@nestjs/common';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ReviewArtifactRepository } from '@public/visualTest/core/infrastructure/repositories/review-artifact.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { JOB_PRODUCER, IJobProducer } from '@common/domain/job-queue.interface';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import type { VariantFilter } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import {
  change,
  noop,
  deleted,
  DELETION_STATE_CHANGE_RETRY,
  type PersistedChange,
} from '@public/visualTest/core/application/services/state-change-options';
import { DomainError } from '@common/domain/domain-error';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';

export interface AuditContext {
  actor?: string;
  projectName?: string;
  testName?: string;
  branchName?: string;
}

@Injectable()
export class TestDeletionService {
  constructor(
    private readonly tests: UnifiedTestRepository,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
    private readonly projects: ProjectRepository,
    private readonly variants: VariantStore,
    @Inject(JOB_PRODUCER) private readonly jobQueue: IJobProducer,
    private readonly workflow: StateChangeWorkflow,
    private readonly retirement: ComparisonRetirementService,
    private readonly audit: AuditService,
    private readonly reviewArtifacts: ReviewArtifactRepository,
  ) {}

  async deleteScreenshotsByFilters(
    testId: string,
    filters?: VariantFilter,
    auditContext?: AuditContext,
  ): Promise<string[]> {
    // This seam deletes screenshots for a specific variant. An empty filter
    // must not silently mean "every screenshot, keep the test" — the caller
    // that wants the whole test gone calls deleteTest, not this. Refuse the
    // ambiguous default so a future caller can't mis-invoke a state-destroying
    // path. (The controller already guards, but the seam is the last line.)
    if (!Variant.hasFilters(filters)) {
      throw new DomainError(
        'Variant filters are required to delete screenshots by variant',
        'BAD_REQUEST',
      );
    }

    const outcome = await this.workflow.executeStateChange(
      async () => {
        const screenshots = await this.screenshots.findScreenshotsForVariant(
          testId,
          filters,
        );

        const ids = screenshots.map((s) => s.id);
        if (ids.length === 0) {
          return { change: noop(), result: { screenshotIds: [] } };
        }

        // The comparisons' retirement (delete comparisons → cancel their queued
        // jobs → reclaim their candidates) is owned by the single retirement
        // owner, scoped by screenshot ids. This service keeps only the genuinely
        // distinct teardown: deleting the remaining screenshot rows + variants.
        const { staleUrls, candidateIds } =
          await this.retirement.retireComparisonsForScreenshots(testId, ids);

        const remainingIds = ids.filter((id) => !candidateIds.includes(id));
        const remainingUrls =
          remainingIds.length > 0
            ? await this.screenshots.findImageUrlsByIds(remainingIds)
            : [];
        const variantIds = await this.variants.findIdsByFilters(
          testId,
          filters,
        );

        if (remainingIds.length > 0) {
          await this.screenshots.deleteMany(remainingIds);
        }
        await this.variants.deleteMany(variantIds);

        // The remaining rows (baselines + non-candidate CURRENT rows) were
        // deleted above, so their files are safe to reclaim ONLY if no
        // surviving row still references the URL. Funnel through the single
        // "safe to reclaim" owner after the deletes so a URL a surviving
        // baseline/comparison points at is never deleted.
        const reclaimableRemainingUrls =
          remainingUrls.length > 0
            ? await this.screenshots.filterReclaimableUrls(remainingUrls)
            : [];

        await this.audit.record({
          actor: auditContext?.actor ?? null,
          action: AUDIT_ACTIONS.variantDelete,
          projectName: auditContext?.projectName ?? null,
          testName: auditContext?.testName ?? null,
          branchName: auditContext?.branchName ?? null,
          targetType: 'test',
          targetId: testId,
          metadata: { filters: filters ?? null, screenshotCount: ids.length },
        });

        return {
          change: change([testId], {
            staleUrls: [...staleUrls, ...reclaimableRemainingUrls],
          }),
          result: { screenshotIds: ids },
        };
      },
      {
        retry: DELETION_STATE_CHANGE_RETRY,
      },
    );

    return outcome.result.screenshotIds;
  }

  async deleteTest(testId: string, auditContext?: AuditContext): Promise<void> {
    await this.deleteTests([testId], auditContext);
  }

  // Whole-test and whole-project deletion share one state change: cancel the
  // pending jobs and collect the storage URLs for every test, then delete the
  // rows — all inside the same retried Serializable transaction. A project
  // with N tests is one transaction, not N (and its own row deletion rides the
  // same transaction, so a failure never leaves a half-deleted project). FK
  // violations are retried (matching deleteScreenshotsByFilters) so a
  // concurrent upload creating a test between the project read and the delete
  // doesn't surface as a 500.
  private async deleteTests(
    testIds: string[],
    auditContext?: AuditContext,
  ): Promise<void> {
    await this.workflow.executeStateChange(
      async () => this.deleteTestsInTx(testIds, auditContext),
      {
        retry: DELETION_STATE_CHANGE_RETRY,
      },
    );
  }

  private async deleteTestsInTx(
    testIds: string[],
    auditContext?: AuditContext,
    deleteProjectName?: string,
  ): Promise<Extract<PersistedChange, { kind: 'deleted' }>> {
    if (testIds.length > 0) {
      await this.jobQueue.cancelByTestIds(testIds);
    }

    const screenshotUrls =
      testIds.length > 0
        ? await this.screenshots.findAllImageUrlsForTests(testIds)
        : [];
    const diffUrls =
      testIds.length > 0
        ? await this.comparisons.findDiffImageUrlsByTestIds(testIds)
        : [];

    if (testIds.length > 0) {
      // Comments/votes have no FK to the test (their trail deliberately
      // outlives rows), so deleting the test would silently orphan them.
      // Same transaction: a rolled-back delete keeps the discussion.
      await this.reviewArtifacts.deleteForTestIds(testIds);
      await this.tests.deleteByIds(testIds);
      for (const testId of testIds) {
        await this.audit.record({
          actor: auditContext?.actor ?? null,
          action: AUDIT_ACTIONS.testDelete,
          projectName: auditContext?.projectName ?? null,
          testName: auditContext?.testName ?? null,
          branchName: auditContext?.branchName ?? null,
          targetType: 'test',
          targetId: testId,
        });
      }
    }
    if (deleteProjectName) {
      // Backstop for rows whose testId no longer resolves (an earlier failed
      // delete, or a project deleted without tests).
      await this.reviewArtifacts.deleteForProjectName(deleteProjectName);
      await this.projects.deleteByName(deleteProjectName);
    }

    // The rows are gone, but an inherited baseline clone shares its file with
    // the target branch, so a URL can still be referenced by a surviving row.
    // Reclaim only what no surviving screenshot/comparison points at.
    const staleUrls = await this.screenshots.filterReclaimableUrls([
      ...screenshotUrls,
      ...diffUrls,
    ]);
    return deleted({ staleUrls });
  }

  async deleteProject(projectName: string, actor?: string): Promise<void> {
    await this.workflow.executeStateChange(
      async () => {
        const project = await this.projects.requireByName(projectName);
        const testIds = await this.tests.findIdsByProjectId(project.id);
        await this.audit.record({
          actor: actor ?? null,
          action: AUDIT_ACTIONS.projectDelete,
          projectName,
          targetType: 'project',
          targetId: project.id,
          metadata: { testCount: testIds.length },
        });
        return this.deleteTestsInTx(
          testIds,
          { actor, projectName },
          projectName,
        );
      },
      {
        retry: DELETION_STATE_CHANGE_RETRY,
      },
    );
  }
}
