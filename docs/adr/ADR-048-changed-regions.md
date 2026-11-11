# ADR 048: Changed Regions Come From the Worker, Not the Browser

## Status

Accepted — 2026-10-31.

Amended 2026-11-10: the review page no longer lists the regions beside the
picture. The list cost the stage a fixed column, and the numbered boxes on the
picture carry the same "where" information; the decision below (the worker
derives the regions, the browser only renders them) is unchanged.

## Context

A comparison told the reviewer **how much** changed (`mismatchPixelCount`, the
diff image) but not **where**. On a 1920×1080 screenshot the diff marks a
47×7 px text change as a few red pixels somewhere on the page; the review page
offered three side-by-side panels and no way to jump to the change. Reviewers
had to find it by eye, and a diff with several scattered changes had no notion of
"change 2 of 7" at all.

The client already holds the diff image, so the obvious shortcut is to read it
back and cluster the pixels in the browser. It does not work:

- The diff artifact is served from object storage under a presigned URL on a
  different origin, and the bucket answers without `Access-Control-Allow-Origin`.
  A canvas that draws it is tainted, so `getImageData` throws. Verified against
  the running storage: the response carries no CORS header.
- A client-side scan would also have to re-download and decode a full-size PNG on
  every review, and its numbers could drift from `mismatchPixelCount`, which the
  backend already computed from the same mask.

## Decision

The comparison engine derives **changed regions** and stores them on the
comparison; the browser only renders them.

`extractChangedRegions` in `backend/src/common/utils/changed-regions.ts` reads
the pixelmatch diff buffer, finds 8-connected components, merges components
closer than 1.2 % of the image width (four thumbnails in a row, the letters of a
word), drops regions fully contained in another, and returns the 40 largest
ordered by size. Discovery runs on a downsampled copy bounded to ~1 M analysed
pixels so a 16 M-pixel screenshot needs no second full-size label array; the
per-region `pixelCount` is then counted on the original mask, which keeps the
sum comparable with `mismatchPixelCount`.

The engine writes them into `UnifiedComparison.changedRegions` (`JSONB`, nullable
for rows that predate the column), the review DTO exposes them, and the review
page opens on the marked diff with the regions numbered on the picture.

Two details are part of the decision:

- **The diff palette is pinned** (`diffColor: [255,0,0]`, `aaColor: [255,255,0]`)
  because the extractor reads the mask back out of the buffer: red must never
  mean "anti-aliased", and the AA pixels must stay excluded from the counts.
- **Stored regions are read leniently.** A malformed array degrades to "no
  regions" instead of failing the review page, and a comparison without regions
  keeps the old three-panel default. The column is additive; older comparisons
  are never rewritten.

## Alternatives considered

- **Client-side clustering with a same-origin proxy for the diff image.**
  Rejected: it adds a streaming endpoint whose only purpose is to feed a canvas,
  re-decodes the image per review, and gives CI callers nothing.
- **Enabling CORS on the bucket.** Rejected: the diff is already reachable
  through a presigned URL; loosening the bucket's origin policy for one canvas
  readback trades a storage-wide security setting for a local convenience.
- **Storing the region list in the comparison job payload only.** Rejected: the
  review page is not the job; a region list that dies with the job cannot be
  served later, and the detail response is where every other comparison fact
  lives.
- **Regions at full resolution.** Rejected: the label array for a 16 M-pixel
  image is 64 MiB on top of the three image buffers the worker already holds.

## Consequences

- Region extraction costs one extra pass over the diff buffer inside the worker
  (13–18 ms for 1440×1444 in the prototype measurement), not per review.
- `changedRegions` is additive: the SDK regenerates, older payloads stay valid,
  and a comparison written before the column existed simply has none.
- The review page gains a surface that depends on a _good_ region list. The
  downsampled discovery, the merge gap and the 40-region cap are the knobs to
  revisit if a real diff floods the picture.
- Region-level review actions (comments anchored to a region, "ignore this
  region") build on this shape; they are not part of this decision.
