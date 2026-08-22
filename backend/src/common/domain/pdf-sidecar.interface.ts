// The page-count role of the PDF sidecar: the upload pipeline calls this once
// during upload to persist the authoritative document page count on the
// Screenshot row. A narrow seam so `UploadIntake` (a public module) depends on
// an interface, not the internal HTTP client.
export const PDF_PAGE_COUNTER = 'PDF_PAGE_COUNTER';

export interface IPdfPageCounter {
  count(pdfBuffer: Buffer): Promise<number>;
}

// The page-render role of the PDF sidecar: renders a single page of a PDF
// document, returning the rasterized image plus the authoritative page count
// for the document. A narrow seam so the render-cache orchestration depends on
// an interface, not the internal HTTP client.
export const PDF_PAGE_RENDERER = 'PDF_PAGE_RENDERER';

export interface IPdfPageRenderer {
  renderPdfPage(
    pdfBuffer: Buffer,
    page: number,
  ): Promise<{ imageBuffer: Buffer; pageCount: number }>;
}

// The render-cache role: orchestrates the page-count cache and the rendered
// page-image cache for a PDF URL, and evicts the cache when the source PDF
// changes. A seam so public consumers (the review module) depend on an
// interface rather than the internal orchestrator in internal/pdf-sidecar.
// clearCache is the single eviction seam: URL-shaped and returning whether the
// eviction reclaimed anything, so the review path and the maintenance sweep
// both cross this interface and can observe the success signal. The
// URL→object-name derivation lives behind it on the implementation.
export const PDF_RENDER_CACHE = 'PDF_RENDER_CACHE';

export interface IPdfRenderCache {
  renderPage(
    pdfUrl: string,
    page: number,
  ): Promise<{ imageUrl: string; pageCount: number }>;
  clearCache(pdfUrl: string): Promise<boolean>;
}
