import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireActor } from '@common/http/authenticated-principal';
import { Scope } from '@common/http/api-key-scope.decorator';
import {
  ApproveComparisonBodyDto,
  ApproveResultDto,
  BulkApproveResultDto,
} from '@public/visualTest/review/presentation/dto/review-responses.dto';
import { ApprovalDto } from '@public/visualTest/review/presentation/dto/approval.dto';
import { mapApprovalToDto } from '@public/visualTest/review/infrastructure/mappers/approval.mapper';

@ApiTags('Approvals')
@Controller('projects/:projectName/tests/:testName')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalService) {}

  @Scope('approve')
  @Post('approval')
  @ApiOperation({
    summary: 'Approve a pending visual comparison',
  })
  @ApiCreatedResponse({ type: ApproveResultDto })
  @ApiNotFoundResponse({ description: 'Comparison not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async approveVisualTest(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() params: ApproveComparisonBodyDto,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ): Promise<ApproveResultDto> {
    const username = requireActor(req);
    return this.approvals.approveImage(
      projectName,
      testName,
      params.comparisonId,
      username,
      branch,
      { reason: params.reason, note: params.note },
    );
  }

  @Scope('approve')
  @Post('pdf-approval')
  @ApiOperation({ summary: 'Approve a pending PDF comparison' })
  @ApiCreatedResponse({ type: ApproveResultDto })
  @ApiNotFoundResponse({ description: 'Comparison not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async approvePdfTest(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() params: ApproveComparisonBodyDto,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ): Promise<ApproveResultDto> {
    const username = requireActor(req);
    return this.approvals.approvePdf(
      projectName,
      testName,
      params.comparisonId,
      username,
      branch,
      { reason: params.reason, note: params.note },
    );
  }

  @Scope('approve')
  @Post('approvals/all')
  @ApiOperation({
    summary:
      'Approve pending comparisons of a test on a branch (oldest 100 per call)',
  })
  @ApiCreatedResponse({ type: BulkApproveResultDto })
  @ApiNotFoundResponse({ description: 'Test not found' })
  @ApiConflictResponse({
    description: 'Test is inherited from an ancestor branch',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async approveAllPending(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ): Promise<BulkApproveResultDto> {
    return this.approvals.approveAllPending(
      projectName,
      testName,
      requireActor(req),
      branch,
    );
  }

  @Scope('read')
  @Get('approvals')
  @ApiOperation({
    summary: 'List the most recent approvals of a test, newest first',
  })
  @ApiOkResponse({ type: [ApprovalDto] })
  async listApprovals(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @BranchQuery() branch?: string,
  ): Promise<ApprovalDto[]> {
    const approvals = await this.approvals.listApprovals(
      projectName,
      testName,
      branch,
    );
    return approvals.map(mapApprovalToDto);
  }
}
