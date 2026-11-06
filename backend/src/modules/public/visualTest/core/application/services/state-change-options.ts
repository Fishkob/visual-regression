import type { ObservabilityEvent } from '@common/domain/observability-event.type';
import {
  isForeignKeyViolation,
  isSerializationError,
} from '@common/infrastructure/retry-policy';
import type { Prisma } from '@/prisma/client';

export const DEFAULT_STATE_CHANGE_RETRY: {
  isolationLevel: Prisma.TransactionIsolationLevel;
  maxAttempts: number;
} = {
  isolationLevel: 'Serializable',
  maxAttempts: 5,
};

// The approval transaction takes a per-comparison advisory lock first, so its
// budget has to cover a wait that is not its own work: a second reviewer holds
// that lock for the length of their decision. Prisma's 5s default counts the
// wait and surfaces a P2028 that no retry can fix.
export const APPROVAL_TRANSACTION_TIMEOUT_MS = 30_000;

// The approval transaction opens with the per-comparison advisory lock, and
// PostgreSQL fixes the SERIALIZABLE snapshot at that first statement — before
// the wait. A reviewer queued behind another therefore cannot see the state
// that commits while they wait: its attempt aborts at commit, and the retry
// finds the comparison already settled. One approval finalizes a comparison, so
// the queue is one deep: two attempts cover the waiter, plus one for a conflict
// unrelated to the queue (such as a concurrent status recompute). The budget
// stays its own constant instead of inheriting the workflow default, so a later
// global change cannot silently shrink it into a 409.
export const APPROVAL_MAX_ATTEMPTS = 3;

// Deletion retry policy: a deletion may race a concurrent upload that creates
// a test (or a row referencing the deleted rows) between the read and the
// delete, which surfaces as an FK violation (P2003) that retrying resolves.
// The default workflow retry only handles serialization failures (P2034), so
// every deletion path must add the FK rule — this preset gives it one home.
export const DELETION_STATE_CHANGE_RETRY: {
  isRetryable: (err: unknown) => boolean;
} = {
  isRetryable: (err) => isSerializationError(err) || isForeignKeyViolation(err),
};

// Prisma's 5s default is sized for a single-row change. A whole-project delete
// cascades every test and writes one audit row per test inside the same
// transaction; on a large project that legitimately runs longer than 5s, and
// the generic "transaction expired" error is not something a retry can fix
// reliably. Deletions therefore get their own budget on top of the FK retry.
export const DELETION_TRANSACTION_TIMEOUT_MS = 60_000;

export const DELETION_STATE_CHANGE_OPTIONS: {
  retry: { isRetryable: (err: unknown) => boolean };
  transactionTimeoutMs: number;
} = {
  retry: DELETION_STATE_CHANGE_RETRY,
  transactionTimeoutMs: DELETION_TRANSACTION_TIMEOUT_MS,
};

// Contract for the transactional state-change convention. A mutation must
// declare what it did: a change that mutated comparisons/screenshots names the
// testIds it affected (a non-empty tuple, so "forgot the testId" does not
// compile), a noop explicitly states nothing needs recomputing, and a deleted
// states that whole tests were removed (the testIds no longer exist, so they
// cannot be named — a third shape is needed because calling a deletion a
// "noop" would make the contract lie). A noop cannot publish events — an event
// means something changed, which means a test must be named; a deleted cannot
// either, for the same reason. The workflow recomputes statuses for `change`
// results in the same transaction, and runs post-commit side effects (events,
// stale-file cleanup) for all shapes.
export type PersistedChange =
  | {
      kind: 'change';
      affectedTestIds: readonly [string, ...string[]];
      staleUrls?: string[];
      events?: ObservabilityEvent[];
    }
  | {
      kind: 'noop';
      staleUrls?: string[];
    }
  | {
      kind: 'deleted';
      staleUrls?: string[];
    };

// Builders for the PersistedChange shapes. Callers name facts (which tests were
// affected, what changed) instead of assembling the discriminated union by hand
// — the `kind` literal, the non-empty tuple, and the optional channels live
// here, so the contract is exercised through one small surface per shape.
export function change(
  affectedTestIds: readonly [string, ...string[]],
  extras: { staleUrls?: string[]; events?: ObservabilityEvent[] } = {},
): Extract<PersistedChange, { kind: 'change' }> {
  return { kind: 'change', affectedTestIds, ...extras };
}

export function noop(
  extras: { staleUrls?: string[] } = {},
): Extract<PersistedChange, { kind: 'noop' }> {
  return { kind: 'noop', ...extras };
}

export function deleted(
  extras: { staleUrls?: string[] } = {},
): Extract<PersistedChange, { kind: 'deleted' }> {
  return { kind: 'deleted', ...extras };
}

// The change/result separation: the transaction-facing contract is the
// PersistedChange; a mutation that needs to return a value back to its caller
// (e.g. the upload outcome, the approved baseline URL) carries it as `result`
// alongside the change. The workflow normalizes a bare PersistedChange to
// `{ change, result: undefined }`, so a mutation with nothing to return just
// returns the change — the contract stays un-decorated either way.
export interface StateChangeOutcome<R> {
  change: PersistedChange;
  result: R;
}

export type StateChangeResult<R> = PersistedChange | StateChangeOutcome<R>;

export interface StateChangeOptions<R> {
  onSuccess?: (outcome: StateChangeOutcome<R>) => Promise<void>;
  // Overrides Prisma's 5s transaction budget. Only a mutation whose work scales
  // with the size of a project (a cascade delete) needs this.
  transactionTimeoutMs?: number;
  retry?: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    maxAttempts?: number;
    isRetryable?: (err: unknown) => boolean;
  };
}

export interface StoredFileChangeOptions<R> extends StateChangeOptions<R> {
  // The quota is a precondition of the stored write, not a duty of the caller:
  // a stored write that does not name its charge does not compile (ADR-043).
  // Only evidence crosses this convention — the pdf-render cache never does, so
  // it is exempt by construction rather than by a flag.
  charge: { projectName: string; bytes: number };
  store: () => Promise<string>;
  change: (fileUrl: string) => Promise<StateChangeResult<R>>;
}

export interface StoredFileChangeResult<R> extends StateChangeOutcome<R> {
  fileUrl: string;
}

// Normalizes a bare PersistedChange (a mutation with no result payload) to the
// full outcome shape the workflow works with.
export function toOutcome<R>(raw: StateChangeResult<R>): StateChangeOutcome<R> {
  return 'kind' in raw ? { change: raw, result: undefined as R } : raw;
}
