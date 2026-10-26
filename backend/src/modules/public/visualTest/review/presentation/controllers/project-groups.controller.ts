import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Scope } from '@common/http/api-key-scope.decorator';
import { ProjectGroupService } from '@public/visualTest/review/application/project-group.service';
import {
  CreateProjectGroupDto,
  ProjectGroupDto,
  UpdateProjectGroupDto,
} from '@public/visualTest/review/presentation/dto/project-group.dto';

@ApiTags('Groups')
@Controller('groups')
export class ProjectGroupsController {
  constructor(private readonly groups: ProjectGroupService) {}

  @Scope('read')
  @Get()
  @ApiOperation({ summary: 'List project groups' })
  @ApiOkResponse({ type: [ProjectGroupDto] })
  async findAll(): Promise<ProjectGroupDto[]> {
    const rows = await this.groups.findAll();
    return rows.map((row) =>
      plainToInstance(ProjectGroupDto, row, { excludeExtraneousValues: true }),
    );
  }

  @Scope('admin')
  @Post()
  @ApiOperation({ summary: 'Create a project group' })
  @ApiCreatedResponse({ type: ProjectGroupDto })
  async create(@Body() dto: CreateProjectGroupDto): Promise<ProjectGroupDto> {
    const row = await this.groups.create(dto.name);
    return plainToInstance(ProjectGroupDto, row, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Patch(':id')
  @ApiOperation({ summary: 'Rename a project group' })
  @ApiOkResponse({ type: ProjectGroupDto })
  async rename(
    @Param('id') id: string,
    @Body() dto: UpdateProjectGroupDto,
  ): Promise<ProjectGroupDto> {
    const row = await this.groups.rename(id, dto.name);
    return plainToInstance(ProjectGroupDto, row, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project group' })
  @ApiOkResponse({ description: 'Projects move to Unassigned' })
  async remove(@Param('id') id: string): Promise<{ success: true }> {
    return this.groups.delete(id);
  }
}
