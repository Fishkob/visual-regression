import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireActor } from '@common/http/authenticated-principal';
import { requireAuthenticatedPrincipal } from '@common/http/authenticated-principal';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { Scope } from '@common/http/api-key-scope.decorator';
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

  @Scope('approve')
  @Post('approvals')
  @ApiOperation({
    summary: 'Approve up to 100 comparisons, returning per-item results',
  })
  @ApiCreatedResponse({ type: BulkApprovalResultDto })
  async approve(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: BulkApprovalDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkApprovalResultDto> {
    const { username, ...principal } = requireAuthenticatedPrincipal(req);
    const result = await this.bulk.approve(
      projectName,
      dto.comparisonIds,
      username,
      principal,
    );
    return plainToInstance(BulkApprovalResultDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Post('test-deletions')
  @ApiOperation({
    summary: 'Delete up to 100 tests, returning per-item results',
  })
  @ApiCreatedResponse({ type: BulkDeleteResultDto })
  async deleteTests(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: BulkDeleteTestsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkDeleteResultDto> {
    const result = await this.bulk.deleteTests(
      projectName,
      dto.testNames,
      dto.branch,
      requireActor(req),
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

  @Scope('admin')
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
