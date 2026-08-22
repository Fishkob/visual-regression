import { toScreenshotEntity } from '@public/visualTest/core/infrastructure/mappers/screenshot.mapper';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';

describe('screenshot.mapper', () => {
  describe('toScreenshotEntity', () => {
    const prisma = {
      id: 'ss-1',
      testId: 'test-1',
      type: 'BASELINE',
      imageHash: 'hash123',
      imageUrl: 'http://storage/base.png',
      pageCount: 8,
      pixelDiffThreshold: 25,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const variant = Variant.fromStrings('1920x1080', 'chrome', 'staging');

    it('maps a Prisma row to a ScreenshotEntity', () => {
      const entity = toScreenshotEntity(prisma, variant);

      expect(entity.id).toBe('ss-1');
      expect(entity.visualTestId).toBe('test-1');
      expect(entity.type).toBe('BASELINE');
      expect(entity.imageHash).toBe('hash123');
      expect(entity.imageUrl).toBe('http://storage/base.png');
      expect(entity.pageCount).toBe(8);
      expect(entity.pixelDiffThreshold).toBe(25);
      expect(entity.createdAt).toEqual(prisma.createdAt);
      expect(entity.variant).toBe(variant);
      expect(entity.viewport).toBe('1920x1080');
    });

    it('maps a null pageCount through', () => {
      const entity = toScreenshotEntity(
        { ...prisma, pageCount: null },
        variant,
      );

      expect(entity.pageCount).toBeNull();
    });
  });
});
