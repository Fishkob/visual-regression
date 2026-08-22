export const PDF_RENDER_PREFIX = 'pdf-render';

export function pdfBaseName(objectName: string): string {
  return objectName.replace(/\.pdf$/i, '');
}

// The "is this object part of the pdf-render namespace" predicate, single-owned
// here so the maintenance sweeps and the cache-key parser can't disagree about
// what the namespace contains.
export function isPdfRenderObject(objectName: string): boolean {
  return objectName.startsWith(`${PDF_RENDER_PREFIX}/`);
}

// Inverse of pdfBaseName: the source PDF object name for a render-cache base
// name. Keeping the strip/invert pair in one module means a change to the
// file-extension convention has one home.
export function pdfSourceObjectName(baseName: string): string {
  return `${baseName}.pdf`;
}

export function pdfRenderBasePath(baseName: string): string {
  return `${PDF_RENDER_PREFIX}/${baseName}`;
}

export function pdfRenderCacheBaseName(cacheObjectName: string): string | null {
  if (!isPdfRenderObject(cacheObjectName)) return null;
  const rest = cacheObjectName.slice(PDF_RENDER_PREFIX.length + 1);
  const baseName = rest.slice(0, rest.indexOf('/'));
  return baseName === '' ? null : baseName;
}

export function pdfRenderPageCountPath(baseName: string): string {
  return `${pdfRenderBasePath(baseName)}/pagecount`;
}

export function pdfRenderCachePrefix(baseName: string): string {
  return `${pdfRenderBasePath(baseName)}/`;
}

export function pdfRenderPagePath(
  baseName: string,
  pageCount: number,
  page: number,
): string {
  return `${pdfRenderBasePath(baseName)}/${pageCount}/page-${page}.png`;
}
