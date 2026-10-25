export const UPLOAD_HARD_LIMIT_MB = 50;

// Two decoded images plus the diff at 4 bytes per pixel must fit the worker's
// 512 MiB heap: 16M pixels × 4 bytes × 3 buffers ≈ 192 MiB.
export const MAX_IMAGE_PIXELS = 16_000_000;

export const MAX_PDF_PAGES = 500;
