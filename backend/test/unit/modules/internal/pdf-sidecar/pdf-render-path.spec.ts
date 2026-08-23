import {
  pdfBaseName,
  pdfRenderBasePath,
  pdfRenderCacheBaseName,
  pdfRenderCachePrefix,
  pdfRenderPageCountPath,
  pdfRenderPagePath,
  pdfSourceObjectName,
} from '@internal/pdf-sidecar/pdf-render-path';

describe('pdfRenderPath', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds the base path for a base name', () => {
    expect(pdfRenderBasePath('login-form')).toBe('pdf-render/login-form');
  });

  it('builds the page-count object path', () => {
    expect(pdfRenderPageCountPath('login-form')).toBe(
      'pdf-render/login-form/pagecount',
    );
  });

  it('builds the cache prefix for eviction', () => {
    expect(pdfRenderCachePrefix('login-form')).toBe('pdf-render/login-form/');
  });

  it('builds a rendered page path', () => {
    expect(pdfRenderPagePath('login-form', 2, 1)).toBe(
      'pdf-render/login-form/2/page-1.png',
    );
  });

  it('reconstructs the source PDF object name for a base name', () => {
    expect(pdfSourceObjectName('login-form')).toBe('login-form.pdf');
  });

  it('round-trips with pdfBaseName', () => {
    expect(pdfBaseName(pdfSourceObjectName('login-form'))).toBe('login-form');
    expect(pdfSourceObjectName(pdfBaseName('login-form.pdf'))).toBe(
      'login-form.pdf',
    );
  });

  it('recovers the base name from a render-cache object name', () => {
    expect(pdfRenderCacheBaseName('pdf-render/login-form/pagecount')).toBe(
      'login-form',
    );
    expect(pdfRenderCacheBaseName('pdf-render/login-form/2/page-1.png')).toBe(
      'login-form',
    );
  });

  it('returns null for object names outside the render namespace', () => {
    expect(pdfRenderCacheBaseName('screenshots/abc.pdf')).toBeNull();
    expect(pdfRenderCacheBaseName('pdf-render/')).toBeNull();
  });
});
