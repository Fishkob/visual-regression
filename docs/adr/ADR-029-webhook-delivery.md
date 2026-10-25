# ADR 029: Webhook Delivery

## Status

Accepted — 2026-10-25

## Context

Review requests and approval outcomes are only visible inside the dashboard.
The CI integration document explicitly defers webhooks ("not part of this slice
yet"), and the platform has no notification channel. ADR-004 removed the
in-process event bus: domain events are emitted post-commit as
logger + metrics only, because both consumers are observability-only.

A webhook is different: losing a "please review" notification because the
process crashed after the commit is not acceptable, and retrying is expected.
The delivery therefore needs a durable record, not a fire-and-forget call in the
request path.

## Decision

Webhook delivery is an outbox with a worker-side dispatcher.

- **Endpoints are project-scoped.** `WebhookEndpoint` stores the URL, a secret,
  subscribed events and an active flag. Management is session-only (an API key
  cannot create or edit an endpoint); until roles exist (R9), any logged-in
  operator is effectively an admin.
- **The outbox is written with the domain change.** `WebhookDelivery` rows are
  created inside the same `StateChangeWorkflow` transaction as the approval or
  the pending-comparison write. A crash cannot commit the change without its
  delivery row. Events that have no transaction (job failure) write the row
  directly.
- **The dispatcher runs in the worker process.** It claims due rows with
  `FOR UPDATE SKIP LOCKED`, sends them over HTTP and updates the row. Running it
  in the worker keeps the API request path free of outbound I/O; a deployment
  without a worker has no comparisons anyway (the worker is mandatory).
- **Delivery is at-least-once.** A row is retried with exponential backoff
  (1 m, 5 m, 30 m, 2 h, 6 h; five attempts) and then marked `FAILED` with the
  last error. Consumers deduplicate via `X-VRT-Delivery-Id`.
- **Requests are signed.** `X-VRT-Timestamp` plus
  `X-VRT-Signature: sha256=<hmac(secret, timestamp + "." + body)>`. The secret
  is generated on create and shown once; it must be recoverable server-side to
  sign, so it is stored as-is (unlike API keys, which are hashed). The database
  is already the trusted secret store in this self-hosted product.
- **Events v1:** `review.requested` (a comparison became `PENDING_APPROVAL`),
  `comparison.approved`. `job.failed` is a follow-up because the queue's failure
  path currently owns its own write; it needs an observer seam rather than a
  layering violation from the queue into the webhook module.
- **Payloads carry context, not expiring URLs.** Project/test/branch/variant,
  comparison id and mismatch count, plus a dashboard link. Presigned storage
  URLs are deliberately not part of a webhook payload (they expire and leak
  access).
- **SSRF guard.** Only `http(s)` URLs, no embedded credentials, `localhost` and
  link-local/metadata addresses blocked. RFC1918 addresses stay allowed because
  the product is self-hosted in private networks; the guard is a metadata
  endpoint protection, not a full egress policy. DNS rebinding remains a
  documented residual risk (the URL is admin-controlled).
- **Slack preset.** An endpoint can opt into a `slack` payload format that wraps
  the summary in `{ "text": "..." }` for Slack incoming webhooks. No OAuth app.

## Rationale

- The outbox is the smallest mechanism that survives a crash without adding
  Redis, a message broker, or an in-process bus.
- A worker dispatcher reuses the process that already exists and is mandatory
  for comparisons; the API stays free of outbound latency.
- Signing + delivery ids give consumers a safe, idempotent contract without
  OAuth.
- Project scoping keeps a shared deployment usable by several teams until
  per-project permissions exist.

## Alternatives Considered

- **Fire-and-forget after commit.** A crash or timeout loses the notification
  with no record. Rejected.
- **In-process event bus.** Lost on restart and has no retry. Rejected by
  ADR-004 already.
- **External queue (Redis/BullMQ/SQS).** Adds infrastructure the product
  deliberately removed. Rejected.
- **Email/SMTP.** Separate infrastructure and templates; webhooks reach Slack
  and Teams first. Deferred.
- **Global endpoints only.** A shared endpoint cannot be scoped or muted per
  project. Rejected.

## Consequences

- `WebhookDelivery` rows need retention; the existing maintenance sweep family
  gains a task in R15.
- Delivery is at-least-once and unordered; documentation must say so.
- The dispatcher only runs with the worker, which is already a documented
  requirement for comparisons.
- `job.failed` is intentionally not in v1; it lands with a queue observer seam
  (same ADR, follow-up section) so the queue does not import the webhook module.
- Endpoint secrets are stored readable; protecting the database remains the
  deployment's responsibility, like the RustFS credentials.
