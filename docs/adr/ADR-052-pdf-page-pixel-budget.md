# ADR 052: PDF Pages Have a Pixel Budget

## Status

Accepted — 2026-11-01. Complements [ADR-046](./ADR-046-pdf-comparison-sidecar.md).

## Context

ADR-046 moves PDF rendering into a Java sidecar with a 512 MiB heap and bounds
the _page count_ (`MAX_PDF_PAGES = 500`) and the _file size_ (10 MiB). Neither
bounds page geometry: a ~1 KiB PDF may declare a MediaBox of 20000×20000 pt,
which PDFBox rasterises to roughly 41 000×41 000 px, about 6.9 GiB at 150 DPI.
The JVM exits on `OutOfMemoryError` (`-XX:+ExitOnOutOfMemoryError`), and compose
restarts the container at most five times — after that the shared PDF engine is
down for every project until an operator restarts it.

The backend cannot check this itself without a PDF parser, and it cannot trust
the client. Only the sidecar can read the page boxes cheaply.

## Decision

Every PDF page must fit `20 000 000` px at 300 DPI (the comparison engine's
rendering resolution) and `10 000` px per side; larger pages are rejected with
HTTP `422` before anything is rasterised.

`PdfValidator.validatePageGeometry` reads the page's crop box after loading the
document and is called from `PdfRequestHandler.readAndValidatePdf`, so `/count`,
`/render` and `/compare` share one gate. 20 M px accepts an A3 page
(17.4 M px) and rejects A2 and above; the budget is expressed at 300 DPI so the
render path (150 DPI) is strictly cheaper. The backend maps the sidecar's message
to a `BAD_REQUEST`, surfacing the limit text at upload time instead of failing
later in the worker.

## Alternatives considered

- **Bound only the file size.** Rejected: the attack is a few hundred bytes.
- **Cap the rendered image in `PdfRenderer` only.** Rejected: `/compare`
  delegates rendering to the comparison library, so the render-only path would
  remain open.
- **Rely on the container restart.** Rejected: five crafted uploads exhaust the
  restart budget and take PDF review down for everyone.
- **Lower the per-page DPI for everyone.** Rejected: it changes comparison
  fidelity for all documents to accommodate a page size no real document uses.

## Consequences

- Oversized pages fail fast with a readable 422 at upload or render time; the
  sidecar heap cannot be exhausted by page geometry.
- Page count, file size and page area are now three independent limits; a future
  change to the rendering DPI must revisit the pixel budget.
- A document already stored before this gate can still be rejected on render;
  the API returns a clear error instead of crashing the sidecar.
