import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UploadDecisionResolver } from '@public/visualTest/intake/application/upload-decision.resolver';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import { ComparisonOutcome } from '@common/domain/upload-outcome';
import { createMock } from '@test/utils/create-mock';

describe('UploadDecisionResolver', () => {
  let resolver: UploadDecisionResolver;
  let tests: Mocked<UnifiedTestRepository>;
  let screenshots: Mocked<UnifiedScreenshotRepository>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadDecisionResolver,
        { provide: UnifiedTestRepository, useValue: tests },
        { provide: UnifiedScreenshotRepository, useValue: screenshots },
      ],
    }).compile();

    resolver = module.get(UploadDecisionResolver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveIdentical', () => {
    it('returns the test id when the upload is identical to the baseline', async () => {
      tests.findByProjectNameAndTestName.mockResolvedValue(makeTest());
      screenshots.findBaselineByVariant.mockResolvedValue(
        makeBaseline({ imageHash: 'same-hash' }),
      );

      const result = await resolver.resolveIdentical(params, 'same-hash');

      expect(result).toEqual({ testId: 'test-1' });
      expect(tests.findByProjectNameAndTestName).toHaveBeenCalledWith(
        'test-project',
        'test-name',
      );
    });

    it('returns null without resolving a baseline when the test does not exist', async () => {
      tests.findByProjectNameAndTestName.mockResolvedValue(null);

      const result = await resolver.resolveIdentical(params, 'hash');

      expect(result).toBeNull();
      expect(screenshots.findBaselineByVariant).not.toHaveBeenCalled();
    });

    it('returns null when the upload is not identical', async () => {
      tests.findByProjectNameAndTestName.mockResolvedValue(makeTest());
      screenshots.findBaselineByVariant.mockResolvedValue(
        makeBaseline({ imageHash: 'other-hash' }),
      );

      const result = await resolver.resolveIdentical(params, 'hash');

      expect(result).toBeNull();
    });
  });

  describe('resolveStored', () => {
    it('ensures the test and queues a comparison when the hashes differ', async () => {
      tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
      screenshots.findBaselineByVariant.mockResolvedValue(makeBaseline());

      const result = await resolver.resolveStored('image', params, 'new-hash');

      expect(result).toEqual(
        expect.objectContaining({
          status: ComparisonOutcome.COMPARISON_QUEUED,
          testId: 'test-1',
          contentHash: 'new-hash',
        }),
      );
      expect(tests.ensureTest).toHaveBeenCalledWith(
        'test-project',
        'test-name',
        'image',
      );
    });

    it('reports an identical upload when the hashes match', async () => {
      tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
      screenshots.findBaselineByVariant.mockResolvedValue(
        makeBaseline({ imageHash: 'same-hash' }),
      );

      const result = await resolver.resolveStored('image', params, 'same-hash');

      expect(result).toEqual(
        expect.objectContaining({
          status: ComparisonOutcome.IDENTICAL,
          testId: 'test-1',
        }),
      );
    });

    it('reports a baseline creation when the test has no baseline yet', async () => {
      tests.ensureTest.mockResolvedValue({ testId: 'test-1' });
      screenshots.findBaselineByVariant.mockResolvedValue(null);

      const result = await resolver.resolveStored('image', params, 'hash');

      expect(result).toEqual(
        expect.objectContaining({
          status: ComparisonOutcome.BASELINE_CREATED,
          testId: 'test-1',
          contentHash: 'hash',
        }),
      );
    });
  });
});
