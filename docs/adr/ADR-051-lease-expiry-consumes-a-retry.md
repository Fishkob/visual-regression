# ADR 051: A Lost Webhook Lease Consumes an Attempt

## Status

Accepted — 2026-11-01. Supersedes the lease-attempt decision in
[ADR-042](./ADR-042-review-artifact-lifecycle.md).

## Context

ADR-042 returns a webhook delivery left `PROCESSING` past its 10-minute lease to
`PENDING` "with attempts unchanged". The reasoning was that a killed worker is
not the receiver's fault, so the delivery should not lose a retry.

The opposite failure is worse: a delivery that consistently crashes the worker
(for example a payload that trips a decoder) is reclaimed every 10 minutes
forever. It never reaches `WEBHOOK_MAX_ATTEMPTS`, never appears in the failed
list, and no operator is alerted — an infinite retry loop disguised as
at-least-once delivery.

## Decision

An expired lease counts as one attempt, exactly like a failed send.

`reclaimExpired` first fails the rows whose next attempt would exceed
`WEBHOOK_MAX_ATTEMPTS` (`lastError = 'Delivery lease expired'`), then returns the
remaining abandoned claims to `PENDING` with `attempts + 1`. The
`X-VRT-Delivery-Id` stays stable, so a receiver that did get the request can
still deduplicate the re-delivery.

## Alternatives considered

- **Leave attempts unchanged (ADR-042).** Rejected: the infinite loop above.
- **A separate lease-expiry counter.** Rejected: it is a second budget to tune
  and explain, and a crash is a delivery failure from the platform's point of
  view.
- **Treat an expired lease as terminal immediately.** Rejected: a deploy that
  kills the worker mid-send would fail deliveries that a single retry would
  deliver.

## Consequences

- A crashing delivery now ends in `FAILED` after at most five lease losses and is
  visible in the DLQ/failed list.
- A cleanly stopped worker still loses at most one attempt per interrupted
  delivery.
- At-least-once semantics are unchanged; consumers keep deduplicating on the
  delivery id.
