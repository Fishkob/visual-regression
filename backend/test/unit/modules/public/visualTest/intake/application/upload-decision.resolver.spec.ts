import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UploadDecisionResolver } from '@public/visualTest/intake/application/upload-decision.resolver';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchBaselineResolver } from '@public/visualTest/core/application/services/branch-baseline-resolver.service';
import { BranchTestRepository } from '@public/visualTest/core/infrastructure/repositories/branch-test.repository';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { ComparisonOutcome } from '@common/domain/upload-outcome';
import { createMock } from '@test/utils/create-mock';

describe('UploadDecisionResolver', () => {
  let resolver: UploadDecisionResolver;
  let tests: Mocked<UnifiedTestRepository>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;
  let branches: Mocked<BranchResolver>;
  let baselines: Mocked<BranchBaselineResolver>;
  let branchTests: Mocked<BranchTestRepository>;

  const params = {
    projectName: 'test-project',
    testName: 'test-name',
    viewport: '1920x1080',
    browser: 'chromium',
    environment: 'staging',
    file: {
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
    } as Express.Multer.File,
  };

  const mainBranch = {
    projectId: 'proj-1',
    branchId: 'br-main',
    branchName: 'main',
    isDefault: true,
    isArchived: false,
  };

  function makeBaseline(
    overrides: Partial<ConstructorParameters<typeof ScreenshotEntity>[0]> = {},
  ): ScreenshotEntity {
    return new ScreenshotEntity({
      id: 'base-1',
      visualTestId: 'test-1',
      type: 'BASELINE',
      imageHash: 'base-hash',
      imageUrl: 'http://example.com/base.png',
      variant: Variant.fromStrings('1920x1080', 'chromium', 'staging'),
      createdAt: new Date('2025-01-01T00:00:00Z'),
      pixelDiffThreshold: 0,
      ...overrides,
    });
  }

  function makeTest(
    overrides: Partial<{
      id: string;
      name: string;
      kind: 'image' | 'pdf';
      createdAt: Date;
    }> = {},
  ) {
    return {
      id: 'test-1',
      name: 'test-name',
      kind: 'image',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      ...overrides,
    } as const;
  }

  beforeEach(async () => {
    tests = createMock<UnifiedTestRepository>();
    screenshots = createMock<UnifiedScreenshotRepository>();
    branches = createMock<BranchResolver>();
    baselines = createMock<BranchBaselineResolver>();
    branchTests = createMock<BranchTestRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadDecisionResolver,
        { provide: UnifiedTestRepository, useValue: tests },
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
        { provide: BranchResolver, useValue: branches },
        { provide: BranchBaselineResolver, useValue: baselines },
        { provide: BranchTestRepository, useValue: branchTests },
      ],
    }).compile();

    resolver = module.get(UploadDecisionResolver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('peekIdentical', () => {
    it('resolves the default branch when no branch is given', async () => {
      branches.findReadOrNull.mockResolvedValue(mainBranch);
      tests.findByBranchAndTestName.mockResolvedValue(makeTest());
      baselines.peekEffectiveBaseline.mockResolvedValue({
        imageHash: 'same-hash',
        needsRefresh: false,
      });

      const result = await resolver.peekIdentical(params, 'same-hash');

      expect(result).toEqual({ testId: 'test-1', branch: mainBranch });
      expect(branches.findReadOrNull).toHaveBeenCalledWith(
        'test-project',
        undefined,
      );
      expect(tests.findByBranchAndTestName).toHaveBeenCalledWith(
        'br-main',
        'test-name',
      );
    });

    it('returns null without writing when the branch does not exist yet', async () => {
      branches.findReadOrNull.mockResolvedValue(null);

      const result = await resolver.peekIdentical(params, 'hash');

      expect(result).toBeNull();
      expect(tests.findByBranchAndTestName).not.toHaveBeenCalled();
      expect(baselines.peekEffectiveBaseline).not.toHaveBeenCalled();
    });

    it('returns null without resolving a baseline when the test does not exist', async () => {
      branches.findReadOrNull.mockResolvedValue(mainBranch);
      tests.findByBranchAndTestName.mockResolvedValue(null);

      const result = await resolver.peekIdentical(params, 'hash');

      expect(result).toBeNull();
      expect(baselines.peekEffectiveBaseline).not.toHaveBeenCalled();
    });

    // The clone follows the target chain; when the target moved, the clone is
    // stale, so the stored path must run to refresh it and decide — a fast path
    // on the stale content would skip the refresh entirely.
    it('declines when the inherited clone still needs its refresh', async () => {
      branches.findReadOrNull.mockResolvedValue(mainBranch);
      tests.findByBranchAndTestName.mockResolvedValue(makeTest());
      baselines.peekEffectiveBaseline.mockResolvedValue({
        imageHash: 'same-hash',
        needsRefresh: true,
      });

      const result = await resolver.peekIdentical(params, 'same-hash');

      expect(result).toBeNull();
    });

    it('returns null when the upload is not identical', async () => {
      branches.findReadOrNull.mockResolvedValue(mainBranch);
      tests.findByBranchAndTestName.mockResolvedValue(makeTest());
      baselines.peekEffectiveBaseline.mockResolvedValue({
        imageHash: 'other-hash',
        needsRefresh: false,
      });

      const result = await resolver.peekIdentical(params, 'hash');

      expect(result).toBeNull();
    });

    it('returns null for an archived branch', async () => {
      branches.findReadOrNull.mockResolvedValue({
        ...mainBranch,
        isArchived: true,
      });

      const result = await resolver.peekIdentical(params, 'hash');

      expect(result).toBeNull();
      expect(tests.findByBranchAndTestName).not.toHaveBeenCalled();
    });
  });

  describe('resolveStored', () => {
    it('ensures the test on the resolved branch', async () => {
      branches.resolveForUpload.mockResolvedValue({
        projectId: 'proj-1',
        branchId: 'br-feature',
        branchName: 'feature/x',
        isDefault: false,
        isArchived: false,
      });
      tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
      baselines.resolveForVariant.mockResolvedValue(null);

      await resolver.resolveStored(
        'image',
        { ...params, branch: 'feature/x' },
        'hash',
      );

      expect(tests.ensureTest).toHaveBeenCalledWith(
        'br-feature',
        'test-name',
        'image',
      );
    });

    it('ensures the test and queues a comparison when the hashes differ', async () => {
      branches.resolveForUpload.mockResolvedValue(mainBranch);
      tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
      baselines.resolveForVariant.mockResolvedValue(makeBaseline());

      const result = await resolver.resolveStored('image', params, 'new-hash');

      expect(result.decision).toEqual(
        expect.objectContaining({
          status: ComparisonOutcome.COMPARISON_QUEUED,
          testId: 'test-1',
          contentHash: 'new-hash',
        }),
      );
    });

    it('reports an identical upload when the hashes match', async () => {
      branches.resolveForUpload.mockResolvedValue(mainBranch);
      tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
      baselines.resolveForVariant.mockResolvedValue(
        makeBaseline({ imageHash: 'same-hash' }),
      );

      const result = await resolver.resolveStored('image', params, 'same-hash');

      expect(result.decision).toEqual(
        expect.objectContaining({
          status: ComparisonOutcome.IDENTICAL,
          testId: 'test-1',
        }),
      );
    });

    it('reports a baseline creation when the test has no baseline yet', async () => {
      branches.resolveForUpload.mockResolvedValue(mainBranch);
      tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
      baselines.resolveForVariant.mockResolvedValue(null);

      const result = await resolver.resolveStored('image', params, 'hash');

      expect(result.decision).toEqual(
        expect.objectContaining({
          status: ComparisonOutcome.BASELINE_CREATED,
          testId: 'test-1',
          contentHash: 'hash',
        }),
      );
    });
  });
});
