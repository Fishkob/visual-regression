import { Injectable } from '@nestjs/common';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import type { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import type { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { toScreenshotEntity } from '@public/visualTest/core/infrastructure/mappers/screenshot.mapper';

// Single owner of "which baseline does this variant compare against on this
// branch": an owned baseline is used as-is, an inherited clone follows the
// target chain (refreshed on every upload) until an approval pins it, and a
// variant without a baseline clones the nearest ancestor's baseline once.
//
// The chain lookup is one statement (UnifiedScreenshotRepository.
// findBaselineOnChain), not a per-ancestor walk: this runs twice per upload —
// once for the identical-upload gate, once for the stored path — so a walk
// would multiply the round-trips on the product's hottest request.
@Injectable()
export class BranchBaselineResolver {
  constructor(
    private readonly variants: VariantStore,
    private readonly screenshots: UnifiedScreenshotRepository,
  ) {}

  async resolveForVariant(input: {
    testId: string;
    testName: string;
    branchId: string;
    variant: Variant;
  }): Promise<ScreenshotEntity | null> {
    const own = await this.variants.findVariantWithBaseline(
      input.testId,
      input.variant,
    );
    if (own?.baseline && !own.isInherited) {
      return toScreenshotEntity(own.baseline, input.variant);
    }

    const source = await this.screenshots.findBaselineOnChain(
      input.branchId,
      input.testName,
      input.variant,
    );

    if (own?.baseline && own.isInherited) {
      if (!source) {
        await this.screenshots.markBaselineOwned(own.baseline.id);
        return toScreenshotEntity(own.baseline, input.variant);
      }
      const refreshed = await this.screenshots.updateInheritedBaseline({
        baselineId: own.baseline.id,
        imageHash: source.imageHash,
        imageUrl: source.imageUrl,
        pageCount: source.pageCount,
      });
      return toScreenshotEntity(refreshed, input.variant);
    }

    if (!source) return null;
    const cloned = await this.screenshots.cloneInheritedBaseline({
      testId: input.testId,
      source,
      variant: input.variant,
    });
    return toScreenshotEntity(cloned, input.variant);
  }

  // Read-only twin of resolveForVariant for the identical-upload gate: which
  // content would this upload be compared against, and does the branch-local
  // clone still need its refresh?
  //
  // The gate must not write, but it also must not decide against a stale clone:
  // when the target has moved, the clone still holds the target's *previous*
  // content, so comparing against it would call an upload identical that the
  // stored path would have refreshed and compared against the new baseline —
  // and the refresh would never run, because the stored path only runs when the
  // gate declines.
  async peekEffectiveBaseline(input: {
    testId: string;
    testName: string;
    branchId: string;
    variant: Variant;
  }): Promise<{ imageHash: string; needsRefresh: boolean } | null> {
    const own = await this.variants.findVariantWithBaseline(
      input.testId,
      input.variant,
    );
    if (own?.baseline && !own.isInherited) {
      return { imageHash: own.baseline.imageHash, needsRefresh: false };
    }
    const source = await this.screenshots.findBaselineOnChain(
      input.branchId,
      input.testName,
      input.variant,
    );
    if (source) {
      // The clone follows the chain, so the effective content is the chain's —
      // and the clone is stale until its URL matches.
      return {
        imageHash: source.imageHash,
        needsRefresh: own?.baseline?.imageUrl !== source.imageUrl,
      };
    }
    // The target chain has no baseline: an existing clone gets pinned to its own
    // content, which is then exactly what the upload is compared against.
    return own?.baseline
      ? { imageHash: own.baseline.imageHash, needsRefresh: false }
      : null;
  }
}
