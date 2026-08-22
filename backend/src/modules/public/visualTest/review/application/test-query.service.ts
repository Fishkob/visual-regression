import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { DomainError } from '@common/domain/domain-error';
import { PaginationDto } from '@common/dto/pagination.dto';
import { paginatedQuery } from '@common/utils/paginated-query';
import {
  Variant,
  type VariantFilter,
} from '@public/visualTest/core/domain/value-objects/variant.vo';
import type { ScreenshotDto } from '@public/visualTest/review/presentation/dto/screenshot.dto';
import type { ComparisonDto } from '@public/visualTest/review/presentation/dto/comparison.dto';
import type { TestKind } from '@common/domain/test-kind';
import { TEST_KINDS } from '@common/domain/test-kind';
import { PdfTestDetailsDto } from '@public/visualTest/review/presentation/dto/pdf-test-details.dto';
import { ProjectTestDto } from '@public/visualTest/review/presentation/dto/project.dto';
import { PendingTestDto } from '@public/visualTest/review/presentation/dto/review-responses.dto';
import {
  mapComparisonToDto,
  mapScreenshotToDto,
} from '@public/visualTest/review/infrastructure/mappers/comparison-dto.mapper';
import { mapTestWithVariantsToPdfDetails } from '@public/visualTest/review/infrastructure/mappers/pdf-test-details.mapper';

const isTestKind = (value: string): value is TestKind =>
  TEST_KINDS.includes(value as TestKind);

@Injectable()
export class TestQueryService {
  constructor(
    private readonly testRead: TestReadRepository,
    private readonly testResolver: TestResolver,
  ) {}

  async getTestNames(
    projectName: string,
    pagination: PaginationDto,
    kind?: string,
  ) {
    if (kind !== undefined && kind !== '' && !isTestKind(kind)) {
      throw new DomainError(`Invalid test kind "${kind}"`, 'BAD_REQUEST');
    }
    // The "project exists or 404" rule is single-sourced in the resolver — this
    // endpoint does not re-implement the project lookup, so a missing project
    // stays indistinguishable-by-convention with its sibling list endpoints.
    const project = await this.testResolver.resolveProject(projectName);
    return paginatedQuery(
      (args) => this.testRead.getTestNames(project.id, args, kind),
      pagination,
      (row) =>
        plainToInstance(ProjectTestDto, row, {
          excludeExtraneousValues: true,
        }),
    );
  }

  async getKind(
    projectName: string,
    testName: string,
  ): Promise<{ kind: string }> {
    const test = await this.testResolver.findTest(projectName, testName);
    return { kind: test.kind };
  }

  async getTestsWithPendingStatus(
    projectName: string,
    pagination: PaginationDto,
  ) {
    const project = await this.testResolver.resolveProject(projectName);

    return paginatedQuery(
      (args) => this.testRead.getPendingApproval(project.id, args),
      pagination,
      (row) =>
        plainToInstance(PendingTestDto, row, {
          excludeExtraneousValues: true,
        }),
    );
  }

  async getVisualTestDetails(
    projectName: string,
    testName: string,
    filters: VariantFilter,
  ): Promise<{
    name: string;
    baseline?: ScreenshotDto;
    comparison?: ComparisonDto;
  }> {
    Variant.resolveRequiredFilter(filters);

    const {
      exists: hasTest,
      kind,
      baseline,
      comparison,
    } = await this.testRead.findVisualTestDetails(
      projectName,
      testName,
      filters,
    );

    if (!hasTest) {
      throw new DomainError(
        `Test "${testName}" not found in project "${projectName}"`,
        'NOT_FOUND',
      );
    }

    this.testResolver.assertTestKind({ name: testName, kind }, 'image');

    if (!baseline) {
      // A missing baseline is a legitimate state for an existing test that
      // has not received its first upload.
      return { name: testName };
    }

    return {
      name: testName,
      baseline: mapScreenshotToDto(baseline),
      comparison: comparison ? mapComparisonToDto(comparison) : undefined,
    };
  }

  async getPdfTestDetails(
    projectName: string,
    testName: string,
    filters?: { viewport?: string; browser?: string; environment?: string },
  ): Promise<PdfTestDetailsDto> {
    Variant.resolveRequiredFilter(filters);

    const result = await this.testRead.findTestWithVariants(
      projectName,
      testName,
      filters,
    );
    if (!result) {
      throw new DomainError(
        `PDF test "${testName}" not found in project "${projectName}"`,
        'NOT_FOUND',
      );
    }
    this.testResolver.assertTestKind(
      { name: testName, kind: result.test.kind },
      'pdf',
    );
    const details: PdfTestDetailsDto = mapTestWithVariantsToPdfDetails(result);
    return details;
  }
}
