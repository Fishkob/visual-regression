import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { DomainError } from '@common/domain/domain-error';
import { projectIdFilter } from '@/prisma/project-scope-filter';
import type { ProjectScope } from '@common/domain/project-scope';

export interface ProjectGroupSummary {
  id: string;
  name: string;
  createdAt: Date;
  projectCount: number;
}

interface GroupRow {
  id: string;
  name: string;
  createdAt: Date;
  _count: { projects: number };
}

function toSummary(row: GroupRow): ProjectGroupSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    projectCount: row._count.projects,
  };
}

// Transaction-aware for consistency with every other repository: group writes
// are standalone administration (no audit row rides them, so nothing asserts),
// and BaseRepository resolves to the bare connection when no transaction is
// open.
@Injectable()
export class ProjectGroupRepository extends BaseRepository {
  // The count is the number of projects in the group *that the caller may see*
  // (ADR-082): a group badge that counted the other team's products would leak
  // how much they have.
  async findAll(scope: ProjectScope): Promise<ProjectGroupSummary[]> {
    const rows = await this.client.projectGroup.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { projects: { where: projectIdFilter(scope) } } },
      },
    });
    return rows.map(toSummary);
  }

  async findById(id: string) {
    return this.client.projectGroup.findUnique({ where: { id } });
  }

  async create(name: string): Promise<ProjectGroupSummary> {
    const existing = await this.client.projectGroup.findUnique({
      where: { name },
    });
    if (existing) {
      throw new DomainError('"name" already exists', 'E_UNIQUE_CONSTRAINT');
    }
    const row = await this.client.projectGroup.create({
      data: { name },
      include: { _count: { select: { projects: true } } },
    });
    return toSummary(row);
  }

  async rename(id: string, name: string): Promise<ProjectGroupSummary> {
    const group = await this.client.projectGroup.findUnique({ where: { id } });
    if (!group) {
      throw new DomainError(`Group "${id}" not found`, 'NOT_FOUND');
    }
    const duplicate = await this.client.projectGroup.findFirst({
      where: { name, id: { not: id } },
    });
    if (duplicate) {
      throw new DomainError('"name" already exists', 'E_UNIQUE_CONSTRAINT');
    }
    const row = await this.client.projectGroup.update({
      where: { id },
      data: { name },
      include: { _count: { select: { projects: true } } },
    });
    return toSummary(row);
  }

  async delete(id: string, scope: ProjectScope): Promise<void> {
    const group = await this.client.projectGroup.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    });
    if (!group) {
      throw new DomainError(`Group "${id}" not found`, 'NOT_FOUND');
    }
    // Deleting the group clears its label on every project in it (the FK is
    // `SetNull`), including the projects this caller cannot see — a boundary a
    // member can cross by deleting a label is not a boundary (ADR-082). The
    // count of the foreign ones stays unspoken, for the same reason the guard
    // answers 404 instead of 403: a number confirms what exists.
    if (scope.kind !== 'all') {
      const visible = await this.client.project.count({
        where: { groupId: id, ...projectIdFilter(scope) },
      });
      if (visible < group._count.projects) {
        throw new DomainError(
          'This group still holds projects you cannot see; an admin has to delete it',
          'CONFLICT',
        );
      }
    }
    await this.client.projectGroup.delete({ where: { id } });
  }
}
