// A share link is a bearer credential carried in the path
// (`POST /api/v1/public/shares/<token>`). Logging the raw URL puts a working
// read credential into every request line — including the warn line a wrong
// passphrase produces, which is exactly what an attacker probing a leaked link
// generates. The path segment is replaced before anything is logged.
const SHARE_TOKEN_PATH = /(\/public\/shares\/)([^/?#]+)/g;

export function redactUrl(url: string): string {
  return url.replace(SHARE_TOKEN_PATH, '$1[REDACTED]');
}
