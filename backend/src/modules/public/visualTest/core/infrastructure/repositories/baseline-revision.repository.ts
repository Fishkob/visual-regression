import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import type { VariantFilter } from '@public/visualTest/core/domain/value-objects/variant.vo';
import type { BaselineRevisionReason } from '@public/visualTest/core/domain/types/visual-test.types';

export interface BaselineRevisionRow {
  id: string;
  testId: string;
  variantId: string;
  viewport: string;
  browser: string;
  environment: string;
  imageUrl: string;
  imageHash: string;
  pageCount: number | null;
  pixelDiffThreshold: number;
  reason: BaselineRevisionReason;
  createdBy: string | null;
  createdAt: Date;
}

export interface CreateBaselineRevisionInput {
  testId: string;
  variantId: string;
  viewport: string;
  browser: string;
  environment: string;
  imageUrl: string;
  imageHash: string;
  pageCount: number | null;
  pixelDiffThreshold: number;
  reason: BaselineRevisionReason;
  createdBy?: string | null;
}

// History of replaced baselines: every approval records the baseline it
// overwrites, and a restore records the baseline it replaces. Reads are
// newest-first and bounded by the configured retention limit.
@Injectable()
export class BaselineRevisionRepository extends BaseRepository {
  async create(
    input: CreateBaselineRevisionInput,
  ): Promise<BaselineRevisionRow> {
    this.assertWritable();
    return this.client.baselineRevision.create({ data: input });
  }

  async findForTest(
    testId: string,
    filters: VariantFilter,
    take: number,
  ): Promise<BaselineRevisionRow[]> {
    return this.client.baselineRevision.findMany({
      where: {
        testId,
        ...(filters.viewport ? { viewport: filters.viewport } : {}),
        ...(filters.browser ? { browser: filters.browser } : {}),
        ...(filters.environment ? { environment: filters.environment } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  async findByIdForTest(
    testId: string,
    revisionId: string,
  ): Promise<BaselineRevisionRow | null> {
    return this.client.baselineRevision.findFirst({
      where: { id: revisionId, testId },
    });
  }

  // Retention: delete every revision older than the newest `keep` for one
  // variant and return the deleted URLs. The caller funnels them through the
  // reclaim filter before touching storage — a URL another branch's revision
  // still references must survive.
  async pruneBeyond(
    testId: string,
    variantId: string,
    keep: number,
  ): Promise<string[]> {
    this.assertWritable();
    const stale = await this.client.baselineRevision.findMany({
      where: { testId, variantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: keep,
      select: { id: true, imageUrl: true },
    });
    if (stale.length === 0) return [];
    await this.client.baselineRevision.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
    return stale.map((row) => row.imageUrl);
  }

  // The storage sweeps protect every row that still points at an object; a
  // revision is such a reference until it is pruned or its test/variant dies.
  async findReferencedUrls(imageUrls: string[]): Promise<string[]> {
    if (imageUrls.length === 0) return [];
    const rows = await this.client.baselineRevision.findMany({
      where: { imageUrl: { in: imageUrls } },
      select: { imageUrl: true },
    });
    return rows.map((row) => row.imageUrl);
  }
}
