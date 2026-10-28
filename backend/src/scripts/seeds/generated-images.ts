import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { deflateSync } from 'node:zlib';

// The demo screenshots are generated instead of committed as binary fixtures:
// the diff size is the only thing that distinguishes them, so drawing the
// accent block from a parameter keeps the mismatch counts varied and readable
// (a real project shows 12 px, 240 px and 3 000 px changes, not five times the
// same 157 px text diff).
const WIDTH = 800;
const HEIGHT = 500;

type Rgb = readonly [number, number, number];

const WHITE: Rgb = [248, 250, 252];
const INK: Rgb = [15, 23, 42];
const MUTED: Rgb = [203, 213, 225];
const ACCENT: Rgb = [37, 99, 235];
const DANGER: Rgb = [220, 38, 38];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

class Canvas {
  private readonly pixels: Buffer;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.pixels = Buffer.alloc(width * height * 3);
    this.fill(0, 0, width, height, WHITE);
  }

  fill(x: number, y: number, w: number, h: number, color: Rgb): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    for (let row = y0; row < y1; row++) {
      for (let col = x0; col < x1; col++) {
        const offset = (row * this.width + col) * 3;
        this.pixels[offset] = color[0];
        this.pixels[offset + 1] = color[1];
        this.pixels[offset + 2] = color[2];
      }
    }
  }

  toPng(): Buffer {
    const stride = this.width * 3;
    const raw = Buffer.alloc((stride + 1) * this.height);
    for (let row = 0; row < this.height; row++) {
      const from = row * stride;
      const to = row * (stride + 1);
      raw[to] = 0; // filter: none
      this.pixels.copy(raw, to + 1, from, from + stride);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', deflateSync(raw, { level: 9 })),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// A page-like shell: header, sidebar and a few content rows. The optional
// accent block is the change the reviewer is meant to find; its width scales
// with `accentWidth`, so each seeded test reports a different mismatch count.
function drawScreenshot(accentWidth?: number): Canvas {
  const canvas = new Canvas(WIDTH, HEIGHT);
  canvas.fill(0, 0, WIDTH, 48, INK);
  canvas.fill(24, 18, 140, 12, WHITE);
  canvas.fill(WIDTH - 200, 18, 176, 12, MUTED);

  canvas.fill(0, 48, 180, HEIGHT - 48, MUTED);
  for (let i = 0; i < 6; i++) {
    canvas.fill(24, 80 + i * 44, 132, 14, WHITE);
  }

  canvas.fill(220, 80, 300, 20, INK);
  canvas.fill(220, 116, 540, 10, MUTED);
  canvas.fill(220, 134, 460, 10, MUTED);

  for (let i = 0; i < 4; i++) {
    canvas.fill(220, 176 + i * 56, 540, 38, WHITE);
    canvas.fill(236, 190 + i * 56, 180, 10, MUTED);
    canvas.fill(236, 206 + i * 56, 96, 8, MUTED);
  }

  if (accentWidth !== undefined) {
    canvas.fill(220, 176, accentWidth, 210, ACCENT);
    canvas.fill(220 + accentWidth + 8, 176, 6, 210, DANGER);
  }

  return canvas;
}

export interface SeedImages {
  baseline: string;
  /** One candidate per demo test; the accent block grows with the index. */
  candidates: string[];
}

export function createSeedImages(count = 12): SeedImages {
  const dir = mkdtempSync(path.join(tmpdir(), 'vrt-seed-images-'));
  const baselinePath = path.join(dir, 'baseline.png');
  writeFileSync(baselinePath, drawScreenshot().toPng());

  const candidates: string[] = [];
  for (let index = 0; index < count; index++) {
    const candidatePath = path.join(dir, `candidate-${index}.png`);
    // 60 px … 300 px wide: a small copy fix up to a layout-wide regression.
    writeFileSync(candidatePath, drawScreenshot(60 + index * 20).toPng());
    candidates.push(candidatePath);
  }

  return { baseline: baselinePath, candidates };
}
