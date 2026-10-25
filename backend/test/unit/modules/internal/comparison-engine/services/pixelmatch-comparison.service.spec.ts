import type { Mocked } from 'vitest';
import { PNG } from 'pngjs';
import { PixelmatchComparisonService } from '@internal/comparison-engine/services/pixelmatch-comparison.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { DomainError } from '@common/domain/domain-error';
import { createMockLogger } from '@test/utils/mocks';
describe('PixelmatchComparisonService', () => {
  let service: PixelmatchComparisonService;
  let mockLogger: Mocked<AppLoggerService>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    service = new PixelmatchComparisonService(mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createPngBuffer = (width: number, height: number, color: number) => {
    const png = new PNG({ width, height });
    png.data.fill(color);
    return PNG.sync.write(png);
  };

  // Signature + IHDR header only: enough to declare dimensions, not enough to
  // decode. The service must bound the dimensions before it ever decodes.
  const createPngHeader = (width: number, height: number): Buffer => {
    const header = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(
      header,
      0,
    );
    header.writeUInt32BE(13, 8);
    header.write('IHDR', 12, 'ascii');
    header.writeUInt32BE(width, 16);
    header.writeUInt32BE(height, 20);
    return header;
  };

  it('returns 0 mismatched pixels for identical images', async () => {
    const buffer = createPngBuffer(10, 10, 255);

    const result = await service.compare(buffer, buffer);

    expect(result).toMatchObject({ kind: 'image', mismatchPixelCount: 0 });
    expect(result.diffOutput).toBeInstanceOf(Buffer);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Comparison completed'),
      expect.objectContaining({ mismatchPixelCount: 0 }),
    );
  });

  it('throws for different dimensions', async () => {
    const imgA = createPngBuffer(10, 10, 255);
    const imgB = createPngBuffer(12, 12, 255);

    await expect(service.compare(imgA, imgB)).rejects.toThrow(
      'Image dimensions do not match',
    );
  });

  it('resizes the candidate when the policy is RESIZE', async () => {
    const expected = createPngBuffer(10, 10, 255);
    const actual = createPngBuffer(14, 8, 255);

    const result = await service.compare(expected, actual, {
      sizePolicy: 'RESIZE',
    });

    expect(result.mismatchPixelCount).toBe(0);
  });

  it('crops the candidate when the policy is CROP', async () => {
    const expected = createPngBuffer(10, 10, 255);
    const actual = createPngBuffer(20, 20, 255);

    const result = await service.compare(expected, actual, {
      sizePolicy: 'CROP',
    });

    expect(result.mismatchPixelCount).toBe(0);
  });

  it('pads the candidate when the policy is PAD', async () => {
    const expected = createPngBuffer(10, 10, 255);
    const actual = createPngBuffer(4, 8, 255);

    const result = await service.compare(expected, actual, {
      sizePolicy: 'PAD',
    });

    expect(result.mismatchPixelCount).toBeGreaterThan(0);
  });

  it('throws a DomainError for different dimensions', async () => {
    const imgA = createPngBuffer(10, 10, 255);
    const imgB = createPngBuffer(12, 12, 255);

    await expect(service.compare(imgA, imgB)).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it('throws for invalid PNG buffer', async () => {
    await expect(
      service.compare(Buffer.from('not-a-png'), Buffer.from('not-a-png')),
    ).rejects.toThrow();
  });

  it('rejects an oversized image header before decoding it', async () => {
    const oversized = createPngHeader(10_000, 10_000);

    await expect(service.compare(oversized, oversized)).rejects.toThrow(
      /Image too large: 10000x10000/,
    );
    await expect(service.compare(oversized, oversized)).rejects.toMatchObject({
      name: 'DomainError',
      code: 'BAD_REQUEST',
    });
  });

  it('rejects a header-only PNG that cannot be decoded', async () => {
    const headerOnly = createPngHeader(10, 10);

    await expect(service.compare(headerOnly, headerOnly)).rejects.toThrow(
      'Invalid PNG image',
    );
    await expect(
      service.compare(headerOnly, headerOnly),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
