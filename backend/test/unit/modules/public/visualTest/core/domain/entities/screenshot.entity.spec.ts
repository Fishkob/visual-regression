import { ScreenshotEntity } from '@public/visualTest/core/domain/entities/screenshot.entity';
import { DomainError } from '@common/domain/domain-error';
import { ScreenshotType } from '@public/visualTest/core/domain/types/visual-test.types';
import { Variant } from '@public/visualTest/core/domain/value-objects/variant.vo';
describe('ScreenshotEntity', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const validParams = {
    id: 'screenshot-1',
    visualTestId: 'vt-1',
    type: ScreenshotType.BASELINE,
    imageHash: 'abc123',
    imageUrl: 'http://storage/image.png',
    variant: Variant.fromStrings('1920x1080', 'Chrome', 'staging'),
    createdAt: new Date('2024-01-01'),
    pixelDiffThreshold: 0,
  };

  describe('constructor', () => {
    it('creates entity with valid params', () => {
      const entity = new ScreenshotEntity(validParams);

      expect(entity.id).toBe('screenshot-1');
      expect(entity.visualTestId).toBe('vt-1');
      expect(entity.type).toBe(ScreenshotType.BASELINE);
      expect(entity.imageHash).toBe('abc123');
      expect(entity.imageUrl).toBe('http://storage/image.png');
      expect(entity.viewport).toBe('1920x1080');
      expect(entity.browser).toBe('Chrome');
      expect(entity.environment).toBe('staging');
      expect(entity.createdAt).toEqual(new Date('2024-01-01'));
      expect(entity.pixelDiffThreshold).toBe(0);
    });

    it('throws when id is empty', () => {
      expect(() => new ScreenshotEntity({ ...validParams, id: '' })).toThrow(
        DomainError,
      );
    });

    it('throws when id is whitespace', () => {
      expect(() => new ScreenshotEntity({ ...validParams, id: '  ' })).toThrow(
        DomainError,
      );
    });

    it('throws when visualTestId is empty', () => {
      expect(
        () => new ScreenshotEntity({ ...validParams, visualTestId: '' }),
      ).toThrow(DomainError);
    });

    it('throws when imageHash is empty', () => {
      expect(
        () => new ScreenshotEntity({ ...validParams, imageHash: '' }),
      ).toThrow(DomainError);
    });

    it('throws when pixelDiffThreshold is negative', () => {
      expect(
        () => new ScreenshotEntity({ ...validParams, pixelDiffThreshold: -1 }),
      ).toThrow(DomainError);
    });

    it('throws when type is invalid', () => {
      expect(
        () =>
          new ScreenshotEntity({
            ...validParams,
            type: 'INVALID' as ScreenshotType,
          }),
      ).toThrow(DomainError);
    });
  });
});
