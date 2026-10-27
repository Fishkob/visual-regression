import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { DomainError } from '@common/domain/domain-error';

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

@Injectable()
export class ProjectGroupRepository {
  constructor(private readonly connection: PrismaConnection) {}

  private get client() {
    return this.connection.client;
  }

  async findAll(): Promise<ProjectGroupSummary[]> {
    const rows = await this.client.projectGroup.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { projects: true } } },
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

  async delete(id: string): Promise<void> {
    const group = await this.client.projectGroup.findUnique({ where: { id } });
    if (!group) {
      throw new DomainError(`Group "${id}" not found`, 'NOT_FOUND');
    }
    await this.client.projectGroup.delete({ where: { id } });
  }
}
