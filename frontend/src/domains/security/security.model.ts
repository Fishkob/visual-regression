// One signed-in browser session. `isCurrent` marks the session the request was
// made with — the list never offers to revoke it, "log out others" excludes it.
export interface Session {
  id: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}
