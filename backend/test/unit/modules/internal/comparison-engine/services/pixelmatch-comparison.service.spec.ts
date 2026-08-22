import { PNG } from 'pngjs';
import { PixelmatchComparisonService } from '@internal/comparison-engine/services/pixelmatch-comparison.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { DomainError } from '@common/domain/domain-error';
import { createMockLogger } from '@test/utils/mocks';
describe('PixelmatchComparisonService', () => {
  let service: PixelmatchComparisonService;
  let mockLogger: jest.Mocked<AppLoggerService>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    service = new PixelmatchComparisonService(mockLogger);
  });

  const createPngBuffer = (width: number, height: number, color: number) => {
    const png = new PNG({ width, height });
    png.data.fill(color);
    return PNG.sync.write(png);
  };

  it('should return 0 mismatched pixels for identical images', async () => {
    const buffer = createPngBuffer(10, 10, 255);

    const result = await service.compare(buffer, buffer);

    expect(result).toMatchObject({ kind: 'image', mismatchPixelCount: 0 });
    expect(result.diffOutput).toBeInstanceOf(Buffer);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Comparison completed'),
      expect.objectContaining({ mismatchPixelCount: 0 }),
    );
  });

  it('should throw for different dimensions', async () => {
    const imgA = createPngBuffer(10, 10, 255);
    const imgB = createPngBuffer(12, 12, 255);

    await expect(service.compare(imgA, imgB)).rejects.toThrow(
      'Image dimensions do not match',
    );
  });

  it('should throw a DomainError for different dimensions', async () => {
    const imgA = createPngBuffer(10, 10, 255);
    const imgB = createPngBuffer(12, 12, 255);

    await expect(service.compare(imgA, imgB)).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it('should throw for invalid PNG buffer', async () => {
    await expect(
      service.compare(Buffer.from('not-a-png'), Buffer.from('not-a-png')),
    ).rejects.toThrow();
  });
});
