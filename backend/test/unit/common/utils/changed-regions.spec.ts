import { extractChangedRegions } from '@common/utils/changed-regions';

// pixelmatch paints an unchanged pixel grey, a mismatch red and an ignored
// anti-aliased pixel yellow; the extractor must read exactly that convention.
const GREY = [136, 136, 136, 255] as const;
const RED = [255, 0, 0, 255] as const;
const YELLOW = [255, 255, 0, 255] as const;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function makeDiff(width: number, height: number): Uint8Array {
  const buffer = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < buffer.length; offset += 4) {
    buffer.set(GREY, offset);
  }
  return buffer;
}

function paint(
  buffer: Uint8Array,
  imageWidth: number,
  rect: Rect,
  colour: readonly number[] = RED,
): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      buffer.set(colour, (y * imageWidth + x) * 4);
    }
  }
}

describe('changed-regions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractChangedRegions', () => {
    it('returns nothing when no pixel differs', () => {
      const diff = makeDiff(64, 64);

      expect(extractChangedRegions(diff, 64, 64)).toEqual([]);
    });

    it('reports one region with its exact box and pixel count', () => {
      const diff = makeDiff(200, 100);
      paint(diff, 200, { x: 10, y: 20, width: 20, height: 20 });

      const regions = extractChangedRegions(diff, 200, 100);

      expect(regions).toEqual([
        { x: 10, y: 20, width: 20, height: 20, pixelCount: 400 },
      ]);
    });

    it('keeps changes far apart as separate regions', () => {
      const diff = makeDiff(200, 100);
      paint(diff, 200, { x: 10, y: 10, width: 10, height: 10 });
      paint(diff, 200, { x: 150, y: 70, width: 10, height: 10 });

      const regions = extractChangedRegions(diff, 200, 100);

      expect(regions).toHaveLength(2);
      expect(regions.map((region) => region.pixelCount)).toEqual([100, 100]);
      expect(regions.map((region) => [region.x, region.y])).toEqual([
        [10, 10],
        [150, 70],
      ]);
    });

    it('merges neighbours that belong to one intent', () => {
      const diff = makeDiff(200, 100);
      paint(diff, 200, { x: 10, y: 10, width: 10, height: 10 });
      paint(diff, 200, { x: 21, y: 10, width: 10, height: 10 });

      const regions = extractChangedRegions(diff, 200, 100);

      expect(regions).toEqual([
        { x: 10, y: 10, width: 21, height: 10, pixelCount: 200 },
      ]);
    });

    it('ignores anti-aliased pixels the engine excluded', () => {
      const diff = makeDiff(200, 100);
      paint(diff, 200, { x: 10, y: 10, width: 10, height: 10 }, YELLOW);

      expect(extractChangedRegions(diff, 200, 100)).toEqual([]);
    });

    it('counts exactly on a downsampled analysis of a large image', () => {
      const diff = makeDiff(2000, 1200);
      paint(diff, 2000, { x: 900, y: 600, width: 100, height: 80 });

      const regions = extractChangedRegions(diff, 2000, 1200, {
        analysisBudget: 100_000,
      });

      expect(regions).toHaveLength(1);
      expect(regions[0].pixelCount).toBe(8000);
      expect(regions[0].x).toBeLessThanOrEqual(900);
      expect(regions[0].y).toBeLessThanOrEqual(600);
      expect(regions[0].x + regions[0].width).toBeGreaterThanOrEqual(1000);
      expect(regions[0].y + regions[0].height).toBeGreaterThanOrEqual(680);
    });

    it('folds a region inside another region into it', () => {
      const diff = makeDiff(200, 120);
      paint(diff, 200, { x: 10, y: 10, width: 100, height: 2 });
      paint(diff, 200, { x: 10, y: 108, width: 100, height: 2 });
      paint(diff, 200, { x: 10, y: 10, width: 2, height: 100 });
      paint(diff, 200, { x: 108, y: 10, width: 2, height: 100 });
      paint(diff, 200, { x: 55, y: 50, width: 5, height: 5 });

      const regions = extractChangedRegions(diff, 200, 120);

      expect(regions).toHaveLength(1);
      expect(regions[0]).toMatchObject({
        x: 10,
        y: 10,
        width: 100,
        height: 100,
      });
      // the ring's 784 pixels plus the 25 nested ones it now covers
      expect(regions[0].pixelCount).toBe(809);
    });

    it('keeps the largest regions and drops the tail', () => {
      const diff = makeDiff(400, 200);
      paint(diff, 400, { x: 10, y: 10, width: 8, height: 8 });
      paint(diff, 400, { x: 100, y: 10, width: 6, height: 6 });
      paint(diff, 400, { x: 200, y: 10, width: 4, height: 4 });
      paint(diff, 400, { x: 300, y: 10, width: 2, height: 2 });

      const regions = extractChangedRegions(diff, 400, 200, { maxRegions: 3 });

      expect(regions.map((region) => region.pixelCount)).toEqual([64, 36, 16]);
    });

    it('returns nothing for an empty image', () => {
      expect(extractChangedRegions(new Uint8Array(0), 0, 0)).toEqual([]);
    });

    it('rejects a buffer that is smaller than the image', () => {
      expect(() => extractChangedRegions(new Uint8Array(16), 4, 4)).toThrow(
        /smaller than 4x4/,
      );
    });
  });
});
