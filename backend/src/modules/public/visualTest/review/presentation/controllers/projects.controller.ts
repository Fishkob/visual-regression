import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { Roles } from '@common/http/roles.decorator';
import { ComparisonStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { ProjectService } from '@public/visualTest/review/application/project.service';
import {
  ProjectDto,
  CreateProjectDto,
  UpdateProjectDto,
  UpdateProjectReviewPolicyDto,
  ProjectReviewPolicyDto,
  ProjectsListQueryDto,
  ProjectDetailQueryDto,
} from '@public/visualTest/review/presentation/dto/project.dto';
import type { TestKind } from '@common/domain/test-kind';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { Scope } from '@common/http/api-key-scope.decorator';
import { PaginationDto } from '@common/dto/pagination.dto';
export class ComparisonStatusWrapper {
  @ApiProperty({
    enum: ComparisonStatus,
    enumName: 'ComparisonStatus',
  })
  status!: ComparisonStatus;
}

@ApiTags('Projects')
@ApiExtraModels(ComparisonStatusWrapper)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectService: ProjectService) {}

  // NOTE: @Get(':projectName/tests') is handled by TestsQueriesController.getTestsForProject
  //       to avoid route conflict. This controller owns higher-level project routes.

  @Scope('read')
  @Get('/pending')
  @ApiOperation({ summary: 'Get all projects with pending flag' })
  @ApiOkResponse({
    description: 'Returns all projects with their pending flag (true/false)',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/ProjectDto' },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
            hasNextPage: { type: 'boolean' },
            hasPreviousPage: { type: 'boolean' },
          },
        },
      },
    },
  })
  async getProjectsWithPendingFlag(@Query() query: ProjectsListQueryDto) {
    return this.projectService.getAllWithPendingFlag(query, {
      q: query.q,
      groupId: query.groupId,
    });
  }

  @Roles('ADMIN')
  @Scope('admin')
  @Delete(':projectName')
  @ApiOperation({ summary: 'Delete a project and its related data' })
  @ApiParam({
    name: 'projectName',
    type: String,
    description: 'The name of the project to delete',
    example: 'checkout-ui',
  })
  @ApiOkResponse({
    description: 'Project deleted successfully',
    schema: { example: { success: true } },
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  async deleteProject(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.projectService.deleteProject(projectName, req.auth?.username);
    return { success: true };
  }

  @Scope('admin')
  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiBody({ type: CreateProjectDto })
  @ApiCreatedResponse({
    type: ProjectDto,
    description: 'Project created successfully',
    schema: {
      example: {
        id: 'project-123',
        name: 'checkout-ui',
        createdAt: '2023-10-07T12:34:56.000Z',
      },
    },
  })
  @ApiConflictResponse({ description: 'Project name already in use' })
  async create(@Body() dto: CreateProjectDto): Promise<ProjectDto> {
    return this.projectService.create(dto.name, dto.groupId);
  }

  @Scope('admin')
  @Patch(':projectName')
  @ApiOperation({ summary: 'Move a project to another group' })
  @ApiOkResponse({ type: ProjectDto })
  async updateProject(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: UpdateProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectDto> {
    if (dto.name !== undefined) {
      await this.projectService.rename(
        projectName,
        dto.name,
        req.auth?.username,
      );
    }
    return this.projectService.updateProjectGroup(dto.name ?? projectName, dto);
  }

  @Roles('ADMIN')
  @Scope('admin')
  @Patch(':projectName/review-policy')
  @ApiOperation({
    summary: 'Update how many approvals a comparison needs in a project',
  })
  @ApiParam({
    name: 'projectName',
    type: String,
    description: 'The project whose review policy to update',
    example: 'checkout-ui',
  })
  @ApiBody({ type: UpdateProjectReviewPolicyDto })
  @ApiOkResponse({
    type: ProjectReviewPolicyDto,
    description: 'The project now requires the returned number of approvals',
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  async updateReviewPolicy(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: UpdateProjectReviewPolicyDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectReviewPolicyDto> {
    return this.projectService.updateReviewPolicy(
      projectName,
      dto.requiredApprovals,
      req.auth?.username,
    );
  }

  @Scope('read')
  @Get()
  @ApiOperation({ summary: 'Get all projects' })
  @ApiOkResponse({
    description: 'Returns all projects',
  })
  async getAllProjects(@Query() pagination: PaginationDto) {
    return this.projectService.findAll(pagination);
  }

  @Scope('read')
  @Get(':projectName')
  @ApiOperation({
    summary: 'Get a specific project with its latest test statuses',
  })
  @ApiParam({
    name: 'projectName',
    description: 'Name of the project',
    example: 'checkout-ui',
  })
  @ApiOkResponse({
    type: ProjectDto,
    description: 'Returns a project including its latest test statuses',
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  async getOneProject(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Query() query: ProjectDetailQueryDto,
    @BranchQuery() branch?: string,
  ): Promise<ProjectDto> {
    return this.projectService.getWithLatestVariantStatuses(
      projectName,
      branch,
      query,
      {
        q: query.q?.trim(),
        kind: query.kind as TestKind | undefined,
        status: query.status as 'pending' | 'ok' | undefined,
        viewport: query.viewport,
        browser: query.browser,
        environment: query.environment,
      },
    );
  }
}
