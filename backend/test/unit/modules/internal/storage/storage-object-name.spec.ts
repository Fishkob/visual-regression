import { StorageObjectName } from '@internal/storage/services/storage-object-name';

describe('StorageObjectName', () => {
  function createObjectNames() {
    const appConfig = {
      minio: {
        bucket: 'screenshots',
        publicUrl: 'http://localhost:9000',
      },
    };
    return new StorageObjectName(appConfig as never);
  }

  it('builds a public URL from an object name', () => {
    expect(createObjectNames().toPublicUrl('pdfs/page.png')).toBe(
      'http://localhost:9000/screenshots/pdfs/page.png',
    );
  });

  it('extracts the object name from a public URL', () => {
    expect(
      createObjectNames().fromUrl(
        'http://localhost:9000/screenshots/pdfs/page.png',
      ),
    ).toBe('pdfs/page.png');
  });

  it('returns null when the URL does not belong to the bucket', () => {
    expect(
      createObjectNames().fromUrl('http://other-host/screenshots/page.png'),
    ).toBeNull();
  });

  it('percent-encodes URL-hostile characters in each path segment', () => {
    expect(createObjectNames().toPublicUrl('dir/a b#c?d%e.png')).toBe(
      'http://localhost:9000/screenshots/dir/a%20b%23c%3Fd%25e.png',
    );
  });

  it('preserves / as a key separator while encoding segments', () => {
    const name = 'pdf-render/abc-123/pagecount';
    const url = createObjectNames().toPublicUrl(name);
    expect(url).toBe(
      'http://localhost:9000/screenshots/pdf-render/abc-123/pagecount',
    );
    expect(createObjectNames().fromUrl(url)).toBe(name);
  });

  it('round-trips encoded object names back to the exact key', () => {
    const objectNames = createObjectNames();
    const name = 'dir/a b#c?d%e.png';
    const url = objectNames.toPublicUrl(name);
    expect(objectNames.fromUrl(url)).toBe(name);
  });

  it('normalizes a trailing slash on the configured publicUrl', () => {
    const objectNames = new StorageObjectName({
      minio: {
        bucket: 'screenshots',
        publicUrl: 'http://localhost:9000/',
      },
    } as never);

    const url = objectNames.toPublicUrl('page.png');
    expect(url).toBe('http://localhost:9000/screenshots/page.png');
    expect(objectNames.fromUrl(url)).toBe('page.png');
  });

  it('returns null for a URL with malformed percent-encoding', () => {
    expect(
      createObjectNames().fromUrl(
        'http://localhost:9000/screenshots/dir/%zz.png',
      ),
    ).toBeNull();
  });
});
