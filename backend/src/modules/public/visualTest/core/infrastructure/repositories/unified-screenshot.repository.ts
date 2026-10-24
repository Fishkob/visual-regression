import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import {
  Variant,
  type VariantFilter,
} from '@public/visualTest/core/domain/value-objects/variant.vo';
import { toScreenshotEntity } from '@public/visualTest/core/infrastructure/mappers/screenshot.mapper';
import {
  VariantStore,
  type VariantBaselineRow,
} from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { TransactionContext } from '@/prisma/transaction-context';

@Injectable()
export class UnifiedScreenshotRepository extends BaseRepository {
  constructor(
    txCtx: TransactionContext,
    private readonly variants: VariantStore,
  ) {
    super(txCtx);
  }

  async findAllImageUrlsForTests(testIds: string[]): Promise<string[]> {
    if (testIds.length === 0) return [];
    const screenshots = await this.client.unifiedScreenshot.findMany({
      where: { testId: { in: testIds } },
      select: { imageUrl: true },
    });
    return screenshots.map((s) => s.imageUrl);
  }

  async findImageUrlsByIds(screenshotIds: string[]): Promise<string[]> {
    if (screenshotIds.length === 0) return [];
    const screenshots = await this.client.unifiedScreenshot.findMany({
      where: { id: { in: screenshotIds } },
      select: { imageUrl: true },
    });
    return screenshots.map((s) => s.imageUrl);
  }

  // The subset of the given URLs that any screenshot row (BASELINE or CURRENT)
  // currently holds as its content URL. The unreferenced-object sweep treats a
  // URL as referenced as soon as a row points at it, so an in-flight upload's
  // store→commit object is never reclaimed while its row exists.
  async findReferencedImageUrls(urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];
    const rows = await this.client.unifiedScreenshot.findMany({
      where: { imageUrl: { in: urls } },
      select: { imageUrl: true },
    });
    return rows.map((row) => row.imageUrl);
  }

  async findBaselineByVariant(
    testId: string,
    variant: Variant,
  ): Promise<ScreenshotEntity | null> {
    const row = await this.variants.findVariantWithBaseline(testId, variant);
    if (!row?.baseline) return null;
    return toScreenshotEntity(row.baseline, variant);
  }

  async findBaselineIdsByFilters(
    testId: string,
    filters?: VariantFilter,
  ): Promise<string[]> {
    return this.variants.findVariantBaselineIds(testId, filters);
  }

  async findScreenshotsForVariant(
    testId: string,
    filters?: VariantFilter,
  ): Promise<{ id: string }[]> {
    if (!Variant.hasFilters(filters)) {
      return this.client.unifiedScreenshot.findMany({
        where: { testId },
        select: { id: true },
      });
    }

    // The variant's CURRENT rows are included directly (not derived from
    // comparisons) so an upload in flight — candidate row present, comparison
    // not yet persisted — is still reclaimed on variant-scoped deletion.
    const variantIds = await this.variants.findIdsByFilters(testId, filters);
    if (variantIds.length === 0) return [];

    return this.client.unifiedScreenshot.findMany({
      where: { testId, variantId: { in: variantIds } },
      select: { id: true },
    });
  }

  async upsertCandidateForVariant(input: {
    testId: string;
    contentHash: string;
    contentUrl: string;
    variant: Variant;
    pageCount?: number;
  }): Promise<{ id: string; replacedUrl: string | null }> {
    this.assertWritable();
    const { testId, contentHash, contentUrl, variant, pageCount } = input;
    const variantId = await this.variants.ensureVariant(testId, variant);
    const previous = await this.client.unifiedScreenshot.findUnique({
      where: {
        testId_variantId_type: { testId, variantId, type: 'CURRENT' },
      },
      select: { imageUrl: true },
    });
    const result = await this.client.unifiedScreenshot.upsert({
      where: {
        testId_variantId_type: { testId, variantId, type: 'CURRENT' },
      },
      create: {
        testId,
        variantId,
        type: 'CURRENT',
        imageHash: contentHash,
        imageUrl: contentUrl,
        pageCount,
      },
      update: { imageHash: contentHash, imageUrl: contentUrl, pageCount },
    });
    return {
      id: result.id,
      replacedUrl:
        previous && previous.imageUrl !== contentUrl ? previous.imageUrl : null,
    };
  }

  async updateBaselineScreenshot(
    baselineId: string,
    data: { imageHash: string; imageUrl: string; pageCount?: number | null },
  ): Promise<void> {
    this.assertWritable();
    const cleanData: Record<string, string | number | null> = {
      imageHash: data.imageHash,
      imageUrl: data.imageUrl,
    };
    if (data.pageCount !== undefined) cleanData.pageCount = data.pageCount;
    await this.client.unifiedScreenshot.update({
      where: { id: baselineId },
      data: cleanData,
    });
  }

  async upsertBaselineForVariant(input: {
    testId: string;
    contentHash: string;
    contentUrl: string;
    variant: Variant;
    pageCount?: number;
  }): Promise<void> {
    this.assertWritable();
    const { testId, contentHash, contentUrl, variant, pageCount } = input;
    const variantId = await this.variants.ensureVariant(testId, variant);
    const result = await this.client.unifiedScreenshot.upsert({
      where: {
        testId_variantId_type: { testId, variantId, type: 'BASELINE' },
      },
      create: {
        testId,
        variantId,
        type: 'BASELINE',
        imageHash: contentHash,
        imageUrl: contentUrl,
        pageCount,
      },
      update: { imageHash: contentHash, imageUrl: contentUrl, pageCount },
    });
    await this.variants.setBaselineId(variantId, result.id);
    // A written baseline is branch-owned, whatever the variant was before (a
    // clone whose row was unlinked, or an inherited variant that now writes its
    // first baseline). Keeping the invariant in one place stops reads from
    // labelling an owned baseline as following the target.
    await this.variants.setInherited(variantId, false);
  }

  async findBaselineForBranch(
    branchId: string,
    testName: string,
    variant: Variant,
  ): Promise<{
    testId: string;
    imageHash: string;
    imageUrl: string;
    pageCount: number | null;
    pixelDiffThreshold: number;
  } | null> {
    // The ancestor test is resolved by NAME, not just by variant: a branch
    // inherits the baseline of the test with the same name, never a sibling
    // test's baseline that happens to share the viewport/browser/environment.
    const row = await this.client.unifiedVariant.findFirst({
      where: {
        test: { branchId, name: testName },
        viewport: variant.viewport,
        browser: variant.browser,
        environment: variant.environment,
        isInherited: false,
        baselineId: { not: null },
      },
      include: { baseline: true },
    });
    if (!row?.baseline) return null;
    return {
      testId: row.baseline.testId,
      imageHash: row.baseline.imageHash,
      imageUrl: row.baseline.imageUrl,
      pageCount: row.baseline.pageCount,
      pixelDiffThreshold: row.baseline.pixelDiffThreshold,
    };
  }

  async cloneInheritedBaseline(input: {
    testId: string;
    source: {
      testId: string;
      imageHash: string;
      imageUrl: string;
      pageCount: number | null;
      pixelDiffThreshold: number;
    };
    variant: Variant;
  }): Promise<VariantBaselineRow> {
    this.assertWritable();
    const variantId = await this.variants.ensureVariant(
      input.testId,
      input.variant,
    );
    const row = await this.client.unifiedScreenshot.upsert({
      where: {
        testId_variantId_type: {
          testId: input.testId,
          variantId,
          type: 'BASELINE',
        },
      },
      create: {
        testId: input.testId,
        variantId,
        type: 'BASELINE',
        imageHash: input.source.imageHash,
        imageUrl: input.source.imageUrl,
        pageCount: input.source.pageCount,
        pixelDiffThreshold: input.source.pixelDiffThreshold,
      },
      update: {
        imageHash: input.source.imageHash,
        imageUrl: input.source.imageUrl,
        pageCount: input.source.pageCount,
      },
    });
    await this.variants.setBaselineId(variantId, row.id);
    await this.variants.setInherited(variantId, true);
    return row;
  }

  async updateInheritedBaseline(input: {
    baselineId: string;
    imageHash: string;
    imageUrl: string;
    pageCount: number | null;
  }): Promise<VariantBaselineRow> {
    this.assertWritable();
    return this.client.unifiedScreenshot.update({
      where: { id: input.baselineId },
      data: {
        imageHash: input.imageHash,
        imageUrl: input.imageUrl,
        pageCount: input.pageCount,
      },
    });
  }

  async markBaselineOwned(baselineId: string): Promise<void> {
    this.assertWritable();
    await this.client.unifiedVariant.updateMany({
      where: { baselineId },
      data: { isInherited: false },
    });
  }

  async findCurrentByVariant(
    testId: string,
    variant: Variant,
  ): Promise<{ id: string; imageHash: string } | null> {
    const variantId = await this.variants.findVariantId(testId, variant);
    if (!variantId) return null;
    return this.client.unifiedScreenshot.findUnique({
      where: {
        testId_variantId_type: { testId, variantId, type: 'CURRENT' },
      },
      select: { id: true, imageHash: true },
    });
  }

  async deleteMany(ids: string[]): Promise<void> {
    this.assertWritable();
    if (ids.length === 0) return;
    await this.client.unifiedScreenshot.deleteMany({
      where: { id: { in: ids } },
    });
  }

  // Owner of the candidate-lifecycle rule for the DOMAIN mutation paths: "a
  // candidate still referenced by a comparison must not be deleted". Deleting a
  // referenced CURRENT row would let Prisma's FK SetNull silently re-point the
  // comparison's candidateId at a row it never referenced. Every domain
  // reclamation (comparison deletion, approval, unchanged diff) funnels through
  // here. The guard is the same Prisma relation filter the maintenance find
  // uses (asCandidateComp: { none: {} }), so the comparison-referenced half of
  // the rule has one spelling. The maintenance sweep additionally protects
  // in-flight candidates in its atomic DELETE guard
  // (OrphanedScreenshotRepository.deleteCurrentOrphansByIds) — a pre-check
  // would race a concurrent re-upsert there — while domain paths cancel their
  // jobs first and so need only the comparison guard.
  async deleteCandidatesAndCollectUrls(
    screenshotIds: string[],
  ): Promise<string[]> {
    this.assertWritable();
    if (screenshotIds.length === 0) return [];

    const rows = await this.client.unifiedScreenshot.findMany({
      where: {
        id: { in: screenshotIds },
        type: 'CURRENT',
        asCandidateComp: { none: {} },
      },
      select: { id: true, imageUrl: true },
    });

    if (rows.length === 0) return [];

    await this.client.unifiedScreenshot.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    const urls = rows.map((row) => row.imageUrl);
    return this.filterReclaimableUrls(urls);
  }

  // Worker-side candidate reclamation: a job whose diff became moot retires
  // its candidate, but only while the row still holds the content the job was
  // created for. The candidate row is re-upserted in place by newer uploads, so
  // a stale job must not delete a row that now belongs to a newer upload.
  async deleteCandidateIfCurrent(
    screenshotId: string,
    expectedUrl: string,
  ): Promise<string[]> {
    this.assertWritable();
    const row = await this.client.unifiedScreenshot.findUnique({
      where: { id: screenshotId },
      select: { imageUrl: true },
    });
    if (row?.imageUrl !== expectedUrl) return [];
    return this.deleteCandidatesAndCollectUrls([screenshotId]);
  }

  // SINGLE OWNER of the "safe to reclaim" chain: a URL still referenced by a
  // baseline or by a live comparison must never be deleted. Every reclaim path
  // funnels its URL collection through here; the comparison-referenced filter is
  // a no-op for callers that have already removed their comparison references,
  // but keeping the full chain in one place means the safety rule has one home.
  async filterReclaimableUrls(imageUrls: string[]): Promise<string[]> {
    return this.filterOutComparisonReferencedUrls(
      await this.filterOutBaselineSharedUrls(imageUrls),
    );
  }

  // Storage objects still referenced by a baseline must not be deleted. The
  // candidate lifecycle (candidate reclamation, orphan cleanup, failed-job
  // cleanup) funnels its URL collection through here so the "don't delete a
  // baseline's file" rule lives beside the Screenshot entity.
  private async filterOutBaselineSharedUrls(
    imageUrls: string[],
  ): Promise<string[]> {
    const shared = new Set(await this.findBaselineImageUrls(imageUrls));
    return imageUrls.filter((url) => !shared.has(url));
  }

  // A URL whose CURRENT row is still referenced by a comparison must not be
  // deleted. Unlike baseline sharing this protects the failed-job cleanup path:
  // a crash-after-commit leaves a comparison referencing the candidate, and the
  // frozen payload URL would otherwise delete a file a live comparison points at.
  private async filterOutComparisonReferencedUrls(
    imageUrls: string[],
  ): Promise<string[]> {
    if (imageUrls.length === 0) return [];
    const rows = await this.client.unifiedScreenshot.findMany({
      where: {
        type: 'CURRENT',
        imageUrl: { in: imageUrls },
        asCandidateComp: { some: {} },
      },
      select: { imageUrl: true },
    });
    const referenced = new Set(rows.map((row) => row.imageUrl));
    return imageUrls.filter((url) => !referenced.has(url));
  }

  private async findBaselineImageUrls(imageUrls: string[]): Promise<string[]> {
    if (imageUrls.length === 0) return [];
    const rows = await this.client.unifiedScreenshot.findMany({
      where: { type: 'BASELINE', imageUrl: { in: imageUrls } },
      select: { imageUrl: true },
    });
    return rows.map((row) => row.imageUrl);
  }

  async updateThresholdMany(
    screenshotIds: string[],
    threshold: number,
  ): Promise<void> {
    this.assertWritable();
    if (screenshotIds.length === 0) return;
    await this.client.unifiedScreenshot.updateMany({
      where: { id: { in: screenshotIds } },
      data: { pixelDiffThreshold: threshold },
    });
  }
}
