// One contiguous area of the diff, in the comparison image's pixel space. The
// reviewer sees these as numbered boxes and jumps between them, so a region is
// a place to look, not a per-pixel record: `pixelCount` is the exact number of
// mismatched pixels inside the box, which is why the numbers stay comparable
// with the comparison's mismatchPixelCount.
export interface ChangedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelCount: number;
}
