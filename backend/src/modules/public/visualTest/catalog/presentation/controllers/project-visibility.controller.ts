import { Body, Controller, Param, Patch, Req } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireActor } from '@common/http/authenticated-principal';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { Roles } from '@common/http/roles.decorator';
import { SessionOnly } from '@common/http/session-only.decorator';
import { ProjectScoped } from '@common/http/project-route.decorator';
import { ProjectService } from '@public/visualTest/catalog/application/project.service';
import {
  ProjectVisibilityDto,
  UpdateProjectVisibilityDto,
} from '@public/visualTest/catalog/presentation/dto/project.dto';

// The exact sibling of `PATCH /projects/:projectName/team` (ADR-083): widening
// who may read a project is a privilege change, so it gets its own route instead
// of a field on the generic project patch — that one is gated by an API-key
// scope, not by `@Roles`, and a member who can rename a project must not be able
// to publish it. Session-only for the same reason: a CI key must not reshape who
// can see what.
@ApiTags('Projects')
@ProjectScoped()
@Controller('projects')
@Roles('ADMIN')
@SessionOnly()
export class ProjectVisibilityController {
  constructor(private readonly projects: ProjectService) {}

  @Patch(':projectName/visibility')
  @ApiOperation({
    summary: 'Make a project readable by everyone, or by its team only',
  })
  @ApiOkResponse({ type: ProjectVisibilityDto })
  @ApiNotFoundResponse({ description: 'Project not found' })
  async update(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: UpdateProjectVisibilityDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectVisibilityDto> {
    const view = await this.projects.updateVisibility(
      projectName,
      dto.isShared,
      requireActor(req),
    );
    return plainToInstance(ProjectVisibilityDto, view, {
      excludeExtraneousValues: true,
    });
  }
}
