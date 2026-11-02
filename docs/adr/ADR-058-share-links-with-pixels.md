# ADR 058: Share links include the reviewable diff

## Status

Accepted — 2026-11-21. Supersedes the "no screenshot URLs" part of
[ADR-038](ADR-038-share-links.md).

## Context

ADR-038 shipped read-only share links whose public payload was deliberately
metadata-only: project/test/run identity, status and counts, no image URLs. The
stated purpose is that design, product and clients can look at a change without
an account. A status table does not serve that purpose — the stakeholder cannot
see what changed, which is the only reason to share a visual-regression link.
ADR-038 itself recorded the consequence ("No screenshots are embedded;
stakeholders see status/counts, not pixels").

The constraint behind the original decision was the payload contract: the public
page must stay a narrow read with no actions, no API-key/user data and no
long-lived storage access.

## Decision

- A **TEST** share resolves the test's latest reviewable comparison (the same
  PENDING_APPROVAL/APPROVED set the authenticated review reads, newest first) and
  includes it in the public payload:
  `id`, `status`, `kind`, `mismatchPixelCount`, `mismatchPageCount`,
  `pageCount`, the variant coordinates, and three **short-lived presigned URLs**
  for baseline, candidate and diff.
- URLs are signed **on every resolve**, not stored on the share row. A page
  reload after the storage signature expires gets fresh URLs; the share token's
  own expiry is unchanged.
- Project and run shares stay metadata-only in v1. They are lists; embedding a
  thumbnail per row would multiply storage reads and the public payload's size.
- Nothing becomes mutable: the public page stays read-only, approval and deletion
  remain authenticated, and the access audit (`share.access`) is unchanged.
- A test without a reviewable comparison (unchanged, or all approved) resolves
  without the `comparison` member; the page falls back to the metadata it showed
  before.

## Security

- The share token remains the bearer secret; the optional passphrase still gates
  the resolve. Anyone who can resolve the share can now see the pixels — which is
  the feature.
- The presigned URLs are independently usable until their TTL (the existing
  `RUSTFS_SIGNED_URL_TTL_SECONDS`, default 1 h). That is a deliberate trade-off:
  it bounds the damage of a leaked URL and avoids a proxy that would need its own
  authorization path.
- The payload still contains no user, API-key or other-project data.
- Access is audited per resolve, as before.

## Alternatives considered

- **Proxy the images through the public endpoint** (stream bytes for a share
  token): gives per-request authorization but adds a new public download path,
  its own rate limit and abuse surface, and duplicates the PDF viewer plumbing.
- **Embed thumbnails in project/run shares** — deferred: heavier payload, no
  clear request yet.
- **Store signed URLs on the share row** — rejected: they expire; the page would
  show broken images after the TTL until the link itself expires.
- **Make the whole share JWT-based** — rejected in ADR-038 (no revocation); still
  true.

## Consequences

- A stakeholder link finally shows the diff, including a PDF page count and the
  three PDF links.
- A share page load is now also a signing operation (cheap, local HMAC) and may
  read the comparison row; still one resolve request.
- The public payload grows by the comparison object. `PublicShareDto` gains a
  typed `comparison` member so the SDK and the defensive frontend mapper can see
  it instead of parsing a free-form record.
- Tests: the service unit suite covers the signed payload and the
  no-comparison case; the public route's e2e suite keeps its metadata
  expectations (the member is optional).
