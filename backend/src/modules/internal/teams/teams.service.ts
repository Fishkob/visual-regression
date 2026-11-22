import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import { AuditService } from '@internal/audit/audit.service';
import {
  TeamsRepository,
  type TeamRef,
  type TeamRow,
} from '@internal/teams/teams.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';

export interface ProjectTeamView {
  projectId: string;
  projectName: string;
  teamId: string | null;
  teamName: string | null;
}

// Team administration (ADR-082). Every write is transaction-riding and audited —
// membership and project ownership decide who may see which product, so a change
// without a record of who made it is the one thing this surface must not
// produce.
@Injectable()
export class TeamsService {
  constructor(
    private readonly teams: TeamsRepository,
    private readonly projects: ProjectRepository,
    private readonly audit: AuditService,
    private readonly uow: PrismaUnitOfWork,
  ) {}

  list(): Promise<TeamRow[]> {
    return this.teams.findAll();
  }

  // Read, not administration: the caller's own memberships, for /auth/me.
  teamsForUser(userId: string): Promise<TeamRef[]> {
    return this.teams.findForUser(userId);
  }

  async create(actor: string, name: string): Promise<TeamRow> {
    const trimmed = name.trim();
    if (await this.teams.findByName(trimmed)) {
      throw new ConflictException(`Team "${trimmed}" already exists`);
    }
    return this.uow.execute(async () => {
      const team = await this.teams.create(trimmed, actor);
      await this.audit.record({
        actor,
        action: AUDIT_ACTIONS.teamCreate,
        targetType: 'team',
        targetId: team.id,
        metadata: { name: trimmed },
      });
      return team;
    });
  }

  async rename(actor: string, id: string, name: string): Promise<TeamRow> {
    const team = await this.require(id);
    const trimmed = name.trim();
    if (trimmed === team.name) return team;
    const duplicate = await this.teams.findByName(trimmed);
    if (duplicate && duplicate.id !== id) {
      throw new ConflictException(`Team "${trimmed}" already exists`);
    }
    return this.uow.execute(async () => {
      const updated = await this.teams.rename(id, trimmed);
      await this.audit.record({
        actor,
        action: AUDIT_ACTIONS.teamUpdate,
        targetType: 'team',
        targetId: id,
        metadata: { from: team.name, to: trimmed },
      });
      return updated;
    });
  }

  async replaceMembers(
    actor: string,
    id: string,
    userIds: readonly string[],
  ): Promise<TeamRow> {
    const team = await this.require(id);
    const wanted = [...new Set(userIds)];
    const before = new Set(team.members.map((member) => member.userId));
    const added = wanted.filter((userId) => !before.has(userId));
    const removed = [...before].filter((userId) => !wanted.includes(userId));
    // A set that did not change is not a change: it gets neither a write nor an
    // audit row (the same rule the state-change workflow applies to a noop), and
    // it cannot carry an unknown id either — an id that is not a member would
    // have to appear as `added`.
    if (added.length === 0 && removed.length === 0) return team;
    if (wanted.length > 0) {
      const existing = await this.teams.findExistingUserIds(wanted);
      const unknown = wanted.filter((userId) => !existing.has(userId));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Unknown user id${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
        );
      }
    }
    const usernameOf = new Map(
      team.members.map((member) => [member.userId, member.username]),
    );
    return this.uow.execute(async () => {
      await this.teams.replaceMembers(id, wanted);
      await this.audit.record({
        actor,
        action: AUDIT_ACTIONS.teamMembers,
        targetType: 'team',
        targetId: id,
        metadata: {
          name: team.name,
          addedUserIds: added,
          removedUserIds: removed,
          removedUsernames: removed.map(
            (userId) => usernameOf.get(userId) ?? userId,
          ),
        },
      });
      const updated = await this.teams.findById(id);
      if (!updated) throw new NotFoundException('Team not found');
      return updated;
    });
  }

  async remove(actor: string, id: string): Promise<{ success: true }> {
    const team = await this.require(id);
    // Deleting the team would turn its projects into shared ones — a widening
    // nobody asked for, so an owning team is a conflict, not a cascade. The
    // foreign key is `Restrict`, and the P2003 below is the same answer when a
    // concurrent assignment slips between this count and the delete.
    const projects = await this.teams.countProjects(id);
    if (projects > 0) {
      throw new ConflictException(
        `Team "${team.name}" still owns ${projects} project${projects === 1 ? '' : 's'}; move or unassign them first`,
      );
    }
    await this.uow.execute(async () => {
      try {
        await this.teams.delete(id);
      } catch (error) {
        if ((error as { code?: string }).code === 'P2003') {
          throw new ConflictException(
            `Team "${team.name}" still owns projects; move or unassign them first`,
          );
        }
        throw error;
      }
      await this.audit.record({
        actor,
        action: AUDIT_ACTIONS.teamDelete,
        targetType: 'team',
        targetId: id,
        metadata: {
          name: team.name,
          memberCount: team.members.length,
        },
      });
    });
    return { success: true };
  }

  // `teamId = null` is the deliberate "shared" state, so unassigning is a write
  // with a trail — it widens who can see the project.
  async assignProject(
    actor: string,
    projectName: string,
    teamId: string | null,
  ): Promise<ProjectTeamView> {
    const project = await this.projects.requireByName(projectName);
    const team = teamId ? await this.require(teamId) : null;
    const fromTeamId = project.teamId ?? null;
    if (fromTeamId === (team?.id ?? null)) {
      return {
        projectId: project.id,
        projectName: project.name,
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
      };
    }
    const fromTeam = fromTeamId ? await this.teams.findById(fromTeamId) : null;
    await this.uow.execute(async () => {
      await this.projects.updateTeamByName(projectName, team?.id ?? null);
      await this.audit.record({
        actor,
        action: AUDIT_ACTIONS.teamProjectAssign,
        projectName: project.name,
        targetType: 'project',
        targetId: project.id,
        metadata: {
          from: fromTeam?.name ?? null,
          to: team?.name ?? null,
        },
      });
    });
    return {
      projectId: project.id,
      projectName: project.name,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
    };
  }

  private async require(id: string): Promise<TeamRow> {
    const team = await this.teams.findById(id);
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }
}
