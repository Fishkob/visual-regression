import type { Request } from 'express';
import type { ProjectScope } from '@common/domain/project-scope';

// The authenticated principal attached to a request by the global
// AuthenticationGuard. Both auth paths (session cookie and api key) set it.
export interface AuthenticatedRequest extends Request {
  auth?: {
    username: string;
    userId?: string;
    sessionId?: string;
    role: 'ADMIN' | 'MEMBER' | 'VIEWER';
    mustChangePassword?: boolean;
    apiKeyId?: string;
    scopes?: string[];
    projectIds?: string[];
    // Resolved by the guard on every authenticated request (ADR-082). Read it
    // through `requireProjectScope` so a route cannot silently see "unset" and
    // treat it as "all".
    projectScope?: ProjectScope;
  };
}
