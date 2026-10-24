import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import {
  Variant,
  type VariantFilter,
} from '@public/visualTest/core/domain/value-objects/variant.vo';
import {
  variantResolutionWhere,
  VARIANT_RESOLUTION_ORDER,
} from '@public/visualTest/core/infrastructure/mappers/variant-row.mapper';
import {
  ComparisonStatus,
  LATEST_REVIEWABLE_COMPARISON_QUERY,
  LATEST_REVIEWABLE_COMPARISON_SUMMARY_QUERY,
} from '@public/visualTest/core/domain/types/visual-test.types';
import { isString } from '@common/utils/is-string';
import type { Prisma } from '@/prisma/client';

export interface VariantStatusSignal {
  hasBaseline: boolean;
  latestComparisonStatus: ComparisonStatus | null;
}

export interface VariantStatusSignalRow {
  testName: string;
  testKind: string;
  viewport: string;
  browser: string;
  environment: string;
  hasBaseline: boolean;
  latestComparisonStatus: ComparisonStatus | null;
}

export interface VariantSummaryComparisonRow {
  status: ComparisonStatus;
  mismatchPixelCount: number;
  candidate: { imageUrl: string } | null;
}

// One tile of the variant gallery: the variant's identity, the image that
// represents it (its baseline) and the latest reviewable comparison. Typed
// rather than a Prisma payload for the same reason as ReviewVariantRow.
export interface VariantSummaryRow {
  viewport: string;
  browser: string;
  environment: string;
  baselineUrl: string | null;
  isInherited: boolean;
  latestComparison: VariantSummaryComparisonRow | null;
}

export interface VariantBaselineRow {
  id: string;
  testId: string;
  type: string;
  imageHash: string;
  imageUrl: string;
  pageCount: number | null;
  pixelDiffThreshold: number;
  createdAt: Date;
}

// The typed shape the review read seam consumes: the resolved variant's own
// dimensions plus its baseline row. Deliberately NOT a Prisma payload — the
// review module must not see Prisma shapes (unlike the raw
// UnifiedVariantGetPayload this used to leak), and the baseline row is exactly
// what toScreenshotEntity maps to a ScreenshotEntity.
export interface ReviewVariantRow {
  viewport: string;
  browser: string;
  environment: string;
  baseline: VariantBaselineRow | null;
  // True while the baseline is a clone that still follows the target chain;
  // false once an approval on this branch pinned it.
  isInherited: boolean;
}

@Injectable()
export class VariantStore extends BaseRepository {
  async ensureVariant(testId: string, variant: Variant): Promise<string> {
    this.assertWritable();
    const { viewport, browser, environment } = variant.toRecord();
    const row = await this.client.unifiedVariant.upsert({
      where: {
        testId_viewport_browser_environment: {
          testId,
          viewport,
          browser,
          environment,
        },
      },
      create: {
        testId,
        viewport,
        browser,
        environment,
      },
      update: {},
      select: { id: true },
    });
    return row.id;
  }

  async findVariantId(
    testId: string,
    variant: Variant,
  ): Promise<string | null> {
    const { viewport, browser, environment } = variant.toRecord();
    const v = await this.client.unifiedVariant.findUnique({
      where: {
        testId_viewport_browser_environment: {
          testId,
          viewport,
          browser,
          environment,
        },
      },
      select: { id: true },
    });
    return v?.id ?? null;
  }

  async setBaselineId(variantId: string, baselineId: string): Promise<void> {
    this.assertWritable();
    await this.client.unifiedVariant.update({
      where: { id: variantId },
      data: { baselineId },
    });
  }

  async findVariantWithBaseline(
    testId: string,
    variant: Variant,
  ): Promise<{
    baselineId: string | null;
    isInherited: boolean;
    baseline: VariantBaselineRow | null;
  } | null> {
    const { viewport, browser, environment } = variant.toRecord();
    const v = await this.client.unifiedVariant.findUnique({
      where: {
        testId_viewport_browser_environment: {
          testId,
          viewport,
          browser,
          environment,
        },
      },
      include: { baseline: true },
    });
    if (!v) return null;
    return {
      baselineId: v.baselineId,
      isInherited: v.isInherited,
      baseline: v.baseline,
    };
  }

  async setInherited(variantId: string, isInherited: boolean): Promise<void> {
    this.assertWritable();
    await this.client.unifiedVariant.update({
      where: { id: variantId },
      data: { isInherited },
    });
  }

  async findVariantBaselineIds(
    testId: string,
    filters?: VariantFilter,
  ): Promise<string[]> {
    const ids = await this.resolveVariantIds(testId, filters);
    if (ids.length === 0) return [];
    const rows = await this.client.unifiedVariant.findMany({
      where: { id: { in: ids } },
      select: { baselineId: true },
    });
    return rows.map((v) => v.baselineId).filter(isString);
  }

  async findIdsByFilters(
    testId: string,
    filters?: VariantFilter,
  ): Promise<string[]> {
    return this.resolveVariantIds(testId, filters);
  }

  // Single rule for "which variants does a filter mean". A partial filter
  // resolves to exactly one variant — the same findFirst + ordering the review
  // read seam uses (resolveVariantWithBaseline) — so a write with a partial
  // filter affects the same variant a read would surface, never every match.
  // Without filters the rule covers the whole test.
  private async resolveVariantIds(
    testId: string,
    filters?: VariantFilter,
  ): Promise<string[]> {
    if (!Variant.hasFilters(filters)) {
      const variants = await this.client.unifiedVariant.findMany({
        where: { testId },
        select: { id: true },
      });
      return variants.map((v) => v.id);
    }
    const variant = await this.client.unifiedVariant.findFirst({
      where: variantResolutionWhere(testId, filters),
      orderBy: VARIANT_RESOLUTION_ORDER,
      select: { id: true },
    });
    return variant ? [variant.id] : [];
  }

  // Single rule for "which variant row does a (partial) filter mean", returning
  // the row with its baseline as a typed shape (ReviewVariantRow), not a raw
  // Prisma payload. The review read seam (resolveVariantWithBaseline) and the
  // write/status seam's partial-filter branch (resolveVariantIds) use the same
  // findFirst + variantResolutionWhere + VARIANT_RESOLUTION_ORDER, so the
  // filter→variant mapping is one edit here. The hasAnyVariant flag lets the
  // read seam distinguish "no variants at all" (legitimate no-baseline-yet) from
  // "variants exist but none match the filters" (variant-not-found).
  async findReviewVariantRow(
    testId: string,
    filters?: VariantFilter,
  ): Promise<{ variant: ReviewVariantRow | null; hasAnyVariant: boolean }> {
    const variant = await this.client.unifiedVariant.findFirst({
      where: variantResolutionWhere(testId, filters),
      orderBy: VARIANT_RESOLUTION_ORDER,
      include: { baseline: true },
    });
    if (variant) {
      return {
        variant: {
          viewport: variant.viewport,
          browser: variant.browser,
          environment: variant.environment,
          isInherited: variant.isInherited,
          baseline: variant.baseline
            ? {
                id: variant.baseline.id,
                testId: variant.baseline.testId,
                type: variant.baseline.type,
                imageHash: variant.baseline.imageHash,
                imageUrl: variant.baseline.imageUrl,
                pageCount: variant.baseline.pageCount,
                pixelDiffThreshold: variant.baseline.pixelDiffThreshold,
                createdAt: variant.baseline.createdAt,
              }
            : null,
        },
        hasAnyVariant: true,
      };
    }
    const any = await this.client.unifiedVariant.findFirst({
      where: { testId },
      select: { id: true },
    });
    return { variant: null, hasAnyVariant: Boolean(any) };
  }

  async deleteMany(ids: string[]): Promise<void> {
    this.assertWritable();
    if (ids.length === 0) return;
    await this.client.unifiedVariant.deleteMany({
      where: { id: { in: ids } },
    });
  }

  // The per-variant input to the aggregate status recompute: for every variant
  // of a test, does it have a baseline, and what is the status of its latest
  // reviewable comparison. Delegates to the shared status-signal query so the
  // persisted aggregate and the project read model derive from the same shape.
  async findVariantStatusSignals(
    testId: string,
  ): Promise<VariantStatusSignal[]> {
    const rows = await this.findVariantStatusSignalsFor({ testId });
    return rows.map((row) => ({
      hasBaseline: row.hasBaseline,
      latestComparisonStatus: row.latestComparisonStatus,
    }));
  }

  // Single owner of the "variant → status signal" query + row mapping: the
  // persisted aggregate (TestStatusService) and the project overview read model
  // (ProjectReadRepository) both derive their per-variant status from this one
  // query so the read model cannot drift from the aggregate. The status of a
  // variant is its baseline's latest reviewable comparison.
  async findVariantStatusSignalsFor(
    where: Prisma.UnifiedVariantWhereInput,
  ): Promise<VariantStatusSignalRow[]> {
    const variants = await this.client.unifiedVariant.findMany({
      where,
      orderBy: { viewport: 'asc' },
      include: {
        test: { select: { name: true, kind: true } },
        baseline: {
          select: {
            id: true,
            asBaselineComp: LATEST_REVIEWABLE_COMPARISON_QUERY,
          },
        },
      },
    });
    return variants.map((v) => ({
      testName: v.test.name,
      testKind: v.test.kind,
      viewport: v.viewport,
      browser: v.browser,
      environment: v.environment,
      hasBaseline: v.baseline != null,
      latestComparisonStatus: v.baseline?.asBaselineComp[0]?.status ?? null,
    }));
  }

  // The variant gallery's read: every variant of one test with the image that
  // represents it and the latest reviewable comparison's summary. Shares the
  // status set + ordering with findVariantStatusSignalsFor, so the gallery
  // cannot surface a different "latest comparison" than the status it shows.
  async findVariantSummariesFor(testId: string): Promise<VariantSummaryRow[]> {
    const variants = await this.client.unifiedVariant.findMany({
      where: { testId },
      orderBy: [
        { viewport: 'asc' },
        { browser: 'asc' },
        { environment: 'asc' },
      ],
      select: {
        viewport: true,
        browser: true,
        environment: true,
        isInherited: true,
        baseline: {
          select: {
            imageUrl: true,
            asBaselineComp: LATEST_REVIEWABLE_COMPARISON_SUMMARY_QUERY,
          },
        },
      },
    });
    return variants.map((v) => ({
      viewport: v.viewport,
      browser: v.browser,
      environment: v.environment,
      baselineUrl: v.baseline?.imageUrl ?? null,
      isInherited: v.isInherited,
      latestComparison: v.baseline?.asBaselineComp[0] ?? null,
    }));
  }
}
