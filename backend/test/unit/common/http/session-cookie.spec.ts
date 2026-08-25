import {
  SESSION_COOKIE,
  parseCookies,
  readSessionToken,
  sessionCookieOptions,
} from '@common/http/session-cookie';

describe('session-cookie', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseCookies', () => {
    it('returns an empty object for an absent header', () => {
      expect(parseCookies(undefined)).toEqual({});
    });

    it('returns an empty object for an empty header', () => {
      expect(parseCookies('')).toEqual({});
    });

    it('parses each cookie pair separated by semicolons', () => {
      expect(parseCookies('a=1; b=2')).toEqual({ a: '1', b: '2' });
    });

    it('trims whitespace around names and values', () => {
      expect(parseCookies(' a = 1 ; b=2 ')).toEqual({ a: '1', b: '2' });
    });

    it('skips parts without an equals sign', () => {
      expect(parseCookies('a=1; b; c=3')).toEqual({ a: '1', c: '3' });
    });

    it('skips parts with an empty name', () => {
      expect(parseCookies('=1; a=2')).toEqual({ a: '2' });
    });

    it('decodes percent-encoded values', () => {
      expect(parseCookies(`a=${encodeURIComponent('x y')}`)).toEqual({
        a: 'x y',
      });
    });

    it('keeps the raw value when a value has malformed percent-encoding', () => {
      expect(parseCookies('vrt_session=%')).toEqual({ vrt_session: '%' });
    });

    it('keeps parsing the remaining cookies after a malformed value', () => {
      expect(parseCookies('a=%; b=2')).toEqual({ a: '%', b: '2' });
    });

    it('last value wins for a duplicated name', () => {
      expect(parseCookies('a=1; a=2')).toEqual({ a: '2' });
    });
  });

  describe('readSessionToken', () => {
    it('returns the session cookie from a mixed header', () => {
      expect(
        readSessionToken(`other=1; ${SESSION_COOKIE}=tok123; foo=bar`),
      ).toBe('tok123');
    });

    it('returns undefined when the cookie header is absent', () => {
      expect(readSessionToken(undefined)).toBeUndefined();
    });

    it('returns undefined when the session cookie is missing', () => {
      expect(readSessionToken('other=1')).toBeUndefined();
    });

    it('returns undefined when the session cookie is empty', () => {
      expect(readSessionToken(`${SESSION_COOKIE}=`)).toBeUndefined();
    });

    it('does not throw on a malformed session cookie value', () => {
      expect(readSessionToken(`${SESSION_COOKIE}=%`)).toBe('%');
    });
  });

  describe('sessionCookieOptions', () => {
    it('builds Set-Cookie attributes', () => {
      const opts = sessionCookieOptions(false);
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
      expect(opts.secure).toBe(false);
    });

    it('sets Secure when requested', () => {
      expect(sessionCookieOptions(true).secure).toBe(true);
    });
  });
});
