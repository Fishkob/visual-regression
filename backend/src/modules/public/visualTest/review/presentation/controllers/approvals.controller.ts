import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiConflictResponse,
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
import { requireAuthenticatedPrincipal } from '@common/http/authenticated-principal';
import {
  ApprovalPendingDto,
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

  @Post('approval')
  @ApiOperation({
    summary: 'Approve a pending visual comparison',
  })
  @ApiOkResponse({ type: ApproveResultDto })
  // A 4-eyes project may return the pending-vote shape instead.
  @ApiNotFoundResponse({ description: 'Comparison not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async approveVisualTest(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() params: ApproveComparisonBodyDto,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ): Promise<ApproveResultDto | ApprovalPendingDto> {
    const { username, ...principal } = requireAuthenticatedPrincipal(req);
    return this.approvals.approveImage(
      projectName,
      testName,
      params.comparisonId,
      username,
      branch,
      { reason: params.reason, note: params.note, ...principal },
    );
  }

  @Post('pdf-approval')
  @ApiOperation({ summary: 'Approve a pending PDF comparison' })
  @ApiOkResponse({ type: ApproveResultDto })
  // A 4-eyes project may return the pending-vote shape instead.
  @ApiNotFoundResponse({ description: 'Comparison not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async approvePdfTest(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() params: ApproveComparisonBodyDto,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ): Promise<ApproveResultDto | ApprovalPendingDto> {
    const { username, ...principal } = requireAuthenticatedPrincipal(req);
    return this.approvals.approvePdf(
      projectName,
      testName,
      params.comparisonId,
      username,
      branch,
      { reason: params.reason, note: params.note, ...principal },
    );
  }

  @Post('approvals/all')
  @ApiOperation({
    summary: 'Approve every pending comparison of a test on a branch',
  })
  @ApiOkResponse({ type: BulkApproveResultDto })
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
    const { username, ...principal } = requireAuthenticatedPrincipal(req);
    return this.approvals.approveAllPending(
      projectName,
      testName,
      username,
      principal,
      branch,
    );
  }

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
