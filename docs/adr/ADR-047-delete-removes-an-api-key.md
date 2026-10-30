# ADR 047: Delete Removes an API Key, Used or Not

## Status

Accepted — 2026-10-29; partially supersedes ADR-025.

## Context

ADR-025 allowed an outright delete only for a key that never authenticated:
after first use the `ApiKey` row was treated as the only record of which CI job
held that credential, so the platform offered revocation (soft delete) instead.

That rule cost more than it recorded. A used key could never be removed, so a
leaked or obsolete credential stayed in the list forever, kept its unique name
reserved, and pushed the explanation into the UI: the dashboard offered rotate,
revoke and a delete button that appeared only while `lastUsedAt` was null. The
button was hidden rather than the rule enforced in one place, and an admin who
wanted the credential gone had no action that did it.

## Decision

A delete removes the key row whether or not it has ever authenticated.

`DELETE /api/v1/api-keys/:id` no longer answers `409` for a used key: it deletes
the row and the credential stops authenticating immediately. The removal is
still audited — `AuditService.record` writes an `api-key.delete` row in the same
transaction, carrying the actor and the key's name — so "who removed which
credential, and when" survives the deleted row.

The dashboard offers exactly one row action, **Delete**, on every key. Rotation
(with its optional grace window) and revocation with a reason remain available
on the API to callers that want them; the dashboard no longer wraps them.

## Alternatives considered

- **Keep the never-used rule and hide the button** (status quo). Rejected: there
  was no way to get rid of a leaked credential, the unique name stayed blocked,
  and the invariant lived in copy instead of in the service.
- **Make delete a soft delete.** Rejected: that is what revoke is. Two endpoints
  with one meaning would hide which one keeps the row.
- **Drop delete and keep only revoke.** Rejected: revocation answers "stop it
  authenticating but keep the trail"; delete answers "remove it from my list".
  An admin needs both, and the list is the only place to offer the second.

## Consequences

- ADR-025's delete bullet no longer holds; its revocation rationale does. Revoke
  is still the soft delete that keeps the row, and rotation still leaves the
  predecessor as a revoked row — those are the two paths that preserve a trail.
- Deleting a key frees its unique name for reuse. The audit log is the only
  artifact left that names the removed credential; `lastUsedAt`, the scope list
  and the project allowlist die with the row.
- The UI loses the rotate and revoke dialogs (`RotateApiKeyDialog`,
  `RevokeApiKeyDialog`); their composables and i18n keys are gone with them, so
  the page has one action and no state machine per row.
- Coverage follows the rule: the service unit test asserts a delete on a used key
  succeeds and writes the audit row, and the lifecycle e2e asserts that `DELETE`
  on a used key returns `200`, that the raw key then answers `401`, and that the
  delete leaves exactly one `api-key.delete` audit row.
