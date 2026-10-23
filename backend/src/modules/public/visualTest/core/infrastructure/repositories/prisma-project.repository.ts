import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { findManyWithCount } from '@/prisma/find-many-with-count';
import { DomainError } from '@common/domain/domain-error';

export interface ProjectData {
  id: string;
  name: string;
  createdAt: Date;
  groupId?: string | null;
}

@Injectable()
export class ProjectRepository extends BaseRepository {
  async findByName(projectName: string): Promise<ProjectData | null> {
    const result = await this.client.project.findUnique({
      where: { name: projectName },
    });
    return result ?? null;
  }

  async findAll(pagination?: {
    skip: number;
    take: number;
  }): Promise<{ data: ProjectData[]; total: number }> {
    const { data, total } = await findManyWithCount<ProjectData>(
      this.client.project,
      {
        orderBy: { createdAt: 'desc' },
        skip: pagination?.skip,
        take: pagination?.take,
      },
    );
    return { data, total };
  }

  // Standalone write by design: the project-create endpoint runs outside a
  // StateChangeWorkflow transaction (creating a project mutates no test status),
  // so this primitive deliberately skips assertWritable.
  async create(name: string, groupId?: string | null): Promise<ProjectData> {
    const existing = await this.client.project.findUnique({
      where: { name },
    });
    if (existing) {
      throw new DomainError('"name" already exists', 'E_UNIQUE_CONSTRAINT');
    }
    return this.client.project.create({
      data: { name, ...(groupId ? { groupId } : {}) },
    });
  }

  // Standalone write: moving a project between groups does not mutate test
  // state, so it deliberately skips assertWritable like create.
  async updateGroupByName(
    projectName: string,
    groupId: string | null,
  ): Promise<ProjectData> {
    return this.client.project.update({
      where: { name: projectName },
      data: { groupId },
    });
  }

  async getOrCreate(name: string): Promise<ProjectData> {
    this.assertWritable();
    return this.client.project.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  async deleteByName(projectName: string): Promise<void> {
    this.assertWritable();
    await this.client.project.delete({ where: { name: projectName } });
  }
}
