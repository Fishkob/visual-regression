import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TestQueryService } from '@public/visualTest/review/application/test-query.service';
import {
  ProjectTestDto,
  TestNamesQueryDto,
} from '@public/visualTest/review/presentation/dto/project.dto';
import {
  TestVariantsDto,
  VisualTestDetailsDto,
} from '@public/visualTest/review/presentation/dto/visual-test.dto';
import { BranchPaginationDto } from '@common/dto/branch-pagination.dto';
import { VariantFilterDto } from '@public/visualTest/review/presentation/dto/variant.dto';
import { PendingTestDto } from '@public/visualTest/review/presentation/dto/review-responses.dto';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { Scope } from '@common/http/api-key-scope.decorator';
import { PaginatedResponseDto } from '@common/dto/paginated-response.dto';

@ApiTags('Tests')
@Controller('projects/:projectName/tests')
export class TestsQueriesController {
  constructor(private readonly testQuery: TestQueryService) {}

  @Scope('read')
  @Get()
  @ApiOperation({ summary: 'List all tests for a specific project' })
  @ApiOkResponse({ type: PaginatedResponseDto(ProjectTestDto) })
  @ApiQuery({
    name: 'kind',
    required: false,
    description: 'Filter by test kind (image or pdf)',
  })
  async getTestsForProject(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Query() query: TestNamesQueryDto,
    @BranchQuery() branch?: string,
  ) {
    return this.testQuery.getTestNames(projectName, query, query.kind, branch);
  }

  @Scope('read')
  @Get(':testName/kind')
  @ApiOperation({ summary: 'Get the test kind (pdf or visual)' })
  @ApiOkResponse({ description: 'Test kind (pdf or visual)' })
  async getKind(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @BranchQuery() branch?: string,
  ) {
    return this.testQuery.getKind(projectName, testName, branch);
  }

  @Scope('read')
  @Get(':testName/variants')
  @ApiOperation({
    summary: 'List the variants of an image test with status and thumbnails',
  })
  @ApiOkResponse({ type: TestVariantsDto })
  @ApiNotFoundResponse({ description: 'Test not found' })
  async getVariants(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @BranchQuery() branch?: string,
  ) {
    return this.testQuery.getTestVariants(projectName, testName, branch);
  }

  @Scope('read')
  @Get('meta/pending')
  @ApiOperation({ summary: 'List tests with pending approvals in project' })
  @ApiOkResponse({ type: PaginatedResponseDto(PendingTestDto) })
  async getTestsWithPendingStatus(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Query() pagination: BranchPaginationDto,
    @BranchQuery() branch?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    return this.testQuery.getTestsWithPendingStatus(
      projectName,
      pagination,
      branch,
      pagination.assignedToMe ? req?.auth?.userId : undefined,
    );
  }

  @Scope('read')
  @Get(':testName')
  @ApiOperation({
    summary:
      'Get details for a specific visual test (single variant or all variants)',
  })
  @ApiOkResponse({
    description:
      'Visual test details including variants, baselines and comparisons',
    type: VisualTestDetailsDto,
  })
  @ApiNotFoundResponse({ description: 'Visual test not found' })
  @ApiQuery({
    name: 'viewport',
    required: false,
    description:
      'Variant filter — at least one of viewport/browser/environment is required',
  })
  @ApiQuery({ name: 'browser', required: false })
  @ApiQuery({ name: 'environment', required: false })
  async getVisualTestDetails(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Query() filters: VariantFilterDto,
    @BranchQuery() branch?: string,
  ) {
    return this.testQuery.getVisualTestDetails(
      projectName,
      testName,
      filters,
      branch,
    );
  }
}
