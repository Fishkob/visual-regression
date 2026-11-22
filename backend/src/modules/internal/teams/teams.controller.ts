import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireActor } from '@common/http/authenticated-principal';
import { Roles } from '@common/http/roles.decorator';
import { SessionOnly } from '@common/http/session-only.decorator';
import { ProjectSpanning } from '@common/http/project-route.decorator';
import {
  CreateTeamDto,
  ReplaceTeamMembersDto,
  TeamDto,
  UpdateTeamDto,
} from '@internal/teams/dto/team.dto';
import { TeamsService } from '@internal/teams/teams.service';
import type { TeamRow } from '@internal/teams/teams.repository';

function toDto(row: TeamRow): TeamDto {
  return plainToInstance(TeamDto, row, { excludeExtraneousValues: true });
}

// Team administration. Session-only (a CI key must never shape who can see
// what), admin-only, and audited — the same gate user administration carries,
// because a membership is an access grant (ADR-082). No `@Scope(...)`: a route
// that declares none is not callable by an API key at all.
@ApiTags('Teams')
@ProjectSpanning()
@Controller('teams')
@Roles('ADMIN')
@SessionOnly()
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'List teams with members and owned projects' })
  @ApiOkResponse({ type: [TeamDto] })
  async list(): Promise<TeamDto[]> {
    return (await this.teams.list()).map(toDto);
  }

  @Post()
  @ApiOperation({ summary: 'Create a team' })
  @ApiCreatedResponse({ type: TeamDto })
  async create(
    @Body() dto: CreateTeamDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamDto> {
    return toDto(await this.teams.create(requireActor(req), dto.name));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a team' })
  @ApiOkResponse({ type: TeamDto })
  async rename(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamDto> {
    return toDto(await this.teams.rename(requireActor(req), id, dto.name));
  }

  @Put(':id/members')
  @ApiOperation({
    summary: 'Replace the member set of a team',
  })
  @ApiOkResponse({ type: TeamDto })
  async replaceMembers(
    @Param('id') id: string,
    @Body() dto: ReplaceTeamMembersDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TeamDto> {
    return toDto(
      await this.teams.replaceMembers(requireActor(req), id, dto.userIds),
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a team that owns no projects',
  })
  @ApiOkResponse({ schema: { example: { success: true } } })
  async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: true }> {
    return this.teams.remove(requireActor(req), id);
  }
}
