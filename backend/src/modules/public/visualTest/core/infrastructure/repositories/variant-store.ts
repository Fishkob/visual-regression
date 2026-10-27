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
  TestStatus,
} from '@public/visualTest/core/domain/types/visual-test.types';
import { resolveVariantStatusFromComparison } from '@public/visualTest/core/domain/policies/test-status.policy';
import { RANKED_CTE } from '@public/visualTest/core/infrastructure/repositories/branch-chain.sql';
import { isString } from '@common/utils/is-string';
import { Prisma, type TestKind } from '@/prisma/client';

export interface ProjectVariantPageFilters {
  q?: string;
  kind?: TestKind;
  status?: 'pending' | 'ok';
  viewport?: string;
  browser?: string;
  environment?: string;
}

export interface ProjectVariantStatusRow {
  testName: string;
  kind: string;
  viewport: string;
  browser: string;
  environment: string;
  status: TestStatus;
  origin: 'branch' | 'inherited';
  inheritedFrom: string | null;
}

export interface ProjectVariantFilterOptions {
  viewports: string[];
  browsers: string[];
  environments: string[];
  testCount: number;
  pendingCount: number;
}

interface ProjectVariantPageRow {
  testName: string;
  kind: string;
  viewport: string;
  browser: string;
  environment: string;
  hasBaseline: boolean;
  hasPending: boolean;
  isOwn: boolean;
  branchName: string;
  total?: bigint;
}

// "This variant has a comparison awaiting review". The write side enforces at
// most one PENDING_APPROVAL comparison per variant, so an EXISTS is equivalent
// to asking whether the latest reviewable comparison is pending — and it keeps
// the whole page query in one statement without re-encoding the read model's
// ordering tie-break.
const PENDING_COMPARISON_EXISTS = Prisma.sql`EXISTS (
  SELECT 1 FROM "UnifiedComparison" c
  WHERE c."baselineId" = v."baselineId" AND c.status = 'PENDING_APPROVAL'
)`;

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

  // Owner of the "variant → status signal" query + row mapping for the
  // persisted aggregate: for every variant of a test, does it have a baseline,
  // and what is the status of its latest reviewable comparison. The status is
  // its baseline's latest reviewable comparison — one row per baseline, picked
  // by the shared LATEST_REVIEWABLE_COMPARISON_QUERY ordering.
  //
  // The project overview does NOT compose this query: its unit is a page of
  // variants across a branch chain, so it reads them in one statement
  // (findProjectVariantPage) and lets an EXISTS over PENDING_APPROVAL stand in
  // for "the latest reviewable comparison is pending". That substitution holds
  // only because the write side keeps at most one pending comparison per
  // variant; the two encodings are pinned equal by
  // "lifecycle-after-approval.e2e-spec.ts". Change the reviewable set or the
  // ordering and both move together — that test is the alarm.
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

  // The project overview's paginated read: one row per variant of the branch's
  // effective tests, filtered and counted in the same statement. This is the
  // variant-level sibling of findEffectiveTests — the overview table's unit is
  // a variant row, and every filter (test name, kind, status, viewport/browser/
  // environment) applies to that row, so paginating by variant keeps page and
  // total consistent.
  async findProjectVariantPage(
    branchId: string,
    filters: ProjectVariantPageFilters,
    pagination: { skip: number; take: number },
  ): Promise<{ data: ProjectVariantStatusRow[]; total: number }> {
    const where = this.projectVariantWhere(filters);

    const rows = await this.client.$queryRaw<
      ProjectVariantPageRow[]
    >(Prisma.sql`
      ${RANKED_CTE(branchId)}
      SELECT r."name" AS "testName", r."kind",
             v."viewport", v."browser", v."environment",
             (v."baselineId" IS NOT NULL) AS "hasBaseline",
             ${PENDING_COMPARISON_EXISTS} AS "hasPending",
             (r."depth" = 0) AS "isOwn",
             b."name" AS "branchName",
             COUNT(*) OVER() AS "total"
      FROM ranked r
      JOIN "Branch" b ON b."id" = r."branchId"
      JOIN "UnifiedVariant" v ON v."testId" = r."id"
      WHERE ${where}
      ORDER BY r."name" ASC, v."viewport" ASC, v."browser" ASC, v."environment" ASC
      OFFSET ${pagination.skip} LIMIT ${pagination.take}
    `);

    const total =
      rows.length > 0
        ? Number(rows[0].total ?? 0)
        : await this.countProjectVariantPage(branchId, where);

    return {
      data: rows.map((row) => ({
        testName: row.testName,
        kind: row.kind,
        viewport: row.viewport,
        browser: row.browser,
        environment: row.environment,
        status: resolveVariantStatusFromComparison(
          row.hasPending ? ComparisonStatus.PENDING_APPROVAL : undefined,
          row.hasBaseline,
        ),
        origin: row.isOwn ? 'branch' : 'inherited',
        inheritedFrom: row.isOwn ? null : row.branchName,
      })),
      total,
    };
  }

  // The filter dropdown values for the branch. Derived from the whole effective
  // set (not the page), so paginating cannot hide a viewport/browser/environment.
  async findProjectVariantFilterOptions(
    branchId: string,
  ): Promise<ProjectVariantFilterOptions> {
    const rows = await this.client.$queryRaw<
      {
        testCount: bigint;
        pendingCount: bigint;
        viewports: string[] | null;
        browsers: string[] | null;
        environments: string[] | null;
      }[]
    >(Prisma.sql`
      ${RANKED_CTE(branchId)}
      SELECT COUNT(DISTINCT r."id") AS "testCount",
             COUNT(*) FILTER (
               WHERE v."baselineId" IS NOT NULL AND ${PENDING_COMPARISON_EXISTS}
             ) AS "pendingCount",
             ARRAY_AGG(DISTINCT v."viewport") AS viewports,
             ARRAY_AGG(DISTINCT v."browser") AS browsers,
             ARRAY_AGG(DISTINCT v."environment") AS environments
      FROM ranked r
      JOIN "UnifiedVariant" v ON v."testId" = r."id"
      WHERE r."rn" = 1
    `);
    const row = rows[0];
    return {
      viewports: (row?.viewports ?? []).filter(isString).sort(),
      browsers: (row?.browsers ?? []).filter(isString).sort(),
      environments: (row?.environments ?? []).filter(isString).sort(),
      testCount: Number(row?.testCount ?? 0),
      pendingCount: Number(row?.pendingCount ?? 0),
    };
  }

  private async countProjectVariantPage(
    branchId: string,
    where: Prisma.Sql,
  ): Promise<number> {
    const rows = await this.client.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      ${RANKED_CTE(branchId)}
      SELECT COUNT(*) AS "total"
      FROM ranked r
      JOIN "UnifiedVariant" v ON v."testId" = r."id"
      WHERE ${where}
    `);
    return Number(rows[0]?.total ?? 0);
  }

  private projectVariantWhere(filters: ProjectVariantPageFilters): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`r."rn" = 1`];
    if (filters.kind) conditions.push(Prisma.sql`r."kind" = ${filters.kind}`);
    if (filters.q) {
      conditions.push(Prisma.sql`r."name" ILIKE ${`%${filters.q}%`}`);
    }
    if (filters.viewport) {
      conditions.push(Prisma.sql`v."viewport" = ${filters.viewport}`);
    }
    if (filters.browser) {
      conditions.push(Prisma.sql`v."browser" = ${filters.browser}`);
    }
    if (filters.environment) {
      conditions.push(Prisma.sql`v."environment" = ${filters.environment}`);
    }
    if (filters.status === 'pending') {
      conditions.push(PENDING_COMPARISON_EXISTS);
    } else if (filters.status === 'ok') {
      // Parity with the table's client-side rule: "ok" is everything that is
      // not awaiting review, including a variant with no baseline yet.
      conditions.push(Prisma.sql`NOT ${PENDING_COMPARISON_EXISTS}`);
    }
    return Prisma.join(conditions, ' AND ');
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
