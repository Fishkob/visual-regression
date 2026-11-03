import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { ComparisonStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { createMock } from '@test/utils/create-mock';
import type { VariantStatusSignalRow } from '@public/visualTest/core/infrastructure/repositories/variant-store';

// The status-signal query returns one row per variant; only the two signal
// fields matter to the aggregate, so the rest is filled in once here.
function signal(
  overrides: Partial<VariantStatusSignalRow> = {},
): VariantStatusSignalRow {
  return {
    testName: 'test-1',
    testKind: 'image',
    viewport: '1920x1080',
    browser: 'Chrome',
    environment: 'staging',
    hasBaseline: true,
    latestComparisonStatus: null,
    ...overrides,
  };
}

describe('TestStatusService', () => {
  let service: TestStatusService;
  let tests: Mocked<UnifiedTestRepository>;
  let variants: Mocked<VariantStore>;

  beforeEach(async () => {
    tests = createMock<UnifiedTestRepository>();
    variants = createMock<VariantStore>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestStatusService,
        { provide: UnifiedTestRepository, useValue: tests },
        { provide: VariantStore, useValue: variants },
      ],
    }).compile();

    service = module.get(TestStatusService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('recomputeStatus', () => {
    it('derives PENDING_APPROVAL when any variant is pending', async () => {
      variants.findVariantStatusSignalsFor.mockResolvedValue([
        signal({ latestComparisonStatus: ComparisonStatus.PENDING_APPROVAL }),
        signal({ latestComparisonStatus: ComparisonStatus.APPROVED }),
      ]);
      tests.updateStatus.mockResolvedValue(undefined);

      await service.recomputeStatus('test-1');

      expect(variants.findVariantStatusSignalsFor).toHaveBeenCalledWith({
        testId: 'test-1',
      });
      expect(tests.updateStatus).toHaveBeenCalledWith(
        'test-1',
        'PENDING_APPROVAL',
      );
    });

    it('derives UNCHANGED when every variant is clean and has a baseline', async () => {
      variants.findVariantStatusSignalsFor.mockResolvedValue([
        signal({ latestComparisonStatus: ComparisonStatus.APPROVED }),
        signal(),
      ]);
      tests.updateStatus.mockResolvedValue(undefined);

      await service.recomputeStatus('test-1');

      expect(tests.updateStatus).toHaveBeenCalledWith('test-1', 'UNCHANGED');
    });

    it('derives PENDING when a variant lacks a baseline', async () => {
      variants.findVariantStatusSignalsFor.mockResolvedValue([
        signal(),
        signal({ hasBaseline: false }),
      ]);
      tests.updateStatus.mockResolvedValue(undefined);

      await service.recomputeStatus('test-1');

      expect(tests.updateStatus).toHaveBeenCalledWith('test-1', 'PENDING');
    });

    it('derives PENDING for a test with no variants', async () => {
      variants.findVariantStatusSignalsFor.mockResolvedValue([]);
      tests.updateStatus.mockResolvedValue(undefined);

      await service.recomputeStatus('test-1');

      expect(tests.updateStatus).toHaveBeenCalledWith('test-1', 'PENDING');
    });
  });
});
