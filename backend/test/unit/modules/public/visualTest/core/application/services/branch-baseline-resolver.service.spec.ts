import type { Mocked } from 'vitest';
import { BranchBaselineResolver } from '@public/visualTest/core/application/services/branch-baseline-resolver.service';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { createMock } from '@test/utils/create-mock';

describe('BranchBaselineResolver', () => {
  let resolver: BranchBaselineResolver;
  let variants: Mocked<VariantStore>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let branches: Mocked<BranchRepository>;
  const variant = Variant.fromStrings('1920x1080', 'chromium', 'staging');

  beforeEach(() => {
    variants = createMock<VariantStore>();
    screenshots = createMock<UnifiedScreenshotRepository>();
    branches = createMock<BranchRepository>();
    resolver = new BranchBaselineResolver(variants, screenshots, branches);
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
  });

  it('clones the nearest target baseline when the branch has none', async () => {
    variants.findVariantWithBaseline.mockResolvedValue(null);
    branches.findTargetChainIds.mockResolvedValue(['br-main']);
    screenshots.findBaselineForBranch.mockResolvedValue({
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

    expect(screenshots.findBaselineForBranch).toHaveBeenCalledWith(
      'br-main',
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

  // "Nearest ancestor wins" is the whole point of the chain lookup; a reversed
  // iteration (or taking the last element) would still pass a one-element test.
  it('uses the nearest ancestor when several of them have a baseline', async () => {
    variants.findVariantWithBaseline.mockResolvedValue(null);
    branches.findTargetChainIds.mockResolvedValue(['br-parent', 'br-main']);
    screenshots.findBaselineForBranch.mockImplementation(
      async (branchId: string) =>
        branchId === 'br-parent'
          ? {
              testId: 'test-parent',
              imageHash: 'parent-hash',
              imageUrl: 'parent-url',
              pageCount: 1,
              pixelDiffThreshold: 5,
            }
          : {
              testId: 'test-main',
              imageHash: 'main-hash',
              imageUrl: 'main-url',
              pageCount: 1,
              pixelDiffThreshold: 3,
            },
    );
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

    expect(screenshots.findBaselineForBranch).toHaveBeenCalledTimes(1);
    expect(screenshots.findBaselineForBranch).toHaveBeenNthCalledWith(
      1,
      'br-parent',
      'login',
      variant,
    );
    expect(screenshots.cloneInheritedBaseline).toHaveBeenCalledWith({
      testId: 'test-1',
      source: {
        testId: 'test-parent',
        imageHash: 'parent-hash',
        imageUrl: 'parent-url',
        pageCount: 1,
        pixelDiffThreshold: 5,
      },
      variant,
    });
  });

  it('only inherits from the ancestor test with the same name', async () => {
    variants.findVariantWithBaseline.mockResolvedValue(null);
    branches.findTargetChainIds.mockResolvedValue(['br-main']);
    // The repository answers with the ancestor of the requested name; a
    // sibling test's baseline is not considered (the query filters by name).
    screenshots.findBaselineForBranch.mockResolvedValue(null);

    await expect(
      resolver.resolveForVariant({
        testId: 'pdf-test',
        testName: 'pdf-report',
        branchId: 'br-feature',
        variant,
      }),
    ).resolves.toBeNull();

    expect(screenshots.findBaselineForBranch).toHaveBeenCalledWith(
      'br-main',
      'pdf-report',
      variant,
    );
    expect(screenshots.cloneInheritedBaseline).not.toHaveBeenCalled();
  });

  it('returns null when neither the branch nor its chain has a baseline', async () => {
    variants.findVariantWithBaseline.mockResolvedValue(null);
    branches.findTargetChainIds.mockResolvedValue(['br-main']);
    screenshots.findBaselineForBranch.mockResolvedValue(null);

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
    branches.findTargetChainIds.mockResolvedValue(['br-main']);
    screenshots.findBaselineForBranch.mockResolvedValue({
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
    branches.findTargetChainIds.mockResolvedValue(['br-main']);
    screenshots.findBaselineForBranch.mockResolvedValue(null);

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
      expect(branches.findTargetChainIds).not.toHaveBeenCalled();
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
      branches.findTargetChainIds.mockResolvedValue(['br-main']);
      screenshots.findBaselineForBranch.mockResolvedValue({
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
      branches.findTargetChainIds.mockResolvedValue(['br-main']);
      screenshots.findBaselineForBranch.mockResolvedValue({
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
      branches.findTargetChainIds.mockResolvedValue(['br-main']);
      screenshots.findBaselineForBranch.mockResolvedValue(null);

      await expect(resolver.peekEffectiveBaseline(input)).resolves.toEqual({
        imageHash: 'pinned',
        needsRefresh: false,
      });
    });

    it('returns null when nothing on the chain has a baseline', async () => {
      variants.findVariantWithBaseline.mockResolvedValue(null);
      branches.findTargetChainIds.mockResolvedValue(['br-main']);
      screenshots.findBaselineForBranch.mockResolvedValue(null);

      await expect(resolver.peekEffectiveBaseline(input)).resolves.toBeNull();
    });
  });
});
