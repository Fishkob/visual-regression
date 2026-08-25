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
  return parseCookies(cookieHeader)[SESSION_COOKIE] || undefined;
}

export function sessionCookieOptions(secure: boolean): {
  httpOnly: boolean;
  sameSite: 'lax';
  path: '/';
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
  };
}
