import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { ComparisonStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { ProjectService } from '@public/visualTest/review/application/project.service';
import {
  ProjectDto,
  CreateProjectDto,
  UpdateProjectDto,
} from '@public/visualTest/review/presentation/dto/project.dto';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { BranchQuery } from '@common/http/branch-query.decorator';
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
  async getProjectsWithPendingFlag(@Query() pagination: PaginationDto) {
    return this.projectService.getAllWithPendingFlag(pagination);
  }

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
  ) {
    await this.projectService.deleteProject(projectName);
    return { success: true };
  }

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

  @Patch(':projectName')
  @ApiOperation({ summary: 'Move a project to another group' })
  @ApiOkResponse({ type: ProjectDto })
  async updateProject(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    return this.projectService.updateProjectGroup(projectName, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all projects' })
  @ApiOkResponse({
    description: 'Returns all projects',
  })
  async getAllProjects(@Query() pagination: PaginationDto) {
    return this.projectService.findAll(pagination);
  }

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
    @BranchQuery() branch?: string,
  ): Promise<ProjectDto> {
    return this.projectService.getWithLatestVariantStatuses(
      projectName,
      branch,
    );
  }
}
