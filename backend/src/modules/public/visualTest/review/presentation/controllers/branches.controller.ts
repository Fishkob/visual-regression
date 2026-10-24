import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { BranchReadRepository } from '@public/visualTest/review/infrastructure/repositories/branch-read.repository';
import { BranchCommandService } from '@public/visualTest/review/application/branch-command.service';
import {
  BranchCommandResultDto,
  BranchSummaryDto,
  UpdateBranchDto,
} from '@public/visualTest/review/presentation/dto/branch.dto';

@ApiTags('Branches')
@Controller('projects/:projectName/branches')
export class BranchesController {
  constructor(
    private readonly read: BranchReadRepository,
    private readonly commands: BranchCommandService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the branches of a project' })
  @ApiOkResponse({ type: BranchSummaryDto, isArray: true })
  // A typed boolean in the contract: the generated SDK then exposes
  // `includeArchived?: boolean` and a value other than true/false is a 400
  // instead of silently meaning "hide archived".
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  async list(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<BranchSummaryDto[]> {
    return this.read.list(projectName, parseIncludeArchived(includeArchived));
  }

  @Patch()
  @ApiOperation({ summary: 'Archive/unarchive a branch or change its target' })
  @ApiOkResponse({ type: BranchCommandResultDto })
  @ApiNotFoundResponse({ description: 'Branch or target not found' })
  @ApiConflictResponse({ description: 'Invalid target or default branch' })
  async update(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @BranchQuery({ required: true }) branch: string,
    @Body() body: UpdateBranchDto,
  ): Promise<{ success: boolean }> {
    return this.commands.apply(projectName, branch, body);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a feature branch and reclaim its files' })
  @ApiOkResponse({ type: BranchCommandResultDto })
  @ApiConflictResponse({ description: 'The default branch cannot be deleted' })
  async remove(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @BranchQuery({ required: true }) branch: string,
  ): Promise<{ success: boolean }> {
    await this.commands.delete(projectName, branch);
    return { success: true };
  }
}

// Kept out of the pipe chain on purpose: the global ValidationPipe coerces a
// `boolean`-typed query param (metatype Boolean) before any route pipe runs, so
// `?includeArchived=1` would arrive as `false` instead of being rejected. Read
// the raw string and own the rule.
function parseIncludeArchived(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new BadRequestException('"includeArchived" must be "true" or "false"');
}
