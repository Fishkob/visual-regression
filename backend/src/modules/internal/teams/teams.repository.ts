import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import type { Prisma, UserRole } from '@/prisma/client';

export interface TeamMemberRow {
  userId: string;
  username: string;
  role: UserRole;
}

export interface TeamProjectRow {
  id: string;
  name: string;
}

export interface TeamRow {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: Date;
  members: TeamMemberRow[];
  projects: TeamProjectRow[];
}

export interface TeamRef {
  id: string;
  name: string;
}

const teamInclude = {
  members: {
    include: { user: { select: { id: true, username: true, role: true } } },
    orderBy: { user: { username: 'asc' } },
  },
  projects: {
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.TeamInclude;

type TeamRecord = Prisma.TeamGetPayload<{ include: typeof teamInclude }>;

function toRow(record: TeamRecord): TeamRow {
  return {
    id: record.id,
    name: record.name,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    members: record.members.map((member) => ({
      userId: member.user.id,
      username: member.user.username,
      role: member.user.role,
    })),
    projects: record.projects,
  };
}

@Injectable()
export class TeamsRepository extends BaseRepository {
  async findAll(): Promise<TeamRow[]> {
    const rows = await this.client.team.findMany({
      include: teamInclude,
      orderBy: { name: 'asc' },
    });
    return rows.map(toRow);
  }

  async findById(id: string): Promise<TeamRow | null> {
    const row = await this.client.team.findUnique({
      where: { id },
      include: teamInclude,
    });
    return row ? toRow(row) : null;
  }

  async findByName(name: string): Promise<TeamRef | null> {
    return this.client.team.findUnique({
      where: { name },
      select: { id: true, name: true },
    });
  }

  async create(name: string, createdBy: string | null): Promise<TeamRow> {
    this.assertWritable();
    const row = await this.client.team.create({
      data: { name, createdBy },
      include: teamInclude,
    });
    return toRow(row);
  }

  async rename(id: string, name: string): Promise<TeamRow> {
    this.assertWritable();
    const row = await this.client.team.update({
      where: { id },
      data: { name },
      include: teamInclude,
    });
    return toRow(row);
  }

  // Membership is replaced, not patched: the caller sends the set it wants, so a
  // concurrent edit resolves to the last write instead of leaving an
  // add/remove pair half applied. The pair of statements rides the caller's
  // transaction, so the audit row and the membership cannot diverge.
  async replaceMembers(
    teamId: string,
    userIds: readonly string[],
  ): Promise<void> {
    this.assertWritable();
    await this.client.teamMember.deleteMany({ where: { teamId } });
    if (userIds.length === 0) return;
    await this.client.teamMember.createMany({
      data: userIds.map((userId) => ({ teamId, userId })),
      skipDuplicates: true,
    });
  }

  async countProjects(teamId: string): Promise<number> {
    return this.client.project.count({ where: { teamId } });
  }

  async delete(id: string): Promise<void> {
    this.assertWritable();
    await this.client.team.delete({ where: { id } });
  }

  // The reverse lookup a session needs: "which teams is this user in". Ordered
  // by name so the same principal always produces the same list.
  async findForUser(userId: string): Promise<TeamRef[]> {
    return this.client.team.findMany({
      where: { members: { some: { userId } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // The scope a session sees, as ids (ADR-082, ADR-083): every project of the
  // user's teams plus every shared project. One indexed query; the shared rule
  // lives here and nowhere else.
  async findVisibleProjectIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.client.project.findMany({
      where: {
        OR: [{ team: { members: { some: { userId } } } }, { isShared: true }],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  // Existence check for the member list before it is written: an unknown id
  // would otherwise surface as a foreign-key `P2003` from Prisma. Deactivated
  // users are accepted — membership survives a deactivation, and reactivating an
  // account must not silently drop it from its teams.
  async findExistingUserIds(userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.client.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }
}
