import { Injectable } from '@nestjs/common';
import type { ProjectScope } from '@common/domain/project-scope';
import {
  ProjectGroupRepository,
  type ProjectGroupSummary,
} from '@public/visualTest/catalog/infrastructure/repositories/project-group.repository';

@Injectable()
export class ProjectGroupService {
  constructor(private readonly groups: ProjectGroupRepository) {}

  findAll(scope: ProjectScope): Promise<ProjectGroupSummary[]> {
    return this.groups.findAll(scope);
  }

  create(name: string): Promise<ProjectGroupSummary> {
    return this.groups.create(name);
  }

  rename(id: string, name: string): Promise<ProjectGroupSummary> {
    return this.groups.rename(id, name);
  }

  async delete(id: string): Promise<{ success: true }> {
    await this.groups.delete(id);
    return { success: true };
  }
}
