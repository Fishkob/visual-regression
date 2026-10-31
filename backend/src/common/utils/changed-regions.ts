import type { ChangedRegion } from '@common/domain/changed-region.type';

// pixelmatch paints a mismatched pixel as opaque red (255,0,0) and an ignored
// anti-aliased pixel as opaque yellow (255,255,0). The engine pins both colours,
// so the diff buffer itself is the mask: no second pass over the images.
const DIFF_RED = 255;

const DEFAULT_MAX_REGIONS = 40;
const DEFAULT_ANALYSIS_BUDGET = 1_000_000;
const DEFAULT_MERGE_GAP_RATIO = 0.012;
const DEFAULT_MAX_COMPONENTS = 600;

export interface ExtractChangedRegionsOptions {
  // A review rail with 400 entries is a second kind of "I cannot see it": the
  // largest regions are kept and the tail is dropped.
  maxRegions?: number;
  // Region discovery runs on a downsampled copy so a 16M-pixel screenshot does
  // not need a second 64 MiB label array. Boxes are scaled back up and their
  // pixel counts are exact, because the count is taken from the full-size diff.
  analysisBudget?: number;
  // Two areas closer than this share (of the analysis width) are one intent:
  // four screenshots in a row, or the letters of one word.
  mergeGapRatio?: number;
  maxComponents?: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Component extends Box {
  pixelCount: number;
}

function isDiffPixel(diff: Uint8Array, offset: number): boolean {
  return (
    diff[offset] === DIFF_RED &&
    diff[offset + 1] === 0 &&
    diff[offset + 2] === 0
  );
}

function isNear(a: Box, b: Box, gap: number): boolean {
  return (
    b.minX - a.maxX <= gap &&
    a.minX - b.maxX <= gap &&
    b.minY - a.maxY <= gap &&
    a.minY - b.maxY <= gap
  );
}

function mergeBoxes(a: Box, b: Box): Box {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.minY >= outer.minY &&
    inner.maxX <= outer.maxX &&
    inner.maxY <= outer.maxY
  );
}

// Finds the connected areas of a pixelmatch diff buffer. Returned regions are
// ordered by size (largest first), are disjoint at the box level, and carry the
// exact number of mismatched pixels inside their box.
export function extractChangedRegions(
  diff: Uint8Array,
  width: number,
  height: number,
  options: ExtractChangedRegionsOptions = {},
): ChangedRegion[] {
  if (width <= 0 || height <= 0) return [];
  if (diff.length < width * height * 4) {
    throw new Error(
      `Diff buffer is smaller than ${width}x${height} pixels (got ${diff.length} bytes)`,
    );
  }

  const budget = Math.max(1, options.analysisBudget ?? DEFAULT_ANALYSIS_BUDGET);
  const analysisScale = Math.min(1, Math.sqrt(budget / (width * height)));
  const scaledWidth = Math.max(1, Math.round(width * analysisScale));
  const scaledHeight = Math.max(1, Math.round(height * analysisScale));

  const columnMap = new Int32Array(width);
  for (let x = 0; x < width; x++) {
    columnMap[x] = Math.min(
      scaledWidth - 1,
      Math.floor((x * scaledWidth) / width),
    );
  }

  const mask = new Uint8Array(scaledWidth * scaledHeight);
  let hasDiff = false;
  for (let y = 0; y < height; y++) {
    const scaledRow =
      Math.min(scaledHeight - 1, Math.floor((y * scaledHeight) / height)) *
      scaledWidth;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (!isDiffPixel(diff, rowStart + x * 4)) continue;
      mask[scaledRow + columnMap[x]] = 1;
      hasDiff = true;
    }
  }
  if (!hasDiff) return [];

  const components = findComponents(mask, scaledWidth, scaledHeight);
  const keepComponents = Math.max(
    1,
    options.maxComponents ?? DEFAULT_MAX_COMPONENTS,
  );
  const mergeGap = Math.max(
    1,
    Math.round(
      scaledWidth * (options.mergeGapRatio ?? DEFAULT_MERGE_GAP_RATIO),
    ),
  );
  const merged = mergeComponents(
    [...components]
      .sort((a, b) => b.pixelCount - a.pixelCount)
      .slice(0, keepComponents),
    mergeGap,
  );

  const backScale = 1 / analysisScale;
  const boxes = merged
    .map((box) => ({
      minX: Math.max(0, Math.floor(box.minX * backScale)),
      minY: Math.max(0, Math.floor(box.minY * backScale)),
      maxX: Math.min(width, Math.ceil((box.maxX + 1) * backScale)),
      maxY: Math.min(height, Math.ceil((box.maxY + 1) * backScale)),
    }))
    .filter((box) => box.maxX > box.minX && box.maxY > box.minY)
    .sort(
      (a, b) =>
        (b.maxX - b.minX) * (b.maxY - b.minY) -
        (a.maxX - a.minX) * (a.maxY - a.minY),
    );

  const kept: Box[] = [];
  for (const box of boxes) {
    // A box inside another box adds nothing to look at; counting it again would
    // double book its pixels.
    if (kept.some((outer) => contains(outer, box))) continue;
    kept.push(box);
  }

  return kept
    .map((box) => ({
      x: box.minX,
      y: box.minY,
      width: box.maxX - box.minX,
      height: box.maxY - box.minY,
      pixelCount: countDiffPixels(diff, width, box),
    }))
    .filter((region) => region.pixelCount > 0)
    .sort((a, b) => b.pixelCount - a.pixelCount)
    .slice(0, Math.max(1, options.maxRegions ?? DEFAULT_MAX_REGIONS));
}

function countDiffPixels(diff: Uint8Array, width: number, box: Box): number {
  let count = 0;
  for (let y = box.minY; y < box.maxY; y++) {
    let offset = (y * width + box.minX) * 4;
    for (let x = box.minX; x < box.maxX; x++, offset += 4) {
      if (isDiffPixel(diff, offset)) count++;
    }
  }
  return count;
}

function findComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): Component[] {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const components: Component[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let depth = 0;
    stack[depth++] = start;
    seen[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let pixelCount = 0;

    while (depth > 0) {
      const index = stack[--depth];
      const x = index % width;
      const y = (index - x) / width;
      pixelCount++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbour = ny * width + nx;
          if (!mask[neighbour] || seen[neighbour]) continue;
          seen[neighbour] = 1;
          stack[depth++] = neighbour;
        }
      }
    }

    components.push({ minX, minY, maxX, maxY, pixelCount });
  }

  return components;
}

// Repeated pairwise merging is enough at this size: every merge removes one
// component, so the whole pass is quadratic in the component count and the
// discovery mask keeps that count small.
function mergeComponents(components: Box[], gap: number): Box[] {
  const merged = [...components];
  let didMerge = true;
  while (didMerge) {
    didMerge = false;
    for (let i = 0; i < merged.length && !didMerge; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        if (!isNear(merged[i], merged[j], gap)) continue;
        merged[i] = mergeBoxes(merged[i], merged[j]);
        merged.splice(j, 1);
        didMerge = true;
        break;
      }
    }
  }
  return merged;
}
