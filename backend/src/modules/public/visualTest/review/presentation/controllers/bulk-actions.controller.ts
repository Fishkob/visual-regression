import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { BulkActionService } from '@public/visualTest/review/application/bulk-action.service';
import {
  BulkApprovalDto,
  BulkApprovalResultDto,
  BulkDeleteResultDto,
  BulkDeleteTestsDto,
  BulkMoveProjectsDto,
  BulkMoveResultDto,
} from '@public/visualTest/review/presentation/dto/bulk-action.dto';

@ApiTags('Bulk actions')
@Controller('projects/:projectName/bulk')
export class BulkActionsController {
  constructor(private readonly bulk: BulkActionService) {}

  @Post('approvals')
  @ApiOperation({
    summary: 'Approve up to 100 comparisons, returning per-item results',
  })
  @ApiOkResponse({ type: BulkApprovalResultDto })
  async approve(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: BulkApprovalDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkApprovalResultDto> {
    const result = await this.bulk.approve(
      projectName,
      dto.comparisonIds,
      req.auth?.username ?? 'unknown',
    );
    return plainToInstance(BulkApprovalResultDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('test-deletions')
  @ApiOperation({
    summary: 'Delete up to 100 tests, returning per-item results',
  })
  @ApiOkResponse({ type: BulkDeleteResultDto })
  async deleteTests(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: BulkDeleteTestsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkDeleteResultDto> {
    const result = await this.bulk.deleteTests(
      projectName,
      dto.testNames,
      dto.branch,
      req.auth?.username ?? 'unknown',
    );
    return plainToInstance(BulkDeleteResultDto, result, {
      excludeExtraneousValues: true,
    });
  }
}

@ApiTags('Bulk actions')
@Controller('projects')
export class ProjectsBulkController {
  constructor(private readonly bulk: BulkActionService) {}

  @Patch('bulk/group')
  @ApiOperation({
    summary: 'Move up to 100 projects into a group (null clears the group)',
  })
  @ApiOkResponse({ type: BulkMoveResultDto })
  async move(@Body() dto: BulkMoveProjectsDto): Promise<BulkMoveResultDto> {
    const result = await this.bulk.moveProjects(
      dto.projectNames,
      dto.groupId ?? null,
    );
    return plainToInstance(BulkMoveResultDto, result, {
      excludeExtraneousValues: true,
    });
  }
}
