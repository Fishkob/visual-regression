import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireActor } from '@common/http/authenticated-principal';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import { Scope } from '@common/http/api-key-scope.decorator';
import { BaselineHistoryService } from '@public/visualTest/core/application/services/baseline-history.service';
import { VariantFilterDto } from '@public/visualTest/review/presentation/dto/variant.dto';
import {
  BaselineRevisionDto,
  RestoreBaselineDto,
  RestoreBaselineResultDto,
} from '@public/visualTest/review/presentation/dto/baseline-history.dto';

// Baseline history is a read + one command. Restore is a state change (it
// rewrites the baseline, retires pending work and recomputes the test status),
// so it lives beside the other test commands rather than in the read
// controller.
@ApiTags('Tests')
@Controller('projects/:projectName/tests')
export class BaselineHistoryController {
  constructor(private readonly history: BaselineHistoryService) {}

  @Scope('read')
  @Get(':testName/baseline-history')
  @ApiOperation({
    summary: 'List replaced baselines for a test (newest first)',
  })
  @ApiQuery({ name: 'viewport', required: false })
  @ApiQuery({ name: 'browser', required: false })
  @ApiQuery({ name: 'environment', required: false })
  @ApiOkResponse({ type: [BaselineRevisionDto] })
  async list(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Query() filters: VariantFilterDto,
    @BranchQuery() branch?: string,
  ) {
    const rows = await this.history.list(
      projectName,
      testName,
      filters,
      branch,
    );
    return plainToInstance(BaselineRevisionDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('approve')
  @Post(':testName/baseline-restore')
  @ApiOperation({ summary: 'Restore a previously replaced baseline' })
  @ApiBody({ type: RestoreBaselineDto })
  @ApiOkResponse({ type: RestoreBaselineResultDto })
  async restore(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() body: RestoreBaselineDto,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ) {
    const result = await this.history.restore({
      projectName,
      testName,
      revisionId: body.revisionId,
      branchName: branch,
      restoredBy: requireActor(req),
    });
    return plainToInstance(RestoreBaselineResultDto, result, {
      excludeExtraneousValues: true,
    });
  }
}
