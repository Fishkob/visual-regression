import type { Request } from 'express';

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
  };
}
