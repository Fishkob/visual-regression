import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '@common/logging/app-logger.service';
import {
  ComparisonOutcomeRepository,
  type ComparisonOutcomeEntry,
  type TrendWindow,
} from '@public/visualTest/core/infrastructure/repositories/comparison-outcome.repository';

@Injectable()
export class ComparisonOutcomeService {
  constructor(
    private readonly outcomes: ComparisonOutcomeRepository,
    private readonly logger: AppLoggerService,
  ) {}

  // A report, not the work. The row is written outside the comparison
  // transaction on purpose — a lost trend row must never roll back a
  // comparison — and that only pays off if the write can also lose: it never
  // throws, so a job whose comparison committed cannot be failed by its
  // analytics. Before this the processor's INSERT sat outside any try, and one
  // failed row turned a finished job into a FAILED one.
  async record(entry: ComparisonOutcomeEntry): Promise<void> {
    try {
      await this.outcomes.record(entry);
    } catch (error) {
      this.logger.warn('Dropped a comparison outcome row', {
        testId: entry.testId,
        outcome: entry.outcome,
        error: String(error),
      });
    }
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
    projectId: string,
    days: number,
    now: Date = new Date(),
  ): Promise<TrendWindow> {
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return this.outcomes.trends(projectId, since);
  }
}
