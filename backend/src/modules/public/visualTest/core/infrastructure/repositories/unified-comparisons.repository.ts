import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import {
  ComparisonStatus,
  PENDING_APPROVAL_STATUS_FILTER,
  REVIEWABLE_COMPARISON_ORDER,
  REVIEWABLE_COMPARISON_STATUS_FILTER,
} from '@public/visualTest/core/domain/types/visual-test.types';
import { ComparisonEntity } from '@public/visualTest/core/domain/entities/comparison.entity';
import { DomainError } from '@common/domain/domain-error';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  ComparisonRow,
  COMPARISON_INCLUDE,
  toComparisonEntityWithRelations,
} from '@public/visualTest/core/infrastructure/mappers/comparison.mapper';
import { isString } from '@common/utils/is-string';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { TransactionContext } from '@/prisma/transaction-context';
import type { TestKind } from '@common/domain/test-kind';
import type { ComparisonResult } from '@common/domain/comparison-engine.interface';
import type { Prisma } from '@/prisma/client';

interface DiffUrlRow {
  diffImageUrl: string | null;
  diffPdfUrl: string | null;
}

export function collectDiffUrls(rows: DiffUrlRow[]): string[] {
  return rows
    .flatMap((c) => [c.diffImageUrl, c.diffPdfUrl ?? null])
    .filter((url): url is string => isString(url) && url.length > 0);
}

interface PendingComparisonBase {
  testId: string;
  baselineId: string;
  candidateId: string;
  runId?: string;
  runKey?: string;
}

// The comparison row is built from the engine's authoritative output — the
// repository owns the only kind→column switch, so a new engine kind (or a new
// per-kind field) is a one-edit change beside the row it writes. diffOutput is
// carried for typing but never persisted; the diff artifact URL is the stored
// copy's address.
export type CreatePendingComparisonParams = PendingComparisonBase & {
  diffUrl: string;
  result: ComparisonResult;
};

@Injectable()
export class UnifiedComparisonsRepository extends BaseRepository {
  constructor(
    txCtx: TransactionContext,
    private readonly variants: VariantStore,
  ) {
    super(txCtx);
  }

  private readonly comparisonInclude = COMPARISON_INCLUDE;

  // The one "which comparisons are reviewable for a baseline" rule: the
  // PENDING_APPROVAL/APPROVED status set + ordering. Every read that targets
  // "the comparison a reviewer can act on" composes this instead of re-spelling
  // the where + order, so the status set edits in one place.
  private readonly latestReviewableWhere = (
    baselineId: string,
  ): Prisma.UnifiedComparisonWhereInput => ({
    baselineId,
    ...REVIEWABLE_COMPARISON_STATUS_FILTER,
  });

  private readonly diffUrlSelect = {
    diffImageUrl: true,
    diffPdfUrl: true,
  } as const;

  private mapComparisonResults(results: ComparisonRow[]): ComparisonEntity[] {
    return results.map((result) => toComparisonEntityWithRelations(result));
  }

  private async findLatestComparison(
    where: Prisma.UnifiedComparisonWhereInput,
  ): Promise<ComparisonEntity | null> {
    const result = await this.client.unifiedComparison.findFirst({
      where,
      orderBy: REVIEWABLE_COMPARISON_ORDER,
      include: this.comparisonInclude,
    });
    if (!result) return null;
    return this.mapComparisonResults([result])[0] ?? null;
  }

  // The latest comparison a reviewer can act on for a baseline: PENDING_APPROVAL
  // or APPROVED (PDF approval keeps the APPROVED row as history, image approval
  // deletes it). Single owner of the entity-level read — the review read model
  // and the persisted-status derivation both compose this same status set +
  // ordering, so "which comparison counts" is one query here.
  async findLatestReviewableByBaselineId(
    baselineId: string,
  ): Promise<ComparisonEntity | null> {
    return this.findLatestComparison(this.latestReviewableWhere(baselineId));
  }

  // Narrow URL-only read of the latest reviewable comparison for a baseline —
  // what the PDF download endpoint streams (candidate + diff) without paying
  // for the full entity mapping. Same reviewable-comparison rule as
  // findLatestReviewableByBaselineId, so the targeted read cannot drift.
  async findLatestReviewableUrlsByBaselineId(
    baselineId: string,
  ): Promise<{ candidateUrl: string | null; diffPdfUrl: string | null }> {
    const result = await this.client.unifiedComparison.findFirst({
      where: this.latestReviewableWhere(baselineId),
      orderBy: REVIEWABLE_COMPARISON_ORDER,
      select: {
        diffPdfUrl: true,
        candidate: { select: { imageUrl: true } },
      },
    });
    return {
      candidateUrl: result?.candidate?.imageUrl ?? null,
      diffPdfUrl: result?.diffPdfUrl ?? null,
    };
  }

  // Narrow batch read for the threshold rule: only the fields decideThresholdAction
  // needs, for every baseline in one query instead of one round-trip per baseline.
  // The status predicate (PENDING_APPROVAL) is part of this query, so the policy
  // does not need to re-check it — the rows arriving here are already pending.
  async findPendingForBaselines(
    testId: string,
    baselineIds: string[],
  ): Promise<{ id: string; mismatchPixelCount: number }[]> {
    if (baselineIds.length === 0) return [];
    const results = await this.client.unifiedComparison.findMany({
      where: {
        testId,
        baselineId: { in: baselineIds },
        ...PENDING_APPROVAL_STATUS_FILTER,
      },
      select: { id: true, mismatchPixelCount: true },
      orderBy: REVIEWABLE_COMPARISON_ORDER,
    });
    return results;
  }

  // Ids-only read of every approval target of a test, oldest first. The bulk
  // approval walks this list one comparison at a time; the ordering makes the
  // batch deterministic (the oldest pending review is approved first) so a
  // partial failure leaves a predictable remainder. A read-only projection: it
  // takes no write lock and asserts nothing about writability.
  async findPendingComparisonIdsForTest(testId: string): Promise<string[]> {
    const rows = await this.client.unifiedComparison.findMany({
      where: { testId, ...PENDING_APPROVAL_STATUS_FILTER },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => row.id);
  }

  async findDiffImageUrlsByTestIds(testIds: string[]): Promise<string[]> {
    if (testIds.length === 0) return [];
    const results = await this.client.unifiedComparison.findMany({
      where: { testId: { in: testIds } },
      select: this.diffUrlSelect,
    });
    return collectDiffUrls(results);
  }

  // The subset of the given URLs that any comparison row currently references
  // as its diff artifact (diffImageUrl or diffPdfUrl). The unreferenced-object
  // sweep must not delete a diff file while its comparison row points at it.
  async findReferencedDiffUrls(urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];
    const rows = await this.client.unifiedComparison.findMany({
      where: {
        OR: [{ diffImageUrl: { in: urls } }, { diffPdfUrl: { in: urls } }],
      },
      select: this.diffUrlSelect,
    });
    return collectDiffUrls(rows);
  }

  // Image approval completes a comparison by deleting it. The delete is guarded
  // by the pending status IN THE WRITE, so "only approve while PENDING_APPROVAL"
  // is enforced at the write seam — a stale comparison can never be silently
  // deleted and a double-approval race surfaces as a clean CONFLICT. Returns the
  // diff artifact URLs the caller may reclaim post-commit.
  async completeImageApproval(testId: string, id: string): Promise<string[]> {
    this.assertWritable();
    const comparison = await this.client.unifiedComparison.findUnique({
      where: { id },
      select: { id: true, testId: true, diffImageUrl: true },
    });
    if (!comparison?.testId || comparison.testId !== testId) {
      throw new DomainError(
        `Comparison with id "${id}" not found`,
        'NOT_FOUND',
      );
    }
    const { count } = await this.client.unifiedComparison.deleteMany({
      where: {
        id,
        testId,
        ...PENDING_APPROVAL_STATUS_FILTER,
      },
    });
    if (count === 0) {
      throw new DomainError(
        `Comparison "${id}" is not PENDING_APPROVAL and cannot be approved`,
        'CONFLICT',
      );
    }
    return comparison.diffImageUrl ? [comparison.diffImageUrl] : [];
  }

  async createPending(
    params: CreatePendingComparisonParams,
  ): Promise<{ id: string }> {
    this.assertWritable();
    const { result, diffUrl, ...base } = params;
    const data =
      result.kind === 'image'
        ? {
            ...base,
            ...PENDING_APPROVAL_STATUS_FILTER,
            mismatchPixelCount: result.mismatchPixelCount,
            diffImageUrl: diffUrl,
            mismatchPageCount: 0,
            diffPdfUrl: null,
            pageCount: null,
          }
        : {
            ...base,
            ...PENDING_APPROVAL_STATUS_FILTER,
            mismatchPixelCount: 0,
            diffImageUrl: null,
            mismatchPageCount: result.mismatchPageCount,
            diffPdfUrl: diffUrl,
            pageCount: result.pageCount ?? 0,
          };
    const comparison = await this.client.unifiedComparison.create({
      data,
      select: { id: true },
    });
    return { id: comparison.id };
  }

  // The exact comparison a reviewer acted on: loaded by id and scoped to the
  // test, with any status. The approval kind decides whether it is still an
  // action target — a stale (already approved / superseded) comparison must
  // never be silently swapped for whatever happens to be pending at click time.
  async findByIdForTest(
    testId: string,
    comparisonId: string,
  ): Promise<ComparisonEntity | null> {
    return this.findLatestComparison({ id: comparisonId, testId });
  }

  // Approval's fallback pairing: a comparison identifies its own test and
  // therefore its branch, so a client that approves by comparisonId alone (the
  // pre-branch contract) still resolves the right branch. Scoped by project name
  // so a comparison id from another project can never be approved here.
  async findTestOfComparison(input: {
    projectName: string;
    testName: string;
    comparisonId: string;
  }): Promise<{ id: string; name: string; kind: TestKind } | null> {
    const row = await this.client.unifiedComparison.findFirst({
      where: {
        id: input.comparisonId,
        test: {
          name: input.testName,
          branch: { project: { name: input.projectName } },
        },
      },
      select: { test: { select: { id: true, name: true, kind: true } } },
    });
    return row?.test ?? null;
  }

  // Retires every PENDING_APPROVAL comparison for the variant, returning the
  // storage URLs for post-commit cleanup plus the candidate ids the caller may
  // reclaim. Pass keepComparisonId to preserve the freshly created/approved
  // comparison so the "at most one reviewable comparison per Variant" invariant
  // holds. The caller (ComparisonRetirementService) owns candidate reclamation
  // and job cancellation — this stays a pure persistence primitive.
  async retirePendingForVariant(
    testId: string,
    variant: Variant,
    keepComparisonId?: string,
  ): Promise<{ staleDiffUrls: string[]; candidateIds: string[] }> {
    this.assertWritable();
    const found = await this.variants.findVariantWithBaseline(testId, variant);
    if (!found?.baselineId) {
      return { staleDiffUrls: [], candidateIds: [] };
    }
    const where: Prisma.UnifiedComparisonWhereInput = {
      baselineId: found.baselineId,
      ...PENDING_APPROVAL_STATUS_FILTER,
    };
    if (keepComparisonId) {
      where.NOT = { id: keepComparisonId };
    }
    return this.deleteComparisons(testId, where);
  }

  async deletePendingByIds(
    testId: string,
    ids: string[],
  ): Promise<{ staleDiffUrls: string[]; candidateIds: string[] }> {
    this.assertWritable();
    if (ids.length === 0) {
      return { staleDiffUrls: [], candidateIds: [] };
    }
    return this.deleteComparisons(testId, {
      id: { in: ids },
      ...PENDING_APPROVAL_STATUS_FILTER,
    });
  }

  // Single guarded deletion channel for "delete the comparisons that reference
  // these screenshots": the surviving-diff-URL guard lives here so a full
  // variant teardown funnels through the same cascade as retirement. Returns
  // the storage URLs to delete post-commit plus the candidate ids whose CURRENT
  // rows the caller may reclaim.
  async deleteComparisonsForScreenshots(
    testId: string,
    screenshotIds: string[],
  ): Promise<{ staleDiffUrls: string[]; candidateIds: string[] }> {
    this.assertWritable();
    if (screenshotIds.length === 0) {
      return { staleDiffUrls: [], candidateIds: [] };
    }
    return this.deleteComparisons(testId, {
      OR: [
        { baselineId: { in: screenshotIds } },
        { candidateId: { in: screenshotIds } },
      ],
    });
  }

  private async deleteComparisons(
    testId: string,
    where: Prisma.UnifiedComparisonWhereInput,
  ): Promise<{ staleDiffUrls: string[]; candidateIds: string[] }> {
    const fullWhere: Prisma.UnifiedComparisonWhereInput = {
      testId,
      ...where,
    };
    const comparisons = await this.client.unifiedComparison.findMany({
      where: fullWhere,
      select: {
        id: true,
        ...this.diffUrlSelect,
        candidateId: true,
      },
    });

    const deletedIds = comparisons.map((c) => c.id);
    const deletedDiffUrls = collectDiffUrls(comparisons);

    if (comparisons.length > 0) {
      await this.client.unifiedComparison.deleteMany({
        where: { id: { in: deletedIds } },
      });
    }

    // Never collect a diff URL that a *surviving* comparison row still
    // references — the stale-URL channel must not delete an artifact a live row
    // points at (a stall-reclaimed re-run's new comparison references its own
    // diff while its sibling's is retired).
    const survivingDiffUrls = new Set(
      deletedDiffUrls.length > 0
        ? await this.findDiffUrlsReferencedBy(
            testId,
            deletedIds,
            deletedDiffUrls,
          )
        : [],
    );
    const staleDiffUrls = deletedDiffUrls.filter(
      (url) => !survivingDiffUrls.has(url),
    );

    const candidateIds = comparisons.map((c) => c.candidateId).filter(isString);

    return { staleDiffUrls, candidateIds };
  }

  private async findDiffUrlsReferencedBy(
    testId: string,
    excludedIds: string[],
    urls: string[],
  ): Promise<string[]> {
    const rows = await this.client.unifiedComparison.findMany({
      where: {
        testId,
        id: { notIn: excludedIds },
        OR: [{ diffImageUrl: { in: urls } }, { diffPdfUrl: { in: urls } }],
      },
      select: this.diffUrlSelect,
    });
    return collectDiffUrls(rows);
  }

  // PDF approval completes a comparison by marking it APPROVED and detaching the
  // candidate, clearing the diff reference in the same guarded write so the
  // approval is atomic. The "only approve while PENDING_APPROVAL" rule lives in
  // the WHERE — a stale target surfaces as a clean CONFLICT. Returns the diff
  // artifact URLs the caller may reclaim post-commit.
  async completePdfApproval(
    comparisonId: string,
    diffPdfUrl?: string,
  ): Promise<string[]> {
    this.assertWritable();
    const result = await this.client.unifiedComparison.updateMany({
      where: { id: comparisonId, ...PENDING_APPROVAL_STATUS_FILTER },
      data: {
        status: ComparisonStatus.APPROVED,
        candidateId: null,
        ...(diffPdfUrl ? { diffPdfUrl: null } : {}),
      },
    });
    if (result.count === 0) {
      throw new DomainError(
        `Comparison "${comparisonId}" is not PENDING_APPROVAL and cannot be approved`,
        'CONFLICT',
      );
    }
    return diffPdfUrl ? [diffPdfUrl] : [];
  }
}
