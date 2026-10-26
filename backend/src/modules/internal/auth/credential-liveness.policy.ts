// "May this credential still be used?" — one rule, two shapes: a browser
// session and an API key. The guard and the key service used to spell the same
// comparison out twice with different code (`!revokedAt && expiresAt > now` in
// both), and `AuthRepository.listSessions` spells it a third time in SQL, which
// cannot call a function. This module owns the JavaScript half; the SQL twin is
// a query-level concern and stays where the query is, next to this rule's
// definition of "live".
//
// An API key may be non-expiring (`expiresAt: null`); a session may not.

export interface RevocableCredential {
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export function isCredentialLive(
  credential: RevocableCredential,
  now: Date = new Date(),
): boolean {
  if (credential.revokedAt) return false;
  if (credential.expiresAt === null) return true;
  return credential.expiresAt.getTime() > now.getTime();
}
