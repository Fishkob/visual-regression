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
import {
  AssignProjectTeamDto,
  ProjectTeamDto,
} from '@internal/teams/dto/team.dto';
import { TeamsService } from '@internal/teams/teams.service';

// The project side of the assignment, on its own route instead of in
// `UpdateProjectDto`: the generic project patch is gated by the API-key scope
// rather than by `@Roles`, so a rename-capable member could otherwise move a
// project into another team — a privilege change disguised as a settings edit.
@ApiTags('Teams')
@ProjectScoped()
@Controller('projects')
@Roles('ADMIN')
@SessionOnly()
export class ProjectTeamController {
  constructor(private readonly teams: TeamsService) {}

  @Patch(':projectName/team')
  @ApiOperation({
    summary: 'Assign a project to a team, or null to make it shared',
  })
  @ApiOkResponse({ type: ProjectTeamDto })
  @ApiNotFoundResponse({ description: 'Project or team not found' })
  async assign(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: AssignProjectTeamDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectTeamDto> {
    const view = await this.teams.assignProject(
      requireActor(req),
      projectName,
      dto.teamId,
    );
    return plainToInstance(ProjectTeamDto, view, {
      excludeExtraneousValues: true,
    });
  }
}
