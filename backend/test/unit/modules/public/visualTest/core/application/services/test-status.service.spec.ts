import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { ComparisonStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { createMock } from '@test/utils/create-mock';

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
      variants.findVariantStatusSignals.mockResolvedValue([
        {
          hasBaseline: true,
          latestComparisonStatus: ComparisonStatus.PENDING_APPROVAL,
        },
        {
          hasBaseline: true,
          latestComparisonStatus: ComparisonStatus.APPROVED,
        },
      ]);
      tests.updateStatus.mockResolvedValue(undefined as any);

      await service.recomputeStatus('test-1');

      expect(variants.findVariantStatusSignals).toHaveBeenCalledWith('test-1');
      expect(tests.updateStatus).toHaveBeenCalledWith(
        'test-1',
        'PENDING_APPROVAL',
      );
    });

    it('derives UNCHANGED when every variant is clean and has a baseline', async () => {
      variants.findVariantStatusSignals.mockResolvedValue([
        {
          hasBaseline: true,
          latestComparisonStatus: ComparisonStatus.APPROVED,
        },
        { hasBaseline: true, latestComparisonStatus: null },
      ]);
      tests.updateStatus.mockResolvedValue(undefined as any);

      await service.recomputeStatus('test-1');

      expect(tests.updateStatus).toHaveBeenCalledWith('test-1', 'UNCHANGED');
    });

    it('derives PENDING when a variant lacks a baseline', async () => {
      variants.findVariantStatusSignals.mockResolvedValue([
        { hasBaseline: true, latestComparisonStatus: null },
        { hasBaseline: false, latestComparisonStatus: null },
      ]);
      tests.updateStatus.mockResolvedValue(undefined as any);

      await service.recomputeStatus('test-1');

      expect(tests.updateStatus).toHaveBeenCalledWith('test-1', 'PENDING');
    });

    it('derives PENDING for a test with no variants', async () => {
      variants.findVariantStatusSignals.mockResolvedValue([]);
      tests.updateStatus.mockResolvedValue(undefined as any);

      await service.recomputeStatus('test-1');

      expect(tests.updateStatus).toHaveBeenCalledWith('test-1', 'PENDING');
    });
  });
});
