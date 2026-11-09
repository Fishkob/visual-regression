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

  it('replaces an invite token with a placeholder and keeps the reveal suffix', () => {
    expect(redactUrl('/api/v1/public/user-invites/abcDEF123')).toBe(
      '/api/v1/public/user-invites/[REDACTED]',
    );
    expect(redactUrl('/api/v1/public/user-invites/abcDEF123/reveal?x=1')).toBe(
      '/api/v1/public/user-invites/[REDACTED]/reveal?x=1',
    );
  });

  it('leaves ordinary URLs untouched', () => {
    expect(redactUrl('/api/v1/projects/shop/review')).toBe(
      '/api/v1/projects/shop/review',
    );
    expect(redactUrl('/api/v1/public/shares')).toBe('/api/v1/public/shares');
    expect(redactUrl('/api/v1/public/user-invites')).toBe(
      '/api/v1/public/user-invites',
    );
  });

  it('stops at a query string or fragment', () => {
    expect(redactUrl('/public/shares/token#frag')).toBe(
      '/public/shares/[REDACTED]#frag',
    );
  });

  it('replaces a presigned signature in the query string', () => {
    expect(
      redactUrl(
        '/api/v1/projects/shop/tests/checkout/pdf-render?key=a%2Fb.png&X-Amz-Signature=deadbeef&X-Amz-Credential=AKIA%2F20261107',
      ),
    ).toBe(
      '/api/v1/projects/shop/tests/checkout/pdf-render?key=a%2Fb.png&X-Amz-Signature=[REDACTED]&X-Amz-Credential=[REDACTED]',
    );
  });

  it('replaces a whole presigned URL passed as a parameter', () => {
    expect(
      redactUrl(
        '/api/v1/projects/shop/pdf?pdfUrl=https%3A%2F%2Fstore%2Fk%3FX-Amz-Signature%3Dabc',
      ),
    ).toBe('/api/v1/projects/shop/pdf?pdfUrl=[REDACTED]');
  });

  it('is case-insensitive about the signature parameter', () => {
    expect(redactUrl('/x?x-amz-signature=abc&page=2')).toBe(
      '/x?x-amz-signature=[REDACTED]&page=2',
    );
  });

  it('keeps an ordinary query string readable', () => {
    expect(redactUrl('/api/v1/review?page=2&status=pending')).toBe(
      '/api/v1/review?page=2&status=pending',
    );
  });
});
