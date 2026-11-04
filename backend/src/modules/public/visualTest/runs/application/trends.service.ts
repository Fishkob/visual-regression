import { Injectable } from '@nestjs/common';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ComparisonOutcomeService } from '@public/visualTest/core/application/services/comparison-outcome.service';
import type { TrendWindow } from '@public/visualTest/core/infrastructure/repositories/comparison-outcome.repository';

export interface ProjectTrends extends TrendWindow {
  from: string;
  to: string;
  days: number;
}

@Injectable()
export class TrendsService {
  constructor(
    private readonly outcomes: ComparisonOutcomeService,
    private readonly projects: ProjectRepository,
  ) {}

  async get(projectName: string, days = 30): Promise<ProjectTrends> {
    const project = await this.projects.requireByName(projectName);
    const windowDays = Math.min(Math.max(days, 1), 365);
    const now = new Date();
    const trends = await this.outcomes.trends(project.id, windowDays, now);
    const from = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
      days: windowDays,
      ...trends,
    };
  }
}
