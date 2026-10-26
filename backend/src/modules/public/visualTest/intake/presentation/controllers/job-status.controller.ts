import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { Scope } from '@common/http/api-key-scope.decorator';
import { JobStatusService } from '@public/visualTest/intake/application/job-status.service';
import { DEFAULT_JOB_STATUS_POLLING } from '@public/visualTest/intake/application/job-status-polling';
import {
  ComparisonJobStatusDto,
  JobStatusQueryDto,
} from '@public/visualTest/intake/presentation/dto/job-status.dto';

@ApiTags('Upload')
@Controller('projects/:projectName/tests')
export class JobStatusController {
  constructor(private readonly jobStatus: JobStatusService) {}

  @Scope('read', 'upload')
  @Get(':testName/jobs/:jobId')
  @ApiOperation({
    summary: 'Read the status of a queued comparison job (optionally wait)',
  })
  @ApiQuery({
    name: 'wait',
    required: false,
    type: Number,
    description: `Seconds to long-poll for a terminal status (0-${String(DEFAULT_JOB_STATUS_POLLING.maxWaitSeconds)}, default 0; capped server-side)`,
    example: 10,
  })
  @ApiOkResponse({
    description:
      'Current job status, plus the produced comparison once available',
    type: ComparisonJobStatusDto,
  })
  @ApiNotFoundResponse({
    description: 'Project, test, or job (for this test) not found',
  })
  async getJobStatus(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Param('jobId') jobId: string,
    @Query() query: JobStatusQueryDto,
    @BranchQuery() branch?: string,
  ): Promise<ComparisonJobStatusDto> {
    return this.jobStatus.getJobStatus({
      projectName,
      testName,
      jobId,
      branch,
      waitSeconds: query.wait ?? 0,
    });
  }
}
