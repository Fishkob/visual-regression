import { Inject, Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { AppLoggerService } from '@common/logging/app-logger.service';
import type { ObservabilityEvent } from '@common/domain/observability-event.type';
import { emitObservabilityEvent } from '@common/domain/observability-event.emitter';
import { withTimeout } from '@common/utils/with-timeout';
import { METRICS } from '@common/domain/metrics-catalog';
import {
  retry,
  exponentialBackoffMs,
  isSerializationError,
} from '@common/infrastructure/retry-policy';
import {
  StateChangeOptions,
  StoredFileChangeOptions,
  StoredFileChangeResult,
  PersistedChange,
  StateChangeResult,
  StateChangeOutcome,
  toOutcome,
  DEFAULT_STATE_CHANGE_RETRY,
} from '@public/visualTest/core/application/services/state-change-options';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';

// Transactional state-change orchestration: runs the caller's change inside a
// retried Serializable transaction, recomputes the affected test statuses in
// the same transaction, and publishes domain events + deletes stale files only
// after commit. The "recompute in the same transaction as the mutation"
// convention (see CONTEXT.md) lives here so a new mutation path can't forget it.
const STALE_FILE_DELETE_MAX_ATTEMPTS = 3;

// Each post-commit effect is bounded so a hung storage backend can delay the
// response by at most this long — the transaction has already committed, so a
// slow effect must not hold the caller (an upload or approval request) hostage.
// Failures/timeouts are metered + logged, never thrown, so the bound is purely
// latency isolation.
const POST_COMMIT_EFFECT_TIMEOUT_MS = 10_000;

@Injectable()
export class StateChangeWorkflow {
  constructor(
    private readonly uow: PrismaUnitOfWork,
    private readonly logger: AppLoggerService,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly statusService: TestStatusService,
    @Inject(METRICS_RECORDER) private readonly metrics: IMetricsRecorder,
  ) {}

  async executeStateChange<R = void>(
    fn: () => Promise<StateChangeResult<R>>,
    options: StateChangeOptions<R> = {},
  ): Promise<StateChangeOutcome<R>> {
    const change = async (): Promise<StateChangeOutcome<R>> => {
      const outcome = toOutcome(await fn());
      // The recompute convention is enforced by the type: a mutation that
      // changed domain rows but whose tests survive must return `kind: 'change'`
      // naming its tests (a non-empty tuple — "forgot the testId" does not
      // compile), a `kind: 'noop'` explicitly states nothing needs recomputing,
      // and a `kind: 'deleted'` states the tests are gone (nothing to recompute).
      // No runtime warning is needed — the shapes cannot express the ambiguity.
      if (outcome.change.kind === 'change') {
        for (const testId of outcome.change.affectedTestIds) {
          await this.statusService.recomputeStatus(testId);
        }
      }
      return outcome;
    };

    const retryPolicy = { ...DEFAULT_STATE_CHANGE_RETRY, ...options.retry };

    const outcome: StateChangeOutcome<R> = await retry(
      () =>
        this.uow.execute(change, {
          isolationLevel: retryPolicy.isolationLevel,
        }),
      {
        maxAttempts: retryPolicy.maxAttempts,
        backoffMs: (attempt) => exponentialBackoffMs(attempt - 1, 100),
        isRetryable: retryPolicy.isRetryable ?? isSerializationError,
        onRetry: (err, attempt) => {
          this.logger.warn('Transaction failed; retrying', {
            error: String(err),
            attempt,
          });
        },
      },
    );

    // Post-commit side effects run sequentially in their own failure-isolated
    // spans: onSuccess (e.g. the PDF render-cache eviction) runs BEFORE the
    // stale-file deletion so a cleanup that needs its source objects still has
    // them — the cache eviction must not depend on the reclaim already having
    // happened. A persistent stale-file deletion failure must not skip onSuccess
    // either, which the isolated spans guarantee. Each effect is bounded by
    // POST_COMMIT_EFFECT_TIMEOUT_MS so a hung storage backend cannot hold the
    // caller (an upload/approval request) past that window — the transaction
    // has already committed, so slowness after commit is a latency concern, not
    // a correctness one. Observability emission is synchronous (logger + metrics
    // are in-memory), so it needs no timeout. No effect is ever thrown.
    try {
      this.emitObservability(eventsOf(outcome.change));
    } catch (err) {
      this.recordPostCommitFailure('observability emit', err);
    }
    try {
      await withTimeout(
        options.onSuccess?.(outcome) ?? Promise.resolve(),
        POST_COMMIT_EFFECT_TIMEOUT_MS,
        () => new Error('onSuccess callback timed out'),
      );
    } catch (err) {
      this.recordPostCommitFailure('onSuccess callback', err);
    }
    try {
      await withTimeout(
        this.deleteStaleFiles(outcome.change.staleUrls ?? []),
        POST_COMMIT_EFFECT_TIMEOUT_MS,
        () => new Error('stale file deletion timed out'),
      );
    } catch (err) {
      this.recordPostCommitFailure('stale file deletion', err);
    }
    return outcome;
  }

  private recordPostCommitFailure(effect: string, err: unknown): void {
    this.metrics.incrementCounter(METRICS.postCommitCallbackFailuresTotal);
    this.logger.error({
      msg: `Post-commit ${effect} failed`,
      error: String(err),
    });
  }

  async executeWithStoredFile<R>(
    options: StoredFileChangeOptions<R>,
  ): Promise<StoredFileChangeResult<R>> {
    const fileUrl = await options.store();
    try {
      const outcome = await this.executeStateChange(
        () => options.change(fileUrl),
        {
          onSuccess: options.onSuccess,
          retry: options.retry,
        },
      );
      return { fileUrl, ...outcome };
    } catch (err) {
      await this.storage.deleteQuietly(fileUrl);
      throw err;
    }
  }

  private emitObservability(events: ObservabilityEvent[]): void {
    for (const event of events) {
      emitObservabilityEvent(event, {
        logger: this.logger,
        metrics: this.metrics,
      });
    }
  }

  private async deleteStaleFiles(stale: string[]): Promise<void> {
    if (stale.length === 0) return;
    // Transient storage failures are retried with backoff so a stale diff
    // artifact isn't leaked on a single hiccup. The retry/backoff shape is the
    // shared retry() policy — the per-URL failure model of deleteAll is adapted
    // into a throw that carries which URLs failed, so each attempt retries only
    // the URLs that failed the previous one. A persistent failure is logged —
    // it never propagates, so onSuccess still runs.
    let pending = stale;
    try {
      await retry(
        async () => {
          const outcome = await this.storage.deleteAll(pending);
          if (outcome.failed.length === 0) return;
          pending = outcome.failed.map((f) => f.url);
          throw new StaleFileDeletionFailure(outcome.failed);
        },
        {
          maxAttempts: STALE_FILE_DELETE_MAX_ATTEMPTS,
          backoffMs: (attempt) => exponentialBackoffMs(attempt - 1, 100),
          isRetryable: () => true,
          onRetry: (err, attempt) => {
            const failed =
              err instanceof StaleFileDeletionFailure ? err.failed : [];
            this.logger.warn('Stale file deletion failed; retrying', {
              attempt,
              failed: failed.length,
            });
          },
        },
      );
    } catch (err) {
      const failed =
        err instanceof StaleFileDeletionFailure
          ? err.failed
          : pending.map((url) => ({ url, error: String(err) }));
      this.logger.error(
        `Failed to delete ${failed.length} stale file(s) after commit: ${failed.map((f) => f.url).join(', ')}`,
      );
    }
  }
}

// deleteAll reports per-URL failures instead of throwing, so the shared retry()
// policy needs a throw that carries which URLs failed on the previous attempt.
class StaleFileDeletionFailure extends Error {
  constructor(readonly failed: { url: string; error: string }[]) {
    super(`stale file deletion failed for ${failed.length} URL(s)`);
  }
}

// Observability can only be emitted by a `change` — the `noop` and `deleted`
// variants cannot carry events by construction, so emission never happens for
// either.
function eventsOf(change: PersistedChange): ObservabilityEvent[] {
  return change.kind === 'change' ? (change.events ?? []) : [];
}
