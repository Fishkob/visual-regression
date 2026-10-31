import { assertSafeWebhookUrl } from '@internal/webhooks/webhook-url';

describe('assertSafeWebhookUrl', () => {
  it('accepts a public https URL', () => {
    const url = assertSafeWebhookUrl('https://hooks.example.com/services/x');
    expect(url.hostname).toBe('hooks.example.com');
  });

  it('allows private RFC1918 targets (self-hosted deployments)', () => {
    expect(assertSafeWebhookUrl('http://10.1.2.3/hook').hostname).toBe(
      '10.1.2.3',
    );
    expect(assertSafeWebhookUrl('http://192.168.0.10:8080/hook').port).toBe(
      '8080',
    );
  });

  it('rejects non-http protocols', () => {
    expect(() => assertSafeWebhookUrl('ftp://example.com/hook')).toThrow(
      'must use http or https',
    );
  });

  it('rejects embedded credentials', () => {
    expect(() =>
      assertSafeWebhookUrl('https://user:pass@example.com/hook'),
    ).toThrow('must not contain credentials');
  });

  it.each([
    'http://localhost/hook',
    'http://foo.localhost/hook',
    'http://127.0.0.1/hook',
    'http://0.0.0.0/hook',
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.100.200/hook',
    'http://metadata.google.internal/computeMetadata/v1',
    'http://[::1]/hook',
    'http://[fe80::1]/hook',
    // WHATWG normalizes the mapped forms to hex, so the old dotted-tail check
    // missed every one of them (each was reachable before the fix).
    'http://[::ffff:127.0.0.1]:3000/hook',
    'http://[::ffff:169.254.169.254]/latest/meta-data',
    'http://[::ffff:7f00:1]/hook',
    'http://[::ffff:0:7f00:1]/hook',
    'http://[::7f00:1]/hook',
  ])('rejects the loopback/metadata target %s', (url) => {
    expect(() => assertSafeWebhookUrl(url)).toThrow('is not allowed');
  });

  it('rejects an unparsable URL', () => {
    expect(() => assertSafeWebhookUrl('not a url')).toThrow('not a valid URL');
  });
});
