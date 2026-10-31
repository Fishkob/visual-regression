export const UPLOAD_HARD_LIMIT_MB = 50;

// Two decoded images plus the diff at 4 bytes per pixel must fit the worker's
// 512 MiB heap: 16M pixels × 4 bytes × 3 buffers ≈ 192 MiB.
export const MAX_IMAGE_PIXELS = 16_000_000;

export const MAX_PDF_PAGES = 500;

// A PDF is capped separately from images because the sidecar has to hold two
// documents at once: `compare` posts baseline + candidate in ONE multipart
// request. The sidecar's request budget is therefore 2x this file size plus
// overhead (pdf-sidecar App.MAX_REQUEST_BYTES). Raising this value without
// raising that budget makes every comparison of two large PDFs fail after the
// upload already succeeded, so the two constants are one decision.
export const MAX_PDF_UPLOAD_MB = 10;
export const MAX_PDF_UPLOAD_BYTES = MAX_PDF_UPLOAD_MB * 1024 * 1024;
