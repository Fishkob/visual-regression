# ADR 016: Pixelmatch Comparison Engine

## Status

Accepted — 2026-05-23

Updated — 2026-08-03: the dual-use threshold described in the Consequences no longer exists. The business Threshold never reaches the comparison engine for either kind — `ComparisonJobProcessor` passes the fixed constant `ENGINE_TOLERANCE` (0) to both image and PDF engines, and the upload threshold no longer flows through `JobData`. The business threshold is strictly post-comparison (`threshold-policy.ts`), matching CONTEXT.md.

Updated — 2026-08-23: the threshold parameter was removed from the seam entirely — `IComparisonEngine.compare` takes only `(expected, actual)` and `ENGINE_TOLERANCE` is now applied inside each engine (the image engine passes it to pixelmatch, the PDF engine to the pdf-sidecar). The interface also gained a `readonly kind: TestKind` discriminator, and `COMPARISON_ENGINES` is provided as a `Record<TestKind, IComparisonEngine>`.

## Context

The core value proposition of the platform is pixel-level image comparison. The comparison engine needs to accept two image buffers, produce a diff image and a mismatch pixel count, and handle variable image dimensions. It is consumed by `ComparisonJobProcessor` in the intake module.

## Decision

We use [pixelmatch](https://github.com/mapbox/pixelmatch) as the comparison engine, wrapped behind an `IComparisonEngine` interface with `COMPARISON_ENGINES` token in `common/domain/`. The implementation (`PixelmatchComparisonService`) lives in `modules/internal/comparison-engine/`.

Key characteristics:

- Lazy dynamic import: pixelmatch (ESM-only) is imported via `await import('pixelmatch')` on first use, avoiding module loading issues in a CJS NestJS process
- PNG decoding via `pngjs` — images are decoded to raw RGBA pixel data before comparison
- Dimension validation: mismatched dimensions throw with status 400
- Single `compare(expected: Buffer, actual: Buffer)` method — the interface surface is the comparison only, plus a `readonly kind: TestKind` discriminator. There is no threshold parameter on the seam: the pixelmatch anti-aliasing tolerance `ENGINE_TOLERANCE = 0` is applied inside each engine, never passed by `ComparisonJobProcessor`

## Rationale

- **Accuracy**: pixelmatch is the de facto standard for pixel-level visual regression in the Node.js ecosystem (used by Playwright, Storybook, Percy core). It handles anti-aliasing, sub-pixel rendering differences, and produces a visual diff image.
- **Performance**: pixelmatch operates on raw pixel buffers with no disk I/O. For typical screenshot sizes (1280x720), comparison completes in under 50ms.
- **No external service**: Runs in-process, no network calls, no API keys, no additional infrastructure.
- **Seam for swapping**: The `IComparisonEngine` interface means pixelmatch can be replaced with libvips (`sharp`), a cloud vision API, or a dedicated image processing service without changing the domain.

## Consequences

- ESM-only pixelmatch requires dynamic `import()` — the service must be async and the module loading delay (~50ms on first call) is acceptable for a background job.
- `pngjs` is a synchronous decoder — decoding large PNGs blocks the event loop. At current sizes and volumes this is acceptable.
- The pixelmatch anti-aliasing tolerance is a fixed constant `ENGINE_TOLERANCE = 0` (`common/domain/comparison-engine.interface.ts`), applied inside each engine rather than passed through the seam. It is deliberately NOT the business threshold — the business `pixelDiffThreshold` never reaches the comparison engine (it no longer flows through `JobData`, and `IComparisonEngine.compare` takes only `(expected, actual)`). The business threshold is strictly post-comparison (`threshold-policy.ts`), matching CONTEXT.md.
- `ComparisonJobProcessor` is the sole consumer and persists the diff artifact through `ComparisonRetirementService.createPendingForVariant`.
