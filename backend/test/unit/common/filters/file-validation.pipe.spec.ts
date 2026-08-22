import { FileValidationPipe } from '@/common/http/pipes/file-validation.pipe';
import { BadRequestException } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';

describe('FileValidationPipe', () => {
  const MAX_SIZE = 5 * 1024 * 1024;
  const pipe = new FileValidationPipe({
    screenshotMaxSize: MAX_SIZE,
  } as AppConfigService);

  it('accepts a valid PNG', () => {
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const file = {
      mimetype: 'image/png',
      size: 1000,
      buffer: Buffer.concat([pngHeader, Buffer.alloc(100)]),
    } as unknown as Express.Multer.File;

    expect(pipe.transform(file)).toBe(file);
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
      buffer: Buffer.alloc(4), // 👈 zu klein
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

  it('rejects PDF with invalid signature', () => {
    const file = {
      mimetype: 'application/pdf',
      size: 1000,
      buffer: Buffer.from('NOTPDF'),
    } as unknown as Express.Multer.File;

    expect(() => pipe.transform(file)).toThrow('Invalid PDF signature');
  });
});
