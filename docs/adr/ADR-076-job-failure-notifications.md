# ADR 076: A Failed Comparison Job Is Published Through an Observer

## Status

Accepted — 2026-11-11. Closes the `job.failed` deferral of
[ADR-029](./ADR-029-webhook-delivery.md); it does not change the outbox, the
dispatcher, the signing or the retry policy.

Enforced by: `JOB_FAILURE_OBSERVERS` / `IJobFailureObserver`
(`common/domain/job-failure.interface.ts`), `PostgresJobQueue.notifyFailure`,
`WebhookJobFailureObserver` and the `JOB_FAILURE_OBSERVERS` registration in
`WebhooksModule`.

## Context

ADR-029 shipped four review events and deliberately left `job.failed` out: the
queue's failure path owns its own write, and every other event is written as an
outbox row inside the `StateChangeWorkflow` transaction of the change it
announces. There is no such transaction when a comparison job dies — the queue
marks the row `FAILED` on the bare connection.

The gap is visible to a user. A comparison that never produced a result is
silent: the reviewer sees a pending comparison that never appears, and the CI
pipeline learns about the failure only when someone opens the run page or the
DLQ. The run status already reports `failed`, so the information exists; it just
has no channel.

Two constraints shape the fix. The queue is infrastructure that must not import
the webhook module (ADR-029's layering rule), and a notification must never be
able to undo the failure it reports — the failed row is the durable record, and
the delivery is a report about it.

## Decision

The queue publishes terminal failures to an observer list; the webhook module
subscribes as one observer.

- **The seam is a token in `common/domain`.** `JOB_FAILURE_OBSERVERS` is a
  multi-provider array of `IJobFailureObserver`, and `FailedJobNotice` carries the
  facts the queue has: job id, test id, error, spent attempts, the budget and the
  optional run key. The queue injects the token (`@Optional()`, so it still boots
  with no listener); it never imports `internal/webhooks`. `WebhooksModule` owns
  the observer and registers it in the array; `JobQueueModule` imports that
  module for the provider and nothing else.
- **Only a terminal failure is published.** A retryable failure goes back to
  `PENDING` with a backoff and stays silent, so a transient outage does not page
  anyone five times. All three terminal paths publish the same shape: the worker
  exhausting its budget or hitting a non-retryable error (`markFailed`), a
  corrupt payload (decode failure, immediately terminal), and a stalled job that
  burned its budget (the claim's reclaim branch). The last one is published after
  the claim transaction returns, never from inside it.
- **The notification does not ride the failure's transaction.** The `FAILED`
  write commits first; the observer then opens its own transaction
  (`PrismaUnitOfWork`) and writes the outbox rows through the same
  `WebhookDeliveryRepository.createMany`, which still asserts an ambient
  transaction. A crash between the two commits loses one notification, not the
  failure — the inverse of the review events, where a crash could otherwise lose
  the notification of a committed change. This is the "candidate that would not
  ride a transaction" ADR-029 named, made acceptable by ordering the durable
  record first.
- **An observer can never fail the transition.** Every observer call is
  individually caught and logged. A webhook store that is down does not turn a
  failed comparison into a job stuck in `PROCESSING`; it costs a log line and a
  delivery the operator can no longer receive for that failure.
- **The payload carries the job.** There is no comparison row, so
  `comparison` and `variant` are absent; `job: { id, error, attempts,
maxAttempts }` replaces them, and `links.run` is added when the upload named a
  run key. The Slack format renders `failed to compare (<error>)` and links to
  the run. `attempts` is the budget spent — `maxAttempts` for a worker failure and
  for an exhausted stall reclaim alike.
- **The event is a subscription like the others.** It is added to
  `WEBHOOK_SUBSCRIPTION_EVENTS`, so it is selectable in the dashboard, validated
  by the create/update DTO and filterable by the endpoint lookup. No schema
  change: `WebhookEndpoint.events` is a `String[]`.

## Consequences

- `run.finished` and `quota.exceeded` now have a place to land: they are queue or
  maintenance facts with the same "no domain transaction" shape, and a second
  observer is one array entry plus one dispatch builder.
- The one-notification-at-least-once rule has a hole of microseconds (the commit
  gap above). The failed row, the run status and the DLQ remain the source of
  truth; the webhook is the push. Documented in `docs/webhooks.md` instead of
  being implied.
- A deployment that subscribes to `job.failed` gets one message per dead job, not
  per attempt. An operator who wants retries needs the metrics, not the webhook.
- The queue's module now imports `WebhooksModule` for the provider. The code
  dependency stays inverted (the token is in `common/domain`); the module edge is
  the registration point, and it is the only place the two modules meet.

## Alternatives Considered

- **Let the queue write `WebhookDelivery` rows itself.** Importing the webhook
  module from `internal/job-queue` — exactly the layering violation ADR-029
  refused. Rejected.
- **Publish after the fact from a maintenance task that scans `FAILED` rows.** No
  event, so a notification arrives one sweep late (up to a day) and needs a
  "notified" marker column. Rejected.
- **Fire-and-forget HTTP from the queue.** No outbox, no retry, outbound I/O in
  the worker's hot failure path, and no delivery log. Rejected by ADR-029.
- **Publish every failed attempt.** Five notifications for one dead comparison,
  and a retry that then succeeds leaves a misleading trail. Rejected.
