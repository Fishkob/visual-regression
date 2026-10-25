import { Injectable } from '@nestjs/common';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { ThresholdUpdateService } from '@public/visualTest/core/application/services/threshold-update.service';
import { DomainError } from '@common/domain/domain-error';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
import type { VariantFilter } from '@public/visualTest/core/domain/value-objects/variant.vo';

@Injectable()
export class TestCommandService {
  constructor(
    private readonly testResolver: TestResolver,
    private readonly testDeletion: TestDeletionService,
    private readonly thresholdUpdate: ThresholdUpdateService,
    private readonly logger: AppLoggerService,
  ) {}

  async deleteTest(
    projectName: string,
    testName: string,
    branchName?: string,
    filters?: VariantFilter,
    actor?: string,
  ) {
    const test = await this.testResolver.findOwnTest(
      projectName,
      testName,
      branchName,
    );

    Variant.assertValidFilter(filters);

    const filter = filters ?? {};

    if (Variant.hasFilters(filter)) {
      const v = filter.viewport ?? '*';
      const b = filter.browser ?? '*';
      const e = filter.environment ?? '*';
      this.logger.warn(
        `Deleting variant for ${projectName}/${testName} (${v} / ${b} / ${e})`,
      );

      const deletedIds = await this.testDeletion.deleteScreenshotsByFilters(
        test.id,
        filters,
        { actor, projectName, testName, branchName },
      );

      if (deletedIds.length === 0) {
        throw new DomainError(
          `No screenshots found for variant (${v} / ${b} / ${e})`,
          'NOT_FOUND',
        );
      }

      this.logger.log(
        `Deleted variant (${v}/${b}/${e}) for ${projectName}/${testName}`,
      );

      return { success: true, scope: 'variant' as const };
    }

    await this.testDeletion.deleteTest(test.id, {
      actor,
      projectName,
      testName,
      branchName,
    });
    this.logger.log(`Deleted test ${testName} in project ${projectName}`);
    return { success: true, scope: 'test' as const };
  }

  async updateThreshold(
    testName: string,
    projectName: string,
    threshold: number,
    filters?: VariantFilter,
    preview = false,
    branchName?: string,
    actor?: string,
  ): Promise<{
    status: 'updated';
    test: string;
    threshold: number;
    autoAcceptedCount: number;
  }> {
    const test = await this.testResolver.findTestOfKind(
      projectName,
      testName,
      'image',
      branchName,
    );

    Variant.assertValidFilter(filters);

    const { autoAcceptedCount } = await this.thresholdUpdate.update(
      test.id,
      testName,
      threshold,
      filters,
      preview,
      { actor, projectName, branchName },
    );

    return { status: 'updated', test: testName, threshold, autoAcceptedCount };
  }
}
