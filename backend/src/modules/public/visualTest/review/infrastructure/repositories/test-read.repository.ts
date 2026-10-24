import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { findManyWithCount } from '@/prisma/find-many-with-count';
import { TestKind, Prisma } from '@/prisma/client';
import { DomainError } from '@common/domain/domain-error';
import {
  TestStatus,
  PENDING_APPROVAL_STATUS_FILTER,
} from '@public/visualTest/core/domain/types/visual-test.types';
import { resolveVariantStatusFromComparison } from '@public/visualTest/core/domain/policies/test-status.policy';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { toScreenshotEntity } from '@public/visualTest/core/infrastructure/mappers/screenshot.mapper';
import { variantFromRow } from '@public/visualTest/core/infrastructure/mappers/variant-row.mapper';
import { COMPARISON_INCLUDE } from '@public/visualTest/core/infrastructure/mappers/comparison.mapper';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import {
  BranchResolver,
  type ResolvedBranch,
} from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchTestRepository } from '@public/visualTest/core/infrastructure/repositories/branch-test.repository';
import type { VariantFilter } from '@public/visualTest/core/domain/value-objects/variant.vo';
import type { ReviewVariantRow } from '@public/visualTest/core/infrastructure/repositories/variant-store';

export interface PendingApprovalResult {
  name: string;
  variant: { viewport: string; browser: string; environment: string };
  latestStatus: TestStatus;
}

export interface TestTarget {
  id: string;
  name: string;
  kind: TestKind;
  createdAt: Date;
  origin: 'branch' | 'inherited';
  inheritedFrom: string | null;
}

// The shape findTestWithVariants returns, named so the PDF-details mapper
// crosses the repository→mapper seam against the same type instead of
// re-declaring a structural copy that can silently drift.
export interface TestWithVariantsResult {
  baselineInherited: boolean;
  inheritTarget: string | null;
  test: {
    id: string;
    name: string;
    status: TestStatus;
    kind: TestKind;
    createdAt: Date;
    origin: 'branch' | 'inherited';
    inheritedFrom: string | null;
  };
  baseline: ScreenshotEntity | null;
  comparison: ComparisonEntity | null;
}

// The test-scoped read seam for the review module: everything a single test's
// details page or the PDF access flow needs (image details, PDF sources,
// PDF ownership, test listing, pending list). The variant + baseline +
// comparison resolution is shared here (resolveReadTarget) and funnels through
// VariantStore + UnifiedComparisonsRepository — the same rules the persisted
// status derivation uses — so the read model cannot resolve a different variant
// than the status. Project-level reads (overview statuses, pending flags/counts)
// live on ProjectReadRepository.
@Injectable()
export class TestReadRepository {
  constructor(
    private readonly connection: PrismaConnection,
    private readonly variants: VariantStore,
    private readonly comparisons: UnifiedComparisonsRepository,
    private readonly branchResolver: BranchResolver,
    private readonly branchTests: BranchTestRepository,
  ) {}

  private get client() {
    return this.connection.client;
  }

  // Image details read through one seam: baseline + latest comparison composed
  // here instead of the caller reaching into two core repositories. The exists
  // flag lets the caller distinguish "no baseline yet" (legitimate) from an
  // unknown test (404) without a second resolve. The union discriminates on
  // exists, so a caller that has ruled out the missing-test branch can read
  // kind (and enforce the image-only shape) without re-checking an optional.
  async findVisualTestDetails(
    projectName: string,
    testName: string,
    filters?: VariantFilter,
    branchName?: string,
  ): Promise<
    | {
        exists: false;
        kind?: undefined;
        origin?: undefined;
        inheritedFrom?: undefined;
        baselineInherited?: undefined;
        inheritTarget?: undefined;
        baseline: null;
        comparison: null;
      }
    | {
        exists: true;
        kind: TestKind;
        origin: 'branch' | 'inherited';
        inheritedFrom: string | null;
        baselineInherited: boolean;
        inheritTarget: string | null;
        baseline: ScreenshotEntity | null;
        comparison: ComparisonEntity | null;
      }
  > {
    const target = await this.resolveReadTarget(
      projectName,
      testName,
      filters,
      branchName,
    );
    if (!target) {
      return {
        exists: false,
        kind: undefined,
        baseline: null,
        comparison: null,
      };
    }
    return {
      exists: true,
      kind: target.test.kind,
      origin: target.test.origin,
      inheritedFrom: target.test.inheritedFrom,
      baselineInherited: target.baselineInherited,
      inheritTarget: target.inheritTarget,
      baseline: target.baseline,
      comparison: target.comparison,
    };
  }

  // Shared lookup for the variant row of (project, test, filters) with its
  // baseline. The variant + baseline resolution and the "no variants at all"
  // vs "variants exist but none match" distinction live in VariantStore
  // (findReviewVariantRow) — the same rule the write/status seam uses — so the
  // read model and the status derivation cannot resolve different variants.
  // The project + test by name lookup composes the single owner
  // (UnifiedTestRepository.findByProjectNameAndTestName), so "does this test
  // exist" is one query shared with the resolver, not re-derived here.
  private async resolveVariantWithBaseline(
    projectName: string,
    testName: string,
    filters?: VariantFilter,
    branchName?: string,
  ): Promise<{
    test: TestTarget;
    branch: ResolvedBranch;
    variant: ReviewVariantRow | null;
  } | null> {
    const branch = await this.branchResolver.resolveRead(
      projectName,
      branchName,
    );
    const effective = await this.branchTests.findEffectiveTest(
      branch.branchId,
      testName,
    );
    if (!effective) return null;

    const test: TestTarget = {
      id: effective.id,
      name: effective.name,
      kind: effective.kind,
      createdAt: effective.createdAt,
      origin: effective.origin,
      inheritedFrom: effective.inheritedFrom,
    };

    const { variant, hasAnyVariant } = await this.variants.findReviewVariantRow(
      test.id,
      filters,
    );

    if (!variant && hasAnyVariant) {
      // A test that has NEVER been uploaded has no variant rows at all — that
      // is the legitimate "no baseline yet" state the callers read as PENDING.
      // A test that DOES have variants but none matching the filters is a
      // variant-not-found: the caller asked for a configuration this test does
      // not have, and reading it as "no baseline yet" would hide the error.
      throw new DomainError(
        `Variant not found for test "${testName}" in project "${projectName}"`,
        'NOT_FOUND',
      );
    }

    return { test, branch, variant };
  }

  // The variant's baseline entity + its latest reviewable comparison, composed
  // once so every read path (image details, PDF sources, PDF details) resolves
  // the same row and only differs in how it shapes the result.
  private async resolveReadTarget(
    projectName: string,
    testName: string,
    filters?: VariantFilter,
    branchName?: string,
  ): Promise<{
    test: TestTarget;
    baseline: ScreenshotEntity | null;
    comparison: ComparisonEntity | null;
    baselineInherited: boolean;
    inheritTarget: string | null;
  } | null> {
    const resolved = await this.resolveVariantWithBaseline(
      projectName,
      testName,
      filters,
      branchName,
    );
    if (!resolved) return null;
    const isBaselineInherited = resolved.variant?.isInherited === true;
    if (!resolved.variant?.baseline) {
      return {
        test: resolved.test,
        baseline: null,
        comparison: null,
        baselineInherited: isBaselineInherited,
        inheritTarget: null,
      };
    }
    const baseline = toScreenshotEntity(
      resolved.variant.baseline,
      Variant.fromRecord({
        viewport: resolved.variant.viewport,
        browser: resolved.variant.browser,
        environment: resolved.variant.environment,
      }),
    );
    const comparison = await this.comparisons.findLatestReviewableByBaselineId(
      baseline.id,
    );
    return {
      test: resolved.test,
      baseline,
      comparison,
      baselineInherited: isBaselineInherited,
      // Only the inherited case needs the label, and only then do we pay for the
      // target lookup — a pinned baseline belongs to this branch.
      inheritTarget: isBaselineInherited
        ? await this.branchResolver.resolveEffectiveTargetName(resolved.branch)
        : null,
    };
  }

  // Targeted read for the PDF download endpoint: the URLs it can stream
  // (baseline / candidate / diff) without paying for the full read-model
  // mapping. The variant + baseline resolution runs through the same
  // VariantStore rule as every other read; the candidate + diff URLs come from
  // the URL-only comparison read (findLatestReviewableUrlsByBaselineId), which
  // shares the reviewable-comparison status set + ordering. Ownership is
  // enforced by scoping the query to project + test.
  async findPdfDownloadSources(
    projectName: string,
    testName: string,
    filters?: VariantFilter,
    branchName?: string,
  ): Promise<{
    baselineUrl: string | null;
    candidateUrl: string | null;
    diffPdfUrl: string | null;
  } | null> {
    const resolved = await this.resolveVariantWithBaseline(
      projectName,
      testName,
      filters,
      branchName,
    );
    if (!resolved) return null;
    if (!resolved.variant?.baseline) {
      return { baselineUrl: null, candidateUrl: null, diffPdfUrl: null };
    }
    const urls = await this.comparisons.findLatestReviewableUrlsByBaselineId(
      resolved.variant.baseline.id,
    );
    return {
      baselineUrl: resolved.variant.baseline.imageUrl,
      candidateUrl: urls.candidateUrl,
      diffPdfUrl: urls.diffPdfUrl,
    };
  }

  // Single owner of the "a PDF URL belongs to this test" rule: the URL is
  // owned when it is held by one of the test's screenshots or by one of the
  // test's comparison diff pdfs. Both the download and render flows call here,
  // so a change to what counts as owned is one edit, not two.
  async assertPdfBelongsToTest(
    projectName: string,
    testName: string,
    imageUrl: string,
    branchName?: string,
  ): Promise<void> {
    const branch = await this.branchResolver.resolveRead(
      projectName,
      branchName,
    );
    const test = await this.branchTests.findEffectiveTest(
      branch.branchId,
      testName,
    );
    if (!test) {
      throw new DomainError('Test not found', 'NOT_FOUND');
    }
    const screenshotCount = await this.client.unifiedScreenshot.count({
      where: { imageUrl, testId: test.id },
    });
    if (screenshotCount > 0) return;
    const comparisonCount = await this.client.unifiedComparison.count({
      where: { diffPdfUrl: imageUrl, testId: test.id },
    });
    if (comparisonCount === 0) {
      throw new DomainError('PDF does not belong to this test', 'FORBIDDEN');
    }
  }

  async getTestNames(
    branchId: string,
    pagination?: { skip: number; take: number },
    kind?: TestKind,
  ): Promise<{
    data: {
      name: string;
      kind: string;
      status: string | null;
      origin: 'branch' | 'inherited';
      inheritedFrom: string | null;
    }[];
    total: number;
  }> {
    const result = await this.branchTests.findEffectiveTests(
      branchId,
      pagination,
      kind,
    );
    return {
      data: result.data.map((test) => ({
        name: test.name,
        kind: test.kind,
        status: test.status,
        origin: test.origin,
        inheritedFrom: test.inheritedFrom,
      })),
      total: result.total,
    };
  }

  // PDF details read: surfaces the status of the SHOWN variant (derived with
  // the same per-variant rule as the project read model), not the whole-test
  // aggregate — an approved variant of a half-pending test must not read
  // PENDING_APPROVAL just because a sibling variant is pending.
  async findTestWithVariants(
    projectName: string,
    testName: string,
    filters?: VariantFilter,
    branchName?: string,
  ): Promise<TestWithVariantsResult | null> {
    const target = await this.resolveReadTarget(
      projectName,
      testName,
      filters,
      branchName,
    );
    if (!target) return null;

    return {
      test: {
        id: target.test.id,
        name: target.test.name,
        kind: target.test.kind,
        createdAt: target.test.createdAt,
        origin: target.test.origin,
        inheritedFrom: target.test.inheritedFrom,
        status: target.baseline
          ? resolveVariantStatusFromComparison(target.comparison?.status, true)
          : TestStatus.PENDING,
      },
      baselineInherited: target.baselineInherited,
      inheritTarget: target.inheritTarget,
      baseline: target.baseline,
      comparison: target.comparison,
    };
  }

  async getPendingApproval(
    branchId: string,
    pagination?: { skip: number; take: number },
  ): Promise<{
    data: PendingApprovalResult[];
    total: number;
  }> {
    const { data, total } = await findManyWithCount<
      Prisma.UnifiedComparisonGetPayload<{
        include: {
          test: { select: { name: true } };
          baseline: typeof COMPARISON_INCLUDE.baseline;
        };
      }>
    >(this.client.unifiedComparison, {
      where: { test: { branchId }, ...PENDING_APPROVAL_STATUS_FILTER },
      include: {
        test: { select: { name: true } },
        baseline: COMPARISON_INCLUDE.baseline,
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination?.skip,
      take: pagination?.take,
    });
    return {
      data: data.map((c) => ({
        name: c.test.name,
        // A comparison always belongs to exactly one variant (FK +
        // COMPARISON_INCLUDE guarantee it) — derive through the shared strict
        // rule like every other read, not a soft fallback that would smuggle
        // 'unknown' dimensions into the review loop.
        variant: variantFromRow(c.baseline).toRecord(),
        // The query filters status = PENDING_APPROVAL, so the per-variant rule
        // is constant here: every listed comparison is a pending approval.
        latestStatus: TestStatus.PENDING_APPROVAL,
      })),
      total,
    };
  }
}
