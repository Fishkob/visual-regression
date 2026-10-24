import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import {
  ApproveComparisonBodyDto,
  ApproveResultDto,
} from '@public/visualTest/review/presentation/dto/review-responses.dto';

@ApiTags('Approvals')
@Controller('projects/:projectName/tests/:testName')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalService) {}

  @Post('approval')
  @ApiOperation({
    summary: 'Approve a pending visual comparison',
  })
  @ApiOkResponse({ type: ApproveResultDto })
  @ApiNotFoundResponse({ description: 'Comparison not found' })
  approveVisualTest(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() params: ApproveComparisonBodyDto,
    @BranchQuery() branch?: string,
  ) {
    return this.approvals.approveImage(
      projectName,
      testName,
      params.comparisonId,
      branch,
    );
  }

  @Post('pdf-approval')
  @ApiOperation({ summary: 'Approve a pending PDF comparison' })
  @ApiOkResponse({ type: ApproveResultDto })
  @ApiNotFoundResponse({ description: 'Comparison not found' })
  async approvePdfTest(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() params: ApproveComparisonBodyDto,
    @BranchQuery() branch?: string,
  ): Promise<ApproveResultDto> {
    return this.approvals.approvePdf(
      projectName,
      testName,
      params.comparisonId,
      branch,
    );
  }
}
