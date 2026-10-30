const VIEWPORT_PATTERN = /^(\d+)x(\d+)$/;

export interface ViewportSize {
  width: number;
  height: number;
}

// Uploads accept any non-empty viewport string, so a pixel size is a hint rather
// than a guarantee: callers fall back when a label is free-form ("custom").
export function parseViewport(viewport: string): ViewportSize | null {
  const match = VIEWPORT_PATTERN.exec(viewport.trim());
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}
