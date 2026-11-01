export const SESSION_COOKIE = 'vrt_session';

export function parseCookies(
  header: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch (e) {
      if (e instanceof URIError) {
        out[name] = value;
      } else {
        throw e;
      }
    }
  }
  return out;
}

export function readSessionToken(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) return undefined;

  // Duplicate session cookies are ambiguous: a sibling subdomain can set its own
  // `vrt_session` and the browser sends both, with no ordering guarantee. The
  // request is treated as unauthenticated instead of trusting "last one wins".
  const values: string[] = [];
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== SESSION_COOKIE) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      values.push(decodeURIComponent(raw));
    } catch {
      values.push(raw);
    }
  }
  if (values.length !== 1) return undefined;
  return values[0] || undefined;
}

export function sessionCookieOptions(
  secure: boolean,
  maxAgeMs: number,
): {
  httpOnly: boolean;
  sameSite: 'lax';
  path: '/';
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    // Without Max-Age the browser treats the cookie as session-scoped and drops
    // it on restart while the row in the database lives for the full TTL — a
    // user would be logged out on every restart although the session is valid.
    maxAge: maxAgeMs,
  };
}
