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

  // Oscillation count: how often the test flipped between changed and clean in
  // the window. One transition is normal (a change was reviewed); repeated
  // flips are the flake signal.
  async flakeForTest(
    testId: string,
    days: number,
    now: Date = new Date(),
  ): Promise<{ transitions: number; changed: number; clean: number }> {
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const events = await this.outcomes.eventsForTest(testId, since);
    let transitions = 0;
    let changed = 0;
    let clean = 0;
    let isChangedBefore: boolean | null = null;
    for (const event of events) {
      const isChanged = event.outcome === 'changed';
      if (isChanged) changed += 1;
      else clean += 1;
      if (isChangedBefore !== null && isChangedBefore !== isChanged)
        transitions += 1;
      isChangedBefore = isChanged;
    }
    return { transitions, changed, clean };
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
