# Webhooks

Webhooks notify an external system when a review needs attention, when a review is decided, when a review is assigned and when someone comments. They are **project-scoped**, **signed**, **retried** and **at-least-once** — the receiving side deduplicates.

They are the notification channel the CI integration does not cover: a pipeline polls the job status endpoint, while a webhook pushes the event into Slack, Teams or your own service.

---

## 1. Create an endpoint

**In the dashboard:** open the project → **Webhooks** button in the project header (`/projects/<project>/webhooks`) → **Add endpoint**.

**Via the API** (browser session required, `ADMIN` role only — an API key is rejected with `403`, so a leaked CI key cannot register an endpoint that exfiltrates review notifications):

```bash
curl -X POST http://localhost:3000/api/v1/projects/my-project/webhooks \
  -H 'content-type: application/json' \
  -b "vrt_session=$SESSION_COOKIE" \
  -d '{
    "url": "https://example.com/hooks/vrt",
    "events": ["review.requested", "comparison.approved"],
    "format": "json"
  }'
```

| Field    | Required | Notes                                                                                                                  |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `url`    | yes      | `http`/`https` only, max 2048 chars, no embedded credentials. See [SSRF guard](#8-ssrf-guard-and-limits).              |
| `events` | yes      | Non-empty subset of the four subscription events.                                                                      |
| `format` | no       | `json` (default) or `slack`.                                                                                           |
| `secret` | no       | Custom signing secret (16–256 chars). Generated when omitted. It is stored readable, because the sender signs with it. |

The response contains the **full secret exactly once** (`whsec_…`). Later reads show only `****abcd`. Store it where the receiver can read it; rotate it with `PATCH …/webhooks/:id` and `{ "secret": "…" }` (the old secret stops signing immediately).

---

## 2. Events

| Event                 | Fires when                                                                               | Extra payload fields                                             |
| --------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `review.requested`    | A comparison finished with a reviewable diff and became `PENDING_APPROVAL`.              | `variant`, `comparison`                                          |
| `comparison.approved` | A review was approved and the baseline was promoted.                                     | `variant`, `comparison`, `approvedBy`, optional `reason`, `note` |
| `review.assigned`     | A test was assigned to a reviewer (a run-only assignment has no test and sends nothing). | `assignee`, `dueAt`                                              |
| `review.comment`      | A comment was posted on a test/comparison.                                               | `comment: { author, body, comparisonId }`                        |

`test` is a synthetic event the **Test** button queues; it is never part of an endpoint's subscription list and carries no `test` object.

Every event is written as a `WebhookDelivery` row **in the same transaction** as the change it announces, so a crash cannot commit a review request without its notification. The API process never sends webhooks; the worker does (see [Delivery](#6-delivery-semantics)).

Two things v1 deliberately does not send: `job.failed` (the queue's failure path owns its own write) and email. Delivery history is not pruned yet.

---

## 3. Payload

All events share one skeleton; `links.review` is a dashboard URL built from `APP_PUBLIC_URL`. Presigned storage URLs are deliberately **not** included — they expire and leak access.

```json
{
  "event": "review.requested",
  "occurredAt": "2026-10-25T09:41:07.512Z",
  "project": { "name": "checkout" },
  "test": { "name": "login", "kind": "image" },
  "branch": "main",
  "variant": {
    "viewport": "1920x1080",
    "browser": "Chromium",
    "environment": "staging"
  },
  "comparison": { "id": "9f1c…", "mismatchPixelCount": 4127, "kind": "image" },
  "links": {
    "review": "http://localhost/projects/checkout/tests/login?branch=main"
  }
}
```

`comparison.approved` adds the decision context, both fields optional and omitted when empty:

```json
{
  "event": "comparison.approved",
  "approvedBy": "ada",
  "reason": "intentional-redesign",
  "note": "Copy change in the hero",
  "links": {
    "review": "http://localhost/projects/checkout/tests/login?branch=main"
  }
}
```

`branch` is `null` when the comparison is not branch-scoped. Field types: `occurredAt` is ISO-8601, `comparison.mismatchPixelCount` is a number, `dueAt` is ISO-8601 or `null`, `comment.comparisonId` is a string or `null`.

---

## 4. Headers and signature

| Header              | Value                                                       |
| ------------------- | ----------------------------------------------------------- |
| `content-type`      | `application/json`                                          |
| `user-agent`        | `visual-regression-webhook/1`                               |
| `x-vrt-event`       | Event name (`review.requested`, …, `test`)                  |
| `x-vrt-delivery-id` | Delivery id — stable across retries and replays             |
| `x-vrt-timestamp`   | Unix seconds of this attempt                                |
| `x-vrt-signature`   | `sha256=<hex HMAC-SHA256(secret, "<timestamp>.<rawBody>")>` |

The signed string is the timestamp, a literal `.`, and the **raw request body**. Verify against the bytes you received — never against re-serialized JSON, whose key order or spacing will differ.

### Node / Express

```js
const { createHmac, timingSafeEqual } = require("node:crypto");
const express = require("express");

app.post(
  "/hooks/vrt",
  express.raw({ type: "application/json" }), // raw body, not express.json()
  (req, res) => {
    const timestamp = req.get("x-vrt-timestamp");
    const provided = req.get("x-vrt-signature") ?? "";
    const body = req.body.toString("utf8");

    // A replayed capture should not verify forever.
    if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return res.status(401).end();
    }

    const expected = `sha256=${createHmac("sha256", process.env.WEBHOOK_SECRET)
      .update(`${timestamp}.${body}`)
      .digest("hex")}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).end();
    }

    const event = JSON.parse(body);
    if (event.event === "review.requested") {
      // post to Slack, ticketing, whatever
    }
    res.status(200).end(); // respond fast — the delivery times out after 10 s
  },
);
```

### Shell

```bash
timestamp=1761385267      # x-vrt-timestamp
body='{"event":"test"}'   # the exact bytes received
expected="sha256=$(printf '%s' "$timestamp.$body" \
  | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -r | cut -d' ' -f1)"
[ "$expected" = "$SIGNATURE_HEADER" ] && echo "verified" || echo "rejected"
```

---

## 5. Slack format

An endpoint with `"format": "slack"` receives `{ "text": "…" }` instead of the JSON payload, so it drops straight into a Slack incoming webhook (no OAuth app, no signing — Slack authenticates by URL):

```json
{
  "text": "[Visual regression] checkout / login needs review — http://localhost/projects/checkout/tests/login?branch=main"
}
```

The verbs are fixed per event: `needs review`, `was approved` (with `[reason] — note` appended), `was assigned to <assignee>`, `received a comment from <author>`, and `test delivery` for the test event.

---

## 6. Delivery semantics

Delivery is an **outbox**: rows are claimed with `FOR UPDATE SKIP LOCKED`, sent over HTTP, and retried. Consequences you must design for:

- **At-least-once, not exactly-once.** A timeout after your handler committed looks like a failure to us. Deduplicate on `x-vrt-delivery-id`.
- **Retries reuse the delivery id** — and so does a manual replay. A consumer that permanently remembers delivery ids will drop a deliberate replay; clear the id in your store before replaying.
- **Unordered.** Rows are claimed oldest-first, but retries push a delivery back, so `review.requested` can arrive after `comparison.approved` for the same test.
- **Success is any 2xx.** A 3xx is a failure — redirects are not followed, so an endpoint cannot route the request to a host the SSRF guard rejected. A timeout or a network error is also a failure; the response body is ignored, apart from the first 200 chars being recorded as `lastError` (at most 4 KiB of it is read).
- **Timeout is 10 s per attempt.** Acknowledge fast and do the slow work asynchronously.
- **Retry schedule:** 5 attempts total, with delays of **1 m, 5 m, 30 m, 2 h** between them. The fifth failure is terminal (`FAILED` with the last error).
- **Deliveries need the worker.** The dispatcher starts only in worker mode (`NODE_MODE=worker`, the `worker` Docker service). Without a worker, rows stay `PENDING` forever. It polls every 10 s and claims up to 20 rows per cycle.
- **A disabled or deleted endpoint fails immediately** (`Endpoint is disabled or deleted`) instead of retrying. Deactivating an endpoint does not cancel rows that are already queued — each one is failed once on its next claim.
- **Abandoned claims are reclaimed.** A row left in `PROCESSING` for more than 10 minutes (dispatcher crash, restart) returns to `PENDING` without resetting its attempt count.

---

## 7. Managing endpoints and deliveries

All routes are under `/api/v1/projects/{project}/webhooks` and require a **browser session with the `ADMIN` role**.

| Method   | Path                                   | Purpose                                                                                                                                                       |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`                                    | List endpoints (secret preview only).                                                                                                                         |
| `POST`   | `/`                                    | Create; returns the full secret once.                                                                                                                         |
| `PATCH`  | `/{id}`                                | Change URL/events/format, toggle `active`, rotate `secret`.                                                                                                   |
| `DELETE` | `/{id}`                                | Delete the endpoint **and its delivery log**.                                                                                                                 |
| `GET`    | `/{id}/deliveries`                     | Last 50 deliveries, newest first (`PENDING`/`PROCESSING`/`DELIVERED`/`FAILED`, `attempts` = failed attempts, `responseStatus`, `lastError`, `nextAttemptAt`). |
| `POST`   | `/{id}/deliveries/{deliveryId}/replay` | Requeue one delivery: attempts reset, `nextAttemptAt` = now. Returns `202`.                                                                                   |
| `POST`   | `/{id}/test`                           | Queue a synthetic `test` delivery. Returns `202`.                                                                                                             |

Endpoint create/update/delete are audited (`webhook.create`, `webhook.update`, `webhook.delete`), and the secret rotation shows up in the audit metadata as `secretRotated: true`.

**Debugging loop:** add the endpoint with your receiver's URL → press **Test** → open **Deliveries** → inspect `responseStatus`/`lastError` → fix the receiver → **Replay**. Because retries are scheduled, a failed delivery can take up to ~2.5 h to reach `FAILED`.

---

## 8. SSRF guard and limits

The URL is admin-controlled, but a webhook turns it into a server-side request, so endpoint URLs are validated on create and update:

- `http`/`https` only, max 2048 characters, no `user:password@` in the URL.
- Blocked hosts: `localhost`, `*.localhost`, `metadata.google.internal`, `metadata.goog`, `0.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16` (cloud metadata), `100.64.100.200`, the whole `::/96` range (unspecified, loopback, IPv4-compatible and IPv4-mapped — including `[::ffff:127.0.0.1]` and its hex form `[::ffff:7f00:1]`), and `fe80::/10`.
- **RFC1918 addresses stay allowed** — the product is self-hosted in private networks, so `10.x`, `172.16–31.x` and `192.168.x` receivers are legitimate targets.
- **Redirects are not followed.** A `301`/`302`/`307`/`308` is recorded as a failed delivery with `HTTP 3xx`, because following it would bypass the host check above.
- Residual risk: the check is hostname-only and does not resolve DNS, so a name that points at a blocked address (a wildcard resolver such as `nip.io`, or DNS rebinding) is not caught. Keep endpoints inside your network.

There is no per-endpoint rate limit or delivery-count cap; volume follows the review traffic of the project.

---

## 9. Troubleshooting

| Symptom                                          | Cause                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Deliveries stay `PENDING`                        | No worker running (`NODE_MODE=worker`), or the endpoint is inactive.                            |
| `403 "This endpoint requires a browser session"` | You sent `x-api-key`; webhook administration is session-only (`ADMIN`).                         |
| `400 "Webhook URL host … is not allowed"`        | The SSRF guard rejected the target — use a private-network IP or a public hostname.             |
| Receiver always answers `401`                    | Signature computed over re-serialized JSON, or over the body _without_ the `timestamp.` prefix. |
| `FAILED` after ~2.5 h                            | Five attempts exhausted; inspect `lastError`, then **Replay** after fixing the receiver.        |
| Same notification twice                          | Expected at-least-once behaviour — deduplicate on `x-vrt-delivery-id`.                          |

---

## See also

- [ADR-029 — Webhook Delivery](adr/ADR-029-webhook-delivery.md): outbox, signing, retry and SSRF decisions.
- [ADR-042 — Review Artifact Lifecycle](adr/ADR-042-review-artifact-lifecycle.md): the `PROCESSING` lease and the approval `reason`/`note`.
- [CI Integration](ci-integration.md): polling-based gating, if you do not want webhooks.
- [Permissions](permissions.md): who may administer endpoints.
