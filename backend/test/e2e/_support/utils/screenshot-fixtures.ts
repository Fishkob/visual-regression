import type { PrismaClient } from '@/prisma/client';

// Screenshot fixtures for the e2e suite.
//
// A screenshot only exists inside a variant: `UnifiedScreenshot.variantId` is
// NOT NULL and `(testId, variantId, type)` is the unique key that keeps one
// CURRENT row per variant. A test becomes visible to the app when its variant
// adopts the BASELINE row as `UnifiedVariant.baselineId`. The helpers create the
// rows in the same order the upload path does, so a fixture cannot build a
// screenshot no reader can reach.

export interface BaselineFixture {
  testId: string;
  imageHash: string;
  imageUrl: string;
  pageCount?: number;
  pixelDiffThreshold?: number;
  viewport?: string;
  browser?: string;
  environment?: string;
  // `false` leaves the variant without a baseline: the fixture then models a
  // screenshot that exists on one test while another test's variant points at
  // it (the cross-project/cross-test guards the suite exercises).
  adoptBaseline?: boolean;
}

export interface BaselineFixtureResult {
  variantId: string;
  baseline: { id: string };
}

export async function createBaselineWithVariant(
  db: PrismaClient,
  input: BaselineFixture,
): Promise<BaselineFixtureResult> {
  const variant = await db.unifiedVariant.create({
    data: {
      testId: input.testId,
      viewport: input.viewport ?? '1920x1080',
      browser: input.browser ?? 'Chrome',
      environment: input.environment ?? 'staging',
    },
  });
  const baseline = await db.unifiedScreenshot.create({
    data: {
      testId: input.testId,
      variantId: variant.id,
      type: 'BASELINE',
      imageHash: input.imageHash,
      imageUrl: input.imageUrl,
      ...(input.pageCount !== undefined ? { pageCount: input.pageCount } : {}),
      ...(input.pixelDiffThreshold !== undefined
        ? { pixelDiffThreshold: input.pixelDiffThreshold }
        : {}),
    },
  });
  if (input.adoptBaseline ?? true) {
    await db.unifiedVariant.update({
      where: { id: variant.id },
      data: { baselineId: baseline.id },
    });
  }
  return { variantId: variant.id, baseline };
}

// A candidate belongs to the same variant as the baseline it is compared to.
// `baselineId` is unique on UnifiedVariant, so the owning variant is a lookup.
export async function variantIdForBaseline(
  db: PrismaClient,
  baselineId: string,
): Promise<string> {
  const variant = await db.unifiedVariant.findUniqueOrThrow({
    where: { baselineId },
  });
  return variant.id;
}
