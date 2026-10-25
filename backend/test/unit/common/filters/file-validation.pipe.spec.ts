import { FileValidationPipe } from '@/common/http/pipes/file-validation.pipe';
import { BadRequestException } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { MAX_IMAGE_PIXELS } from '@config/upload-limits';

describe('FileValidationPipe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const MAX_SIZE = 5 * 1024 * 1024;
  const pipe = new FileValidationPipe({
    screenshotMaxSize: MAX_SIZE,
  } as AppConfigService);

  // A PNG signature plus a complete IHDR chunk header is all the pipe reads; the
  // payload after it is never inspected.
  function pngFile(
    width: number,
    height: number,
    chunk: { length?: number; type?: string } = {},
  ): Express.Multer.File {
    const header = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(
      header,
      0,
    );
    header.writeUInt32BE(chunk.length ?? 13, 8);
    header.write(chunk.type ?? 'IHDR', 12, 'ascii');
    header.writeUInt32BE(width, 16);
    header.writeUInt32BE(height, 20);
    return {
      mimetype: 'image/png',
      size: 1000,
      buffer: Buffer.concat([header, Buffer.alloc(100)]),
    } as unknown as Express.Multer.File;
  }

  it('accepts a valid PNG', () => {
    const file = pngFile(800, 600);

    expect(pipe.transform(file)).toBe(file);
  });

  it('accepts a PNG with exactly the maximum pixel count', () => {
    const file = pngFile(4000, 4000);

    expect(pipe.transform(file)).toBe(file);
    expect(4000 * 4000).toBe(MAX_IMAGE_PIXELS);
  });

  it('rejects missing file', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });

  it('rejects wrong mime type', () => {
    const file = {
      mimetype: 'text/plain',
      size: 1000,
    } as Express.Multer.File;
    expect(() => pipe.transform(file)).toThrow(/Invalid mime type/);
  });

  it('rejects image/jpeg even though a valid image type', () => {
    const file = {
      mimetype: 'image/jpeg',
      size: 1000,
      buffer: Buffer.alloc(100),
    } as unknown as Express.Multer.File;
    expect(() => pipe.transform(file)).toThrow(/Invalid mime type/);
  });

  it('rejects image/webp even though a valid image type', () => {
    const file = {
      mimetype: 'image/webp',
      size: 1000,
      buffer: Buffer.alloc(100),
    } as unknown as Express.Multer.File;
    expect(() => pipe.transform(file)).toThrow(/Invalid mime type/);
  });

  it('rejects file too large', () => {
    const file = {
      mimetype: 'image/png',
      size: MAX_SIZE + 1,
    } as Express.Multer.File;
    expect(() => pipe.transform(file)).toThrow(/File too large/);
  });

  it('rejects PNG when buffer is too small', () => {
    const file = {
      mimetype: 'image/png',
      size: 500,
      buffer: Buffer.alloc(4), // zu klein
    } as unknown as Express.Multer.File;

    expect(() => pipe.transform(file)).toThrow('Invalid PNG: buffer too small');
  });

  it('rejects PNG when signature is invalid', () => {
    const invalidHeader = Buffer.from([
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
    ]);
    const file = {
      mimetype: 'image/png',
      size: 1000,
      buffer: Buffer.concat([invalidHeader, Buffer.alloc(100)]),
    } as unknown as Express.Multer.File;

    expect(() => pipe.transform(file)).toThrow('Invalid PNG signature');
  });

  it('rejects a PNG with a zero dimension', () => {
    expect(() => pipe.transform(pngFile(0, 600))).toThrow(
      'Invalid PNG: missing or invalid IHDR',
    );
  });

  it('rejects a PNG whose IHDR type is missing', () => {
    expect(() => pipe.transform(pngFile(800, 600, { type: 'IDAT' }))).toThrow(
      'Invalid PNG: missing or invalid IHDR',
    );
  });

  it('rejects a PNG whose IHDR chunk length is wrong', () => {
    expect(() => pipe.transform(pngFile(800, 600, { length: 12 }))).toThrow(
      'Invalid PNG: missing or invalid IHDR',
    );
  });

  it('rejects a PNG over the pixel limit', () => {
    expect(() => pipe.transform(pngFile(4001, 4000))).toThrow(
      `Image too large: 4001x4000. Maximum is ${MAX_IMAGE_PIXELS} pixels`,
    );
  });

  it('rejects PDF with invalid signature', () => {
    const file = {
      mimetype: 'application/pdf',
      size: 1000,
      buffer: Buffer.from('NOTPDF'),
    } as unknown as Express.Multer.File;

    expect(() => pipe.transform(file)).toThrow('Invalid PDF signature');
  });
});
