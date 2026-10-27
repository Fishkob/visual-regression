# ADR 032: JPEG/WebP Intake and Image Size Policy

## Status

Accepted — 2026-10-25

## Context

Uploads accepted PNG only and the comparison engine rejects a candidate whose
dimensions differ from the baseline with `BAD_REQUEST`. Teams capture JPEG or
WebP (Playwright screenshots, browser tooling) and a design at a different
viewport height should be reviewable under an explicit policy rather than
failing the job silently.

The comparison engine is PNG-based (`pngjs` + `pixelmatch`); every diff artifact
and baseline is PNG. Adding formats must not fork the engine or store a mix of
formats that the engine cannot decode.

## Decision

- **Normalize at intake.** PNG is stored as-is; JPEG and WebP are decoded and
  re-encoded to PNG by `ImageNormalizer` before hashing/storing. The comparison
  engine, baselines, diffs and object names stay PNG-only. The hash covers the
  stored PNG buffer (the normalized re-encode for JPEG/WebP, the raw upload for
  PNG), so a JPEG and a WebP dedupe only when they decode to identical pixels,
  and PNG uploads — never normalized — do not dedupe against a JPEG/WebP of the
  same image.
- **Dependency: `sharp` (libvips).** It decodes PNG/JPEG/WebP, enforces
  `limitInputPixels`, and provides the resize/contain/cover primitives the size
  policy needs. It is a native dependency with platform-specific binaries; the
  Docker image uses the glibc build. Pure-JS decoders were rejected: JPEG is
  slow, WebP needs a wasm bundle, and neither gives a maintained resize path.
- **Per-test `sizePolicy`** (default `FAIL`): when baseline and candidate
  dimensions differ, the image engine applies:
  - `FAIL` — reject the comparison with the dimensions in the message (today's
    behavior);
  - `PAD` — letterbox the candidate onto the baseline canvas (black bars);
  - `CROP` — center-crop the candidate to the baseline size;
  - `RESIZE` — stretch the candidate to the baseline size.
    The policy is applied to the candidate only, before pixelmatch; the diff is
    always baseline-sized.
- **Limits** are enforced at three stages. The upload pipe caps bytes for every
  format and validates signature, IHDR and dimensions on the PNG fast path only,
  so JPEG/WebP dimensions are not checked there; `ImageNormalizer` rejects them
  at decode (`sharp`'s `limitInputPixels` plus its own pixel-count check), and
  the engine re-checks PNG dimensions before decoding. Error messages name the
  format, dimensions or byte limit.

## Alternatives considered

- **Store JPEG/WebP and decode in the engine** (rejected): every consumer,
  including the diff renderer and storage reports, would need to branch on
  format; normalizing once at intake keeps one representation.
- **Client-side conversion** (rejected): the API is the trust boundary and CI
  clients should not need an image library.
- **Pure-JS decoders** (rejected): slower and incomplete (WebP), no resize
  primitives; the maintained native dependency is the better trade-off.
- **Automatic resize always** (rejected): silent geometry changes hide a real
  capture problem; the policy is explicit per test and defaults to FAIL.

## Consequences

- A JPEG/WebP upload is lossy-converted once; hashes refer to the normalized PNG.
- `sharp` adds native binaries to the runtime image and a platform matrix to
  builds; the Dockerfile already uses a glibc base.
- Size policy is test-level (not variant-level) in v1; it applies to image tests
  only, PDFs ignore it.
- PAD introduces black bars that count as mismatches unless the baseline has the
  same bars; that is visible in the diff and intentional.
