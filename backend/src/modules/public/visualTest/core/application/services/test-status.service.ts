import { Injectable } from '@nestjs/common';
import { TestStatus } from '@/prisma/client';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import {
  resolveAggregateStatusFromVariantStatuses,
  resolveVariantStatusFromComparison,
} from '@public/visualTest/core/domain/policies/test-status.policy';

@Injectable()
export class TestStatusService {
  constructor(
    private readonly tests: UnifiedTestRepository,
    private readonly variants: VariantStore,
  ) {}

  // The persisted aggregate is derived from the SAME per-variant rule the read
  // model uses, so the test row and the per-variant read model cannot drift.
  private async deriveStatus(testId: string): Promise<TestStatus> {
    const signals = await this.variants.findVariantStatusSignalsFor({ testId });
    const statuses = signals.map((signal) =>
      resolveVariantStatusFromComparison(
        signal.latestComparisonStatus ?? undefined,
        signal.hasBaseline,
      ),
    );
    return resolveAggregateStatusFromVariantStatuses(statuses);
  }

  async recomputeStatus(testId: string): Promise<void> {
    await this.tests.updateStatus(testId, await this.deriveStatus(testId));
  }
}
