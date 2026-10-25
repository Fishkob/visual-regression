import { Injectable } from '@nestjs/common';
import {
  ComparisonOutcomeRepository,
  type ComparisonOutcomeEntry,
  type TrendWindow,
} from '@public/visualTest/core/infrastructure/repositories/comparison-outcome.repository';

@Injectable()
export class ComparisonOutcomeService {
  constructor(private readonly outcomes: ComparisonOutcomeRepository) {}

  async record(entry: ComparisonOutcomeEntry): Promise<void> {
    await this.outcomes.record(entry);
  }

  async trends(
    projectName: string,
    days: number,
    now: Date = new Date(),
  ): Promise<TrendWindow> {
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return this.outcomes.trends(projectName, since);
  }
}
