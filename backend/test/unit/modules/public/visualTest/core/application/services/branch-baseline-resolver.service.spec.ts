import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BranchBaselineResolver } from '@public/visualTest/core/application/services/branch-baseline-resolver.service';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import type { VariantBaselineRow } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { createMock } from '@test/utils/create-mock';

describe('BranchBaselineResolver', () => {
  let resolver: BranchBaselineResolver;
  let variants: Mocked<VariantStore>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  const variant = Variant.fromStrings('1920x1080', 'chromium', 'staging');

  beforeEach(() => {
    variants = createMock<VariantStore>();
    screenshots = createMock<UnifiedScreenshotRepository>();
    resolver = new BranchBaselineResolver(variants, screenshots);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a branch-owned baseline as-is', async () => {
    variants.findVariantWithBaseline.mockResolvedValue({
      baselineId: 'base-1',
      isInherited: false,
      baseline: {
        id: 'base-1',
        testId: 'test-1',
        type: 'BASELINE',
        imageHash: 'h',
        imageUrl: 'u',
        pageCount: null,
        pixelDiffThreshold: 0,
        createdAt: new Date(),
      },
    });

    const result = await resolver.resolveForVariant({
      testId: 'test-1',
      testName: 'login',
      branchId: 'br-feature',
      variant,
    });

    expect(result).toMatchObject({ id: 'base-1', imageHash: 'h' });
    expect(screenshots.cloneInheritedBaseline).not.toHaveBeenCalled();
    // An owned baseline never asks the chain: the lookup is the second read of
    // the upload path and must not run for the branch's own content.
    expect(screenshots.findBaselineOnChain).not.toHaveBeenCalled();
  });

  it('clones the nearest target baseline when the branch has none', async () => {
    variants.findVariantWithBaseline.mockResolvedValue(null);
    screenshots.findBaselineOnChain.mockResolvedValue({
      testId: 'test-main',
      imageHash: 'main-hash',
      imageUrl: 'main-url',
      pageCount: 1,
      pixelDiffThreshold: 3,
    });
    screenshots.cloneInheritedBaseline.mockResolvedValue({
      id: 'base-clone',
      testId: 'test-1',
      type: 'BASELINE',
      imageHash: 'main-hash',
      imageUrl: 'main-url',
      pageCount: 1,
      pixelDiffThreshold: 3,
      createdAt: new Date(),
    });

    const result = await resolver.resolveForVariant({
      testId: 'test-1',
      testName: 'login',
      branchId: 'br-feature',
      variant,
    });

    expect(screenshots.findBaselineOnChain).toHaveBeenCalledWith(
      'br-feature',
      'login',
      variant,
    );
    expect(screenshots.cloneInheritedBaseline).toHaveBeenCalledWith({
      testId: 'test-1',
      source: {
        testId: 'test-main',
        imageHash: 'main-hash',
        imageUrl: 'main-url',
        pageCount: 1,
        pixelDiffThreshold: 3,
      },
      variant,
    });
    expect(result).toMatchObject({ id: 'base-clone' });
  });

  // "Nearest ancestor wins" is now decided by the chain query's ORDER BY depth
  // (see branch-baselines.e2e-spec "surfaces the nearest ancestor for a
  // two-level chain"). What this unit test still guards is the calling
  // convention: the whole chain is resolved in ONE lookup from the branch the
  // caller named, not walked hop by hop from the caller.
  it('resolves the whole chain in a single lookup', async () => {
    variants.findVariantWithBaseline.mockResolvedValue(null);
    screenshots.findBaselineOnChain.mockResolvedValue({
      testId: 'test-parent',
      imageHash: 'parent-hash',
      imageUrl: 'parent-url',
      pageCount: 1,
      pixelDiffThreshold: 5,
    });
    screenshots.cloneInheritedBaseline.mockResolvedValue({
      id: 'base-clone',
      testId: 'test-1',
      type: 'BASELINE',
      imageHash: 'parent-hash',
      imageUrl: 'parent-url',
      pageCount: 1,
      pixelDiffThreshold: 5,
      createdAt: new Date(),
    });

    await resolver.resolveForVariant({
      testId: 'test-1',
      testName: 'login',
      branchId: 'br-feature',
      variant,
    });

    expect(screenshots.findBaselineOnChain).toHaveBeenCalledTimes(1);
    expect(screenshots.findBaselineOnChain).toHaveBeenCalledWith(
      'br-feature',
      'login',
      variant,
    );
  });

  it('only inherits from the ancestor test with the same name', async () => {
    variants.findVariantWithBaseline.mockResolvedValue(null);
    // The repository answers with the ancestor of the requested name; a
    // sibling test's baseline is not considered (the query filters by name).
    screenshots.findBaselineOnChain.mockResolvedValue(null);

    await expect(
      resolver.resolveForVariant({
        testId: 'pdf-test',
        testName: 'pdf-report',
        branchId: 'br-feature',
        variant,
      }),
    ).resolves.toBeNull();

    expect(screenshots.findBaselineOnChain).toHaveBeenCalledWith(
      'br-feature',
      'pdf-report',
      variant,
    );
    expect(screenshots.cloneInheritedBaseline).not.toHaveBeenCalled();
  });

  it('returns null when neither the branch nor its chain has a baseline', async () => {
    variants.findVariantWithBaseline.mockResolvedValue(null);
    screenshots.findBaselineOnChain.mockResolvedValue(null);

    await expect(
      resolver.resolveForVariant({
        testId: 'test-1',
        testName: 'login',
        branchId: 'br-feature',
        variant,
      }),
    ).resolves.toBeNull();
    expect(screenshots.cloneInheritedBaseline).not.toHaveBeenCalled();
  });

  it('refreshes an inherited clone while preserving the branch threshold', async () => {
    variants.findVariantWithBaseline.mockResolvedValue({
      baselineId: 'base-clone',
      isInherited: true,
      baseline: {
        id: 'base-clone',
        testId: 'test-1',
        type: 'BASELINE',
        imageHash: 'old',
        imageUrl: 'old-url',
        pageCount: 1,
        pixelDiffThreshold: 7,
        createdAt: new Date(),
      },
    });
    screenshots.findBaselineOnChain.mockResolvedValue({
      testId: 'test-main',
      imageHash: 'new',
      imageUrl: 'new-url',
      pageCount: 2,
      pixelDiffThreshold: 0,
    });
    screenshots.updateInheritedBaseline.mockResolvedValue({
      id: 'base-clone',
      testId: 'test-1',
      type: 'BASELINE',
      imageHash: 'new',
      imageUrl: 'new-url',
      pageCount: 2,
      pixelDiffThreshold: 7,
      createdAt: new Date(),
    });

    const result = await resolver.resolveForVariant({
      testId: 'test-1',
      testName: 'login',
      branchId: 'br-feature',
      variant,
    });

    expect(screenshots.updateInheritedBaseline).toHaveBeenCalledWith({
      baselineId: 'base-clone',
      imageHash: 'new',
      imageUrl: 'new-url',
      pageCount: 2,
    });
    expect(result).toMatchObject({ id: 'base-clone', pixelDiffThreshold: 7 });
  });

  it('pins the clone when the target baseline disappears', async () => {
    variants.findVariantWithBaseline.mockResolvedValue({
      baselineId: 'base-clone',
      isInherited: true,
      baseline: {
        id: 'base-clone',
        testId: 'test-1',
        type: 'BASELINE',
        imageHash: 'old',
        imageUrl: 'old-url',
        pageCount: 1,
        pixelDiffThreshold: 0,
        createdAt: new Date(),
      },
    });
    screenshots.findBaselineOnChain.mockResolvedValue(null);

    const result = await resolver.resolveForVariant({
      testId: 'test-1',
      testName: 'login',
      branchId: 'br-feature',
      variant,
    });

    expect(screenshots.markBaselineOwned).toHaveBeenCalledWith('base-clone');
    expect(result).toMatchObject({ id: 'base-clone' });
  });

  describe('peekEffectiveBaseline', () => {
    const baselineRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'shot-1',
      testId: 'test-1',
      type: 'BASELINE',
      imageHash: 'h',
      imageUrl: 'u',
      pageCount: null,
      pixelDiffThreshold: 0,
      createdAt: new Date(),
      ...overrides,
    });

    const input = {
      testId: 'test-1',
      testName: 'login',
      branchId: 'br-1',
      variant,
    };

    it('uses an owned baseline as-is', async () => {
      variants.findVariantWithBaseline.mockResolvedValue({
        baselineId: 'shot-1',
        isInherited: false,
        baseline: baselineRow({ imageHash: 'owned' }),
      } as never);

      await expect(resolver.peekEffectiveBaseline(input)).resolves.toEqual({
        imageHash: 'owned',
        needsRefresh: false,
      });
      expect(screenshots.findBaselineOnChain).not.toHaveBeenCalled();
    });

    // The gate must see the chain's content, and must know that the clone is
    // stale — otherwise it would short-circuit the refresh.
    it('reports the chain baseline and a pending refresh for a stale clone', async () => {
      variants.findVariantWithBaseline.mockResolvedValue({
        baselineId: 'shot-1',
        isInherited: true,
        baseline: baselineRow({
          imageHash: 'old',
          imageUrl: 'http://s/old.png',
        }),
      } as never);
      screenshots.findBaselineOnChain.mockResolvedValue({
        testId: 'test-main',
        imageHash: 'new',
        imageUrl: 'http://s/new.png',
        pageCount: null,
        pixelDiffThreshold: 0,
      });

      await expect(resolver.peekEffectiveBaseline(input)).resolves.toEqual({
        imageHash: 'new',
        needsRefresh: true,
      });
    });

    it('reports no refresh when the clone already matches the chain', async () => {
      variants.findVariantWithBaseline.mockResolvedValue({
        baselineId: 'shot-1',
        isInherited: true,
        baseline: baselineRow({
          imageHash: 'same',
          imageUrl: 'http://s/same.png',
        }),
      } as never);
      screenshots.findBaselineOnChain.mockResolvedValue({
        testId: 'test-main',
        imageHash: 'same',
        imageUrl: 'http://s/same.png',
        pageCount: null,
        pixelDiffThreshold: 0,
      });

      await expect(resolver.peekEffectiveBaseline(input)).resolves.toEqual({
        imageHash: 'same',
        needsRefresh: false,
      });
    });

    it('falls back to the pinned clone when the chain lost its baseline', async () => {
      variants.findVariantWithBaseline.mockResolvedValue({
        baselineId: 'shot-1',
        isInherited: true,
        baseline: baselineRow({ imageHash: 'pinned' }),
      } as never);
      screenshots.findBaselineOnChain.mockResolvedValue(null);

      await expect(resolver.peekEffectiveBaseline(input)).resolves.toEqual({
        imageHash: 'pinned',
        needsRefresh: false,
      });
    });

    it('returns null when nothing on the chain has a baseline', async () => {
      variants.findVariantWithBaseline.mockResolvedValue(null);
      screenshots.findBaselineOnChain.mockResolvedValue(null);

      await expect(resolver.peekEffectiveBaseline(input)).resolves.toBeNull();
    });
  });

  // The two entry points are twins over the same owned/inherited/clone tree:
  // `resolveForVariant` may write, `peekEffectiveBaseline` must not, but for the
  // same input both have to name the same effective baseline. Each fixture seeds
  // BOTH calls with their own mocks, so a write on one side cannot feed the
  // other, and the comparison is between the two answers, not against a literal.
  describe('equivalence with peekEffectiveBaseline', () => {
    const input = {
      testId: 'test-1',
      testName: 'login',
      branchId: 'br-feature',
      variant,
    };

    type Seed = (
      mockedVariants: Mocked<VariantStore>,
      mockedScreenshots: Mocked<UnifiedScreenshotRepository>,
    ) => void;

    interface ChainSource {
      testId: string;
      imageHash: string;
      imageUrl: string;
      pageCount: number | null;
      pixelDiffThreshold: number;
    }

    function baselineRow(
      overrides: Partial<VariantBaselineRow> = {},
    ): VariantBaselineRow {
      return {
        id: 'base-1',
        testId: 'test-1',
        type: 'BASELINE',
        imageHash: 'hash-1',
        imageUrl: 'http://storage/hash-1.png',
        pageCount: null,
        pixelDiffThreshold: 0,
        createdAt: new Date(),
        ...overrides,
      };
    }

    function chainSource(overrides: Partial<ChainSource> = {}): ChainSource {
      return {
        testId: 'test-main',
        imageHash: 'hash-1',
        imageUrl: 'http://storage/hash-1.png',
        pageCount: null,
        pixelDiffThreshold: 0,
        ...overrides,
      };
    }

    async function resolverFor(seed: Seed): Promise<BranchBaselineResolver> {
      const mockedVariants = createMock<VariantStore>();
      const mockedScreenshots = createMock<UnifiedScreenshotRepository>();
      seed(mockedVariants, mockedScreenshots);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BranchBaselineResolver,
          { provide: VariantStore, useValue: mockedVariants },
          { provide: UnifiedScreenshotRepository, useValue: mockedScreenshots },
        ],
      }).compile();
      return module.get(BranchBaselineResolver);
    }

    // The comparable part of both answers: which content the variant effectively
    // holds on this branch, and `null` when it holds no baseline at all.
    const effectiveHash = (
      result: { imageHash: string } | null,
    ): string | null => (result === null ? null : result.imageHash);

    async function effectiveHashByBothMethods(
      seed: Seed,
    ): Promise<{ peeked: string | null; resolved: string | null }> {
      const peeked = await (
        await resolverFor(seed)
      ).peekEffectiveBaseline(input);
      const resolved = await (await resolverFor(seed)).resolveForVariant(input);
      return {
        peeked: effectiveHash(peeked),
        resolved: effectiveHash(resolved),
      };
    }

    const seedOwned: Seed = (mockedVariants, mockedScreenshots) => {
      mockedVariants.findVariantWithBaseline.mockResolvedValue({
        baselineId: 'base-owned',
        isInherited: false,
        baseline: baselineRow({
          id: 'base-owned',
          imageHash: 'owned-hash',
          imageUrl: 'http://storage/owned.png',
        }),
      });
      mockedScreenshots.findBaselineOnChain.mockResolvedValue(null);
    };

    const seedStaleClone: Seed = (mockedVariants, mockedScreenshots) => {
      mockedVariants.findVariantWithBaseline.mockResolvedValue({
        baselineId: 'base-clone',
        isInherited: true,
        baseline: baselineRow({
          id: 'base-clone',
          imageHash: 'stale-hash',
          imageUrl: 'http://storage/stale.png',
        }),
      });
      mockedScreenshots.findBaselineOnChain.mockResolvedValue(
        chainSource({
          imageHash: 'target-hash',
          imageUrl: 'http://storage/target.png',
        }),
      );
      // The refresh writes the chain's content onto the clone, so the effective
      // content is the target's — the stale row is what stays behind.
      mockedScreenshots.updateInheritedBaseline.mockResolvedValue(
        baselineRow({
          id: 'base-clone',
          imageHash: 'target-hash',
          imageUrl: 'http://storage/target.png',
        }),
      );
    };

    const seedPinnedClone: Seed = (mockedVariants, mockedScreenshots) => {
      mockedVariants.findVariantWithBaseline.mockResolvedValue({
        baselineId: 'base-clone',
        isInherited: true,
        baseline: baselineRow({
          id: 'base-clone',
          imageHash: 'pinned-hash',
          imageUrl: 'http://storage/pinned.png',
        }),
      });
      // The target lost its baseline, so the clone is pinned to its own content.
      mockedScreenshots.findBaselineOnChain.mockResolvedValue(null);
      mockedScreenshots.markBaselineOwned.mockResolvedValue(undefined);
    };

    const seedNoBaseline: Seed = (mockedVariants, mockedScreenshots) => {
      mockedVariants.findVariantWithBaseline.mockResolvedValue(null);
      mockedScreenshots.findBaselineOnChain.mockResolvedValue(null);
    };

    it('delivers the same effective baseline for an owned baseline', async () => {
      const { peeked, resolved } = await effectiveHashByBothMethods(seedOwned);

      expect(peeked).toEqual(resolved);
    });

    it('delivers the same effective baseline for a stale clone', async () => {
      const { peeked, resolved } =
        await effectiveHashByBothMethods(seedStaleClone);

      expect(peeked).toEqual(resolved);
    });

    it('delivers the same effective baseline for a pinned clone', async () => {
      const { peeked, resolved } =
        await effectiveHashByBothMethods(seedPinnedClone);

      expect(peeked).toEqual(resolved);
    });

    it('delivers the same effective baseline when neither branch nor chain has one', async () => {
      const { peeked, resolved } =
        await effectiveHashByBothMethods(seedNoBaseline);

      expect(peeked).toEqual(resolved);
    });
  });
});
