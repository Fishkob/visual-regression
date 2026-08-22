import { Injectable } from '@nestjs/common';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import {
  change,
  noop,
} from '@public/visualTest/core/application/services/state-change-options';
import type { PersistedChange } from '@public/visualTest/core/application/services/state-change-options';
import type { ObservabilityEvent } from '@common/domain/observability-event.type';

// Single-candidate reclamation for the worker paths, wrapped in its own
// StateChangeWorkflow transaction. A moot diff job (retireMootCandidate) and
// an unchanged diff (handleUnchanged) both reclaim exactly one CURRENT
// candidate row; the transaction + recompute + post-commit cleanup live here
// so the caller stops hand-rolling executeStateChange. Two target shapes:
//   - candidateId: the row is already known (payload) — expectedUrl guards
//     the delete atomically via deleteCandidateIfCurrent so a row a newer
//     upload re-used in place is never reclaimed;
//   - resolveCandidate: the row must be re-read in-transaction to prove it is
//     still current (the unchanged-diff race-closer) and returns it.
// Returns the committed PersistedChange — noop when nothing was reclaimed (no
// rows, no events), change otherwise.
//
// This module OWNS its transaction; it is the transaction-owning half of the
// retirement seam. The transaction-riding half (ComparisonRetirementService)
// must instead be called from inside a workflow change.
@Injectable()
export class CandidateReclamationService {
  constructor(
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly workflow: StateChangeWorkflow,
  ) {}

  async reclaimCandidateInChange(
    input: {
      testId: string;
      expectedUrl?: string;
      events?: ObservabilityEvent[];
    } & (
      | { candidateId: string }
      | { resolveCandidate: () => Promise<{ id: string }> }
    ),
  ): Promise<PersistedChange> {
    const outcome = await this.workflow.executeStateChange(async () => {
      const candidateId =
        'candidateId' in input
          ? input.candidateId
          : (await input.resolveCandidate()).id;
      return {
        change: await this.reclaimCandidate({
          testId: input.testId,
          candidateId,
          expectedUrl: input.expectedUrl,
          events: input.events,
        }),
        result: undefined,
      };
    });
    return outcome.change;
  }

  private async reclaimCandidate(input: {
    testId: string;
    candidateId: string;
    expectedUrl?: string;
    events?: ObservabilityEvent[];
  }): Promise<PersistedChange> {
    const staleUrls = input.expectedUrl
      ? await this.screenshots.deleteCandidateIfCurrent(
          input.candidateId,
          input.expectedUrl,
        )
      : await this.screenshots.deleteCandidatesAndCollectUrls([
          input.candidateId,
        ]);
    const events = input.events ?? [];
    if (staleUrls.length === 0 && events.length === 0) {
      return noop();
    }
    return change([input.testId], { staleUrls, events });
  }
}
