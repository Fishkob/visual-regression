import { collectDiffUrls } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';

describe('collectDiffUrls', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns non-empty image and pdf diff urls', () => {
    const result = collectDiffUrls([
      { diffImageUrl: 'http://storage/a.png', diffPdfUrl: null },
      { diffImageUrl: null, diffPdfUrl: 'http://storage/b.pdf' },
    ]);

    expect(result).toEqual(['http://storage/a.png', 'http://storage/b.pdf']);
  });

  it('filters empty-string placeholders (PDF comparisons persist "")', () => {
    const result = collectDiffUrls([
      { diffImageUrl: '', diffPdfUrl: 'http://storage/b.pdf' },
    ]);

    expect(result).toEqual(['http://storage/b.pdf']);
  });

  it('filters null and empty diff urls', () => {
    const result = collectDiffUrls([
      { diffImageUrl: '', diffPdfUrl: null },
      { diffImageUrl: null, diffPdfUrl: '' },
    ]);

    expect(result).toEqual([]);
  });

  it('returns empty for an empty row list', () => {
    expect(collectDiffUrls([])).toEqual([]);
  });
});
