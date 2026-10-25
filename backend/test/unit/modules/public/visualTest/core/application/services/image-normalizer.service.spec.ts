import sharp from 'sharp';
import { ImageNormalizer } from '@public/visualTest/core/application/services/image-normalizer.service';
import { DomainError } from '@common/domain/domain-error';

describe('ImageNormalizer', () => {
  const normalizer = new ImageNormalizer();

  it('converts JPEG to PNG', async () => {
    const jpeg = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();

    const png = await normalizer.toPng(jpeg);

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('converts WebP to PNG', async () => {
    const webp = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .webp()
      .toBuffer();

    const png = await normalizer.toPng(webp);

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('rejects a non-image buffer', async () => {
    await expect(normalizer.toPng(Buffer.from('nope'))).rejects.toBeInstanceOf(
      DomainError,
    );
  });
});
