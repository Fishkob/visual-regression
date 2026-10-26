import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireAuthenticatedPrincipal } from '@common/http/authenticated-principal';
import { AppConfigService } from '@config/app-config.service';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { Scope } from '@common/http/api-key-scope.decorator';
import {
  createPaginatedResponse,
  PaginatedResponseDto,
} from '@common/dto/paginated-response.dto';
import { RunService } from '@public/visualTest/review/application/run.service';
import {
  RunApproveAllResultDto,
  RunDetailDto,
  RunDto,
  RunListQueryDto,
  RunStatusResultDto,
} from '@public/visualTest/review/presentation/dto/run.dto';
import type { RunWithBranch } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import {
  buildRunCsv,
  buildRunHtml,
  buildRunJUnit,
} from '@public/visualTest/review/application/run-report.builder';

function toRunDto(run: RunWithBranch): RunDto {
  return {
    id: run.id,
    key: run.key,
    branchName: run.branch.name,
    commitSha: run.commitSha,
    commitMessage: run.commitMessage,
    ciUrl: run.ciUrl,
    createdAt: run.createdAt,
    lastActivityAt: run.lastActivityAt,
    finishedAt: run.finishedAt,
    finishedBy: run.finishedBy,
  };
}

@ApiTags('Runs')
@Controller('projects/:projectName/runs')
export class RunsController {
  constructor(
    private readonly runs: RunService,
    private readonly config: AppConfigService,
  ) {}

  @Scope('read')
  @Get()
  @ApiOperation({ summary: 'List CI runs of a project (newest first)' })
  @ApiQuery({ name: 'branch', required: false })
  @ApiOkResponse({ type: PaginatedResponseDto(RunDto) })
  async list(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Query() query: RunListQueryDto,
    @BranchQuery() branch?: string,
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const result = await this.runs.list(
      projectName,
      branch ?? query.branch,
      (page - 1) * limit,
      limit,
    );
    return {
      data: result.data.map(toRunDto),
      meta: createPaginatedResponse([], page, limit, result.total).meta,
    };
  }

  @Scope('read')
  @Get(':runKey/report/junit')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="vrt-run.xml"')
  @ApiOperation({
    summary: 'JUnit XML for a run (pending review is a failure)',
  })
  @ApiOkResponse({ type: String, description: 'JUnit XML document' })
  async junitReport(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('runKey') runKey: string,
    @BranchQuery() branch?: string,
  ): Promise<string> {
    const detail = await this.runs.detail(projectName, runKey, branch);
    return buildRunJUnit(detail, projectName, runKey, this.config.appPublicUrl);
  }

  @Scope('read')
  @Get(':runKey/report/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="vrt-run.html"')
  @ApiOperation({ summary: 'Self-contained HTML report for a run' })
  @ApiOkResponse({ type: String, description: 'HTML report' })
  async htmlReport(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('runKey') runKey: string,
    @BranchQuery() branch?: string,
  ): Promise<string> {
    const detail = await this.runs.detail(projectName, runKey, branch);
    return buildRunHtml(detail, projectName, this.config.appPublicUrl);
  }

  @Scope('read')
  @Get(':runKey/report/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="vrt-run.csv"')
  @ApiOperation({ summary: 'CSV of the tests and outcomes of a run' })
  @ApiOkResponse({ type: String, description: 'CSV report' })
  async csvReport(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('runKey') runKey: string,
    @BranchQuery() branch?: string,
  ): Promise<string> {
    const detail = await this.runs.detail(projectName, runKey, branch);
    return buildRunCsv(detail, projectName);
  }

  @Scope('read')
  @Get(':runKey')
  @ApiOperation({ summary: 'Read a run with its pending and approved work' })
  @ApiOkResponse({ type: RunDetailDto })
  async detail(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('runKey') runKey: string,
    @BranchQuery() branch?: string,
  ): Promise<RunDetailDto> {
    const detail = await this.runs.detail(projectName, runKey, branch);
    return plainToInstance(
      RunDetailDto,
      {
        ...detail,
        run: toRunDto(detail.run),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Scope('read')
  @Get(':runKey/status')
  @ApiOperation({
    summary: 'Read the CI gate status of a run (pending/failed/passed/open)',
  })
  @ApiOkResponse({ type: RunStatusResultDto })
  async status(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('runKey') runKey: string,
    @BranchQuery() branch?: string,
  ): Promise<RunStatusResultDto> {
    const result = await this.runs.status(projectName, runKey, branch);
    return plainToInstance(
      RunStatusResultDto,
      {
        run: toRunDto(result.run),
        status: result.status,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Scope('admin')
  @Post(':runKey/finish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Finish a run (idempotent)' })
  @ApiOkResponse({ type: RunStatusResultDto })
  async finish(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('runKey') runKey: string,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ): Promise<RunStatusResultDto> {
    const result = await this.runs.finish(
      projectName,
      runKey,
      req.auth?.username,
      branch,
    );
    return plainToInstance(
      RunStatusResultDto,
      { run: toRunDto(result.run), status: result.status },
      { excludeExtraneousValues: true },
    );
  }

  @Scope('admin')
  @Post(':runKey/approve-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve every pending comparison of a run' })
  @ApiOkResponse({ type: RunApproveAllResultDto })
  async approveAll(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('runKey') runKey: string,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ): Promise<RunApproveAllResultDto> {
    const { username, ...principal } = requireAuthenticatedPrincipal(req);
    const result = await this.runs.approveAll(
      projectName,
      runKey,
      username,
      principal,
      branch,
    );
    return plainToInstance(RunApproveAllResultDto, result, {
      excludeExtraneousValues: true,
    });
  }
}
