// A share link is a bearer credential carried in the path
// (`POST /api/v1/public/shares/<token>`). Logging the raw URL puts a working
// read credential into every request line — including the warn line a wrong
// passphrase produces, which is exactly what an attacker probing a leaked link
// generates. The path segment is replaced before anything is logged.
const SHARE_TOKEN_PATH = /(\/public\/shares\/)([^/?#]+)/g;

// A presigned object URL is the other bearer credential that reaches a log line:
// the signature alone reads the screenshot or PDF until it expires (an hour by
// default, up to seven days). `pdf-render?pdfUrl=<presigned>` carries one inside
// the query, so both the parameter that takes a whole URL and the SigV4
// credential parameters are replaced by name.
const PRESIGNED_QUERY =
  /([?&](?:X-Amz-(?:Signature|Credential|Security-Token)|pdfUrl)=)[^&#]*/gi;

export function redactUrl(url: string): string {
  return url
    .replace(SHARE_TOKEN_PATH, '$1[REDACTED]')
    .replace(PRESIGNED_QUERY, '$1[REDACTED]');
}
