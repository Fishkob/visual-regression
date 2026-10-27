import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
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
import { PdfTestDetailsDto } from '@public/visualTest/access/presentation/dto/pdf-test-details.dto';
import type { TestVariantsDto } from '@public/visualTest/review/presentation/dto/visual-test.dto';
import { ProjectTestDto } from '@public/visualTest/catalog/presentation/dto/project.dto';
import { PendingTestDto } from '@public/visualTest/review/presentation/dto/review-responses.dto';
import {
  mapComparisonToDto,
  mapScreenshotToDto,
} from '@public/visualTest/review/infrastructure/mappers/comparison-dto.mapper';
import { mapTestWithVariantsToPdfDetails } from '@public/visualTest/access/infrastructure/mappers/pdf-test-details.mapper';
import { mapTestVariantsToDto } from '@public/visualTest/review/infrastructure/mappers/test-variants.mapper';

const isTestKind = (value: string): value is TestKind =>
  TEST_KINDS.includes(value as TestKind);

@Injectable()
export class TestQueryService {
  // Image URLs leave the read API presigned; PDF source URLs stay canonical
  // because the render/download endpoints feed them back into storage.get().
  private readonly signUrl = (url: string): string => this.storage.signUrl(url);

  constructor(
    private readonly testRead: TestReadRepository,
    private readonly testResolver: TestResolver,
    private readonly branches: BranchResolver,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async getTestNames(
    projectName: string,
    pagination: PaginationDto,
    kind?: string,
    branchName?: string,
  ) {
    if (kind !== undefined && kind !== '' && !isTestKind(kind)) {
      throw new DomainError(`Invalid test kind "${kind}"`, 'BAD_REQUEST');
    }
    // The "project exists or 404" rule is single-sourced in the resolver — this
    // endpoint does not re-implement the project lookup, so a missing project
    // stays indistinguishable-by-convention with its sibling list endpoints.
    const branch = await this.branches.resolveRead(projectName, branchName);
    return paginatedQuery(
      (args) =>
        this.testRead.getTestNames(
          branch.branchId,
          args,
          kind === '' ? undefined : kind,
        ),
      pagination,
      (row) =>
        plainToInstance(ProjectTestDto, row, {
          excludeExtraneousValues: true,
        }),
    );
  }

  // Branch-scoped like every other test read: a test that only exists on the
  // branch resolves through the branch view, so the details dispatcher picks the
  // right view for it instead of 404ing on the default branch.
  async getKind(
    projectName: string,
    testName: string,
    branchName?: string,
  ): Promise<{ kind: string }> {
    const test = await this.testResolver.findTest(
      projectName,
      testName,
      branchName,
    );
    return { kind: test.kind };
  }

  async getTestsWithPendingStatus(
    projectName: string,
    pagination: PaginationDto,
    branchName?: string,
    assigneeId?: string,
  ) {
    const branch = await this.branches.resolveRead(projectName, branchName);

    return paginatedQuery(
      (args) =>
        this.testRead.getPendingApproval(branch.branchId, args, assigneeId),
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
    branchName?: string,
  ): Promise<{
    name: string;
    origin?: 'branch' | 'inherited';
    inheritedFrom?: string | null;
    baselineInherited?: boolean;
    inheritTarget?: string | null;
    baseline?: ScreenshotDto;
    comparison?: ComparisonDto;
  }> {
    Variant.resolveRequiredFilter(filters);

    const {
      exists: hasTest,
      kind,
      origin,
      inheritedFrom,
      baselineInherited: isBaselineInherited,
      inheritTarget,
      baseline,
      comparison,
    } = await this.testRead.findVisualTestDetails(
      projectName,
      testName,
      filters,
      branchName,
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
      return {
        name: testName,
        origin,
        inheritedFrom,
        baselineInherited: isBaselineInherited,
        inheritTarget,
      };
    }

    return {
      name: testName,
      origin,
      inheritedFrom,
      baselineInherited: isBaselineInherited,
      inheritTarget,
      baseline: mapScreenshotToDto(baseline, this.signUrl),
      comparison: comparison
        ? mapComparisonToDto(comparison, this.signUrl)
        : undefined,
    };
  }

  // The gallery read: one row per variant of an image test, each with the triage
  // facts a reviewer needs to pick the variant worth opening. No variant filter —
  // the gallery IS the unfiltered view, and the caller drills into one variant
  // through the existing details endpoint.
  async getTestVariants(
    projectName: string,
    testName: string,
    branchName?: string,
  ): Promise<TestVariantsDto> {
    const result = await this.testRead.findTestVariantSummaries(
      projectName,
      testName,
      branchName,
    );
    if (!result) {
      throw new DomainError(
        `Test "${testName}" not found in project "${projectName}"`,
        'NOT_FOUND',
      );
    }
    this.testResolver.assertTestKind(
      { name: testName, kind: result.kind },
      'image',
    );

    return mapTestVariantsToDto(result, this.signUrl);
  }

  async getPdfTestDetails(
    projectName: string,
    testName: string,
    filters?: { viewport?: string; browser?: string; environment?: string },
    branchName?: string,
  ): Promise<PdfTestDetailsDto> {
    Variant.resolveRequiredFilter(filters);

    const result = await this.testRead.findTestWithVariants(
      projectName,
      testName,
      filters,
      branchName,
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
