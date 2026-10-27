# ADR 046: PDF Comparison Runs in a Java Sidecar

## Status

Accepted — 2026-10-27

## Context

A `UnifiedTest` has a `kind` discriminator (`image` | `pdf`), and a PDF is
compared page by page: the mismatch metric is pages, not pixels. The image
pipeline's engine (pixelmatch, see [ADR-016](./016-pixelmatch-comparison-engine.md))
decodes PNG buffers in-process; it cannot read PDF, render pages, or produce a
side-by-side diff document.

Rendering a PDF page faithfully is the hard part: it needs a full PDF
interpreter (fonts, CID encodings, transparency groups, annotations). The
Node ecosystem offers renderers only as native or WASM builds of the same C
libraries, and they do not give a page-level diff of their own.

## Decision

PDF comparison runs in a separate **Java sidecar** (`pdf-sidecar/`), reached over
HTTP by the worker.

- **Runtime.** Java 25 (Temurin JRE, `eclipse-temurin:25-jre-alpine`), Javalin on
  Jetty, port `3001`. The library is `de.redsix:pdfcompare` on PDFBox, which
  already implements the side-by-side page diff this product needs; the sidecar
  owns validation, thresholds and metrics around it.
- **Contract.** Four endpoints, all stateless and byte-oriented:
  `POST /compare` (multipart `expected` + `actual` + `threshold`, returns the
  diff PDF body with `X-Mismatch-Count` and `X-Page-Count` headers),
  `POST /render` (one page as an image), `POST /count` (page count) and
  `GET /health`.
- **Backend seam.** `PdfSidecarClient` implements the same `IComparisonEngine`
  interface as the image engine (`kind = 'pdf'`, registered in
  `COMPARISON_ENGINES`), plus `IPdfPageCounter` / `IPdfPageRenderer` for the page
  count and the render cache. The worker does not branch on the runtime: it asks
  the engine for the comparison result.
- **The sidecar is stateless.** It receives bytes and returns counts and a diff
  document. Object storage, URL round-tripping, transactionality and the
  comparison row stay in the backend; the sidecar has no database and no
  credentials. A missing or malformed `X-*-Count` header is a contract breach
  (`SIDECAR_ERROR`), not a zero-mismatch result.
- **Failure handling.** Reads use the shared retry policy for 5xx and transport
  failures and fail immediately on a 4xx or a malformed response; a permanently
  unreachable sidecar is a deployment error, not a retryable comparison.
- **Observability.** The OpenTelemetry Java agent is optional at runtime, like
  the backend's own tracing (ADR-022); spans flow through the same OTLP endpoint
  when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

## Rationale

- The decision that is hard to reverse is **not** "use a sidecar": it is "the PDF
  interpreter is a JVM process". Any replacement (MuPDF, a hosted rendering API)
  is a different runtime, a different image and a different licence — swapping
  pixelmatch for something else stays a one-file change inside
  `internal/comparison-engine`.
- Keeping PDF work out of the Node process protects the API: a 200-page document
  with broken fonts can be slow or CPU-bound, and the sidecar's heap, ZGC and
  `ExitOnOutOfMemoryError` bound that failure to one container instead of the
  worker pod.
- The byte-only contract keeps the sidecar replaceable and testable: the e2e
  suite talks to a real sidecar over Compose, unit tests mock the client.
- The image path is untouched; the two engines meet at one interface, so the
  worker, the retirement and the review loop have one shape.

## Alternatives considered

- **Render PDFs in Node (pdfjs-dist / mupdf WASM) and diff the page images.**
  Would reuse the pixelmatch engine and drop the Java runtime, but the renderer
  fidelity for embedded fonts and transparency is worse, page-level diff
  reporting (added/removed/reordered pages) would have to be written from
  scratch, and the memory profile of a large WASM decode is unbounded in the
  worker process.
- **Shell out to `pdftoppm` / Ghostscript inside the worker image.**
  Adds system binaries to the Node image, no structured diff, and the same
  CPU-bounding problem without a container boundary.
- **A hosted PDF-diff API.** Ships customer documents off the deployment, which
  contradicts the self-hosted product and its storage story (ADR-004).
- **One generic "external comparator" sidecar for images and PDFs.** The image
  path is fast and in-process today; moving it would trade a millisecond-range
  call for a network hop and lose the pixelmatch/PAD/CROP/RESIZE semantics
  (ADR-032).

## Consequences

- The deployment grows a second runtime; `docker-compose*.yml` and the Helm chart
  ship the sidecar, and `scripts/dev.sh infra` starts it because PDF tests and
  e2e need it.
- The sidecar must be versioned together with the backend: the `/compare`
  contract (multipart field names, count headers) is an interface between two
  images in the same release.
- PDF work is bounded by the sidecar's 512 MB heap and timeout; a document that
  exceeds either fails the comparison with a named error instead of stalling the
  worker.
- The sidecar is trusted: it is not internet-facing, and an SSRF-style caller
  cannot reach it because the backend is the only client and URLs never leave the
  backend.
