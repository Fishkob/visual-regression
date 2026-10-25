import { S3Presigner } from '@internal/storage/services/s3-presigner';

const PRESIGNER = new S3Presigner({
  publicUrl: 'http://localhost:9000',
  accessKey: 'AKIAIOSFODNN7EXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
});

const FIXED_NOW = new Date('2026-10-25T12:00:00.000Z');

describe('S3Presigner', () => {
  it('produces the SigV4 query-string URL for a fixed request', () => {
    const url = PRESIGNER.presignGet(
      'vrt',
      'folder/baseline image.png',
      3600,
      FIXED_NOW,
    );

    expect(url).toBe(
      'http://localhost:9000/vrt/folder/baseline%20image.png' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20261025%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20261025T120000Z' +
        '&X-Amz-Expires=3600' +
        '&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=1b5b558785572d0df3dc74e08838e07b4d2fc22580c0ff27117c95391afedeab',
    );
  });

  it('clamps a non-positive lifetime to one second', () => {
    const url = PRESIGNER.presignGet('vrt', 'a.png', 0, FIXED_NOW);

    expect(url).toContain('X-Amz-Expires=1&');
  });

  it('clamps an excessive lifetime to the seven-day SigV4 maximum', () => {
    const url = PRESIGNER.presignGet('vrt', 'a.png', 10_000_000, FIXED_NOW);

    expect(url).toContain('X-Amz-Expires=604800&');
  });

  it('keeps a path prefix from the public base URL', () => {
    const presigner = new S3Presigner({
      publicUrl: 'https://cdn.example.com/storage/',
      accessKey: 'key',
      secretKey: 'secret',
    });

    const url = presigner.presignGet('vrt', 'a.png', 60, FIXED_NOW);

    expect(url.startsWith('https://cdn.example.com/storage/vrt/a.png?')).toBe(
      true,
    );
  });
});
