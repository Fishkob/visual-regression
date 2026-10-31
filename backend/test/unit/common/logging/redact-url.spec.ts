import { redactUrl } from '@common/logging/redact-url';

describe('redactUrl', () => {
  it('replaces a share link token with a placeholder', () => {
    expect(redactUrl('/api/v1/public/shares/abcDEF123?x=1')).toBe(
      '/api/v1/public/shares/[REDACTED]?x=1',
    );
  });

  it('replaces every share token in a URL', () => {
    expect(
      redactUrl('/api/v1/public/shares/first/echo/public/shares/second'),
    ).toBe('/api/v1/public/shares/[REDACTED]/echo/public/shares/[REDACTED]');
  });

  it('leaves ordinary URLs untouched', () => {
    expect(redactUrl('/api/v1/projects/shop/review')).toBe(
      '/api/v1/projects/shop/review',
    );
    expect(redactUrl('/api/v1/public/shares')).toBe('/api/v1/public/shares');
  });

  it('stops at a query string or fragment', () => {
    expect(redactUrl('/public/shares/token#frag')).toBe(
      '/public/shares/[REDACTED]#frag',
    );
  });
});
